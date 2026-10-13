//! Encrypted attachments and the `journal://` protocol that serves them.
//!
//! Uploads are *staged* in memory until the post that references them is
//! saved, so abandoned drafts never leave files behind. Saved media live in
//! `media/<uuid>.enc` (see `record::encode_blob`).
//!
//! The webview loads media from `journal://localhost/<id>` (or
//! `http://journal.localhost/<id>` on Windows). The handler decrypts the blob
//! into a bounded in-memory cache and answers HTTP `Range` requests, which
//! video seeking needs. Decrypted bytes never touch the disk, responses are
//! marked `no-store`, and the cache is dropped and zeroized on lock.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use tauri::http::{header, Request, Response, StatusCode};
use zeroize::Zeroizing;

use crate::commands::AppState;
use crate::error::{Error, Result};
use crate::model::MediaKind;

pub const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_VIDEO_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_MEDIA_PER_POST: usize = 20;
pub const MAX_MEDIA_PER_ALBUM: usize = 500;
/// Upper bound on decrypted media kept in memory.
const CACHE_BUDGET_BYTES: usize = 256 * 1024 * 1024;

pub type Bytes = Arc<Zeroizing<Vec<u8>>>;

/// JPEG quality for resized photos: no visible loss at normal viewing sizes.
const PHOTO_QUALITY: u8 = 85;

/// Long-side sizes a page can choose for its product photos (0 keeps originals).
pub const PHOTO_SIZES: [u32; 6] = [0, 2048, 1600, 1280, 1080, 720];

/// Re-encodes a photo as JPEG that fits in `max` × `max` pixels, honouring
/// the camera's rotation and dropping metadata (EXIF, location). `None` when
/// that wouldn't make it smaller, or for formats kept as they are (GIF, HEIC,
/// AVIF, video), so callers keep the original.
pub fn fit_photo(bytes: &[u8], max: u32) -> Option<Vec<u8>> {
    use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, ImageDecoder, ImageReader};
    let mime = match sniff(bytes) {
        Some((MediaKind::Image, mime @ ("image/jpeg" | "image/png" | "image/webp"))) if max > 0 => mime,
        _ => return None,
    };
    let mut decoder = ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format().ok()?.into_decoder().ok()?;
    let orientation = decoder.orientation().ok();
    let mut img = DynamicImage::from_decoder(decoder).ok()?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    if img.width().max(img.height()) > max {
        img = img.resize(max, max, FilterType::Lanczos3);
    } else if mime == "image/jpeg" {
        // Already fits: re-encoding would only lose quality, every time it ran.
        return None;
    }
    // JPEG has no transparency: flatten onto white, like a product shot.
    let rgb = if img.color().has_alpha() {
        let mut rgba = img.to_rgba8();
        for p in rgba.pixels_mut() {
            let a = p[3] as u32;
            for c in 0..3 {
                p[c] = ((p[c] as u32 * a + 255 * (255 - a)) / 255) as u8;
            }
        }
        DynamicImage::ImageRgba8(rgba).to_rgb8()
    } else {
        img.to_rgb8()
    };
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, PHOTO_QUALITY).encode_image(&rgb).ok()?;
    (out.len() < bytes.len()).then_some(out)
}

/// `photo.png` -> `photo.jpg`, after re-encoding.
pub fn jpeg_name(name: &str) -> String {
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
    format!("{stem}.jpg")
}

/// Identifies the file type from its magic bytes; the client-declared type is ignored.
pub fn sniff(bytes: &[u8]) -> Option<(MediaKind, &'static str)> {
    let at = |offset: usize, magic: &[u8]| bytes.get(offset..offset + magic.len()) == Some(magic);
    if at(0, &[0xFF, 0xD8, 0xFF]) {
        return Some((MediaKind::Image, "image/jpeg"));
    }
    if at(0, b"\x89PNG\r\n\x1a\n") {
        return Some((MediaKind::Image, "image/png"));
    }
    if at(0, b"GIF87a") || at(0, b"GIF89a") {
        return Some((MediaKind::Image, "image/gif"));
    }
    if at(0, b"RIFF") && at(8, b"WEBP") {
        return Some((MediaKind::Image, "image/webp"));
    }
    if at(0, &[0x1A, 0x45, 0xDF, 0xA3]) {
        return Some((MediaKind::Video, "video/webm"));
    }
    if at(4, b"ftyp") {
        let brand = bytes.get(8..12)?;
        return Some(match brand {
            b"heic" | b"heix" | b"heim" | b"heis" | b"mif1" | b"msf1" => (MediaKind::Image, "image/heic"),
            b"avif" | b"avis" => (MediaKind::Image, "image/avif"),
            b"qt  " => (MediaKind::Video, "video/quicktime"),
            _ => (MediaKind::Video, "video/mp4"),
        });
    }
    None
}

pub fn check_size(kind: MediaKind, len: usize) -> Result<()> {
    let (max, what) = match kind {
        MediaKind::Image => (MAX_IMAGE_BYTES, "Images"),
        MediaKind::Video => (MAX_VIDEO_BYTES, "Videos"),
    };
    if len == 0 {
        return Err(Error::Invalid("The file is empty.".into()));
    }
    if len > max {
        return Err(Error::Invalid(format!("{what} can be at most {} MB.", max / (1024 * 1024))));
    }
    Ok(())
}

/// Least-recently-used cache of decrypted media, bounded by total bytes.
pub struct MediaCache {
    entries: HashMap<String, Bytes>,
    order: VecDeque<String>,
    total: usize,
    budget: usize,
}

impl Default for MediaCache {
    fn default() -> Self {
        Self::with_budget(CACHE_BUDGET_BYTES)
    }
}

impl MediaCache {
    pub fn with_budget(budget: usize) -> Self {
        Self { entries: HashMap::new(), order: VecDeque::new(), total: 0, budget }
    }

    pub fn get(&mut self, id: &str) -> Option<Bytes> {
        let bytes = self.entries.get(id)?.clone();
        self.order.retain(|x| x != id);
        self.order.push_back(id.to_string());
        Some(bytes)
    }

    pub fn insert(&mut self, id: String, bytes: Bytes) {
        self.remove(&id);
        self.total += bytes.len();
        self.entries.insert(id.clone(), bytes);
        self.order.push_back(id);
        while self.total > self.budget && self.order.len() > 1 {
            if let Some(oldest) = self.order.pop_front() {
                if let Some(b) = self.entries.remove(&oldest) {
                    self.total -= b.len();
                }
            }
        }
    }

    pub fn remove(&mut self, id: &str) {
        if let Some(b) = self.entries.remove(id) {
            self.total -= b.len();
            self.order.retain(|x| x != id);
        }
    }
}

/// Parses a single `bytes=` range into an inclusive `(start, end)`.
/// Returns `Err(())` for an unsatisfiable range and `Ok(None)` when absent or unsupported.
#[allow(clippy::result_unit_err)]
pub fn parse_range(value: Option<&str>, len: usize) -> std::result::Result<Option<(usize, usize)>, ()> {
    let Some(spec) = value.and_then(|v| v.trim().strip_prefix("bytes=")) else { return Ok(None) };
    if spec.contains(',') || len == 0 {
        return Ok(None); // Multi-range: fall back to the full body.
    }
    let (start, end) = spec.split_once('-').ok_or(())?;
    let (start, end) = match (start.trim(), end.trim()) {
        ("", suffix) => {
            let n: usize = suffix.parse().map_err(|_| ())?;
            if n == 0 {
                return Err(());
            }
            (len.saturating_sub(n), len - 1)
        }
        (s, "") => (s.parse().map_err(|_| ())?, len - 1),
        (s, e) => (s.parse().map_err(|_| ())?, e.parse::<usize>().map_err(|_| ())?.min(len - 1)),
    };
    if start > end || start >= len {
        return Err(());
    }
    Ok(Some((start, end)))
}

fn plain(status: StatusCode, msg: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .header(header::CACHE_CONTROL, "no-store")
        .body(msg.as_bytes().to_vec())
        .unwrap()
}

/// Handles a `journal://` request. Runs on a blocking thread.
pub fn serve(state: &AppState, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    if uuid::Uuid::parse_str(id).is_err() {
        return plain(StatusCode::NOT_FOUND, "not found");
    }

    // Look up under the lock, but decrypt outside it so other commands aren't blocked.
    let lookup = state.with_workspace(|ws| ws.media_lookup(id));
    let (mime, bytes) = match lookup {
        Ok((media, crate::store::MediaSource::Ready(bytes))) => (media.mime, bytes),
        Ok((media, crate::store::MediaSource::Encrypted { key, path, session })) => {
            let decrypted = std::fs::read(&path)
                .map_err(Error::from)
                .and_then(|sealed| crate::record::decode_blob(&key, id, &sealed));
            match decrypted {
                Ok(plain_bytes) => {
                    let bytes: Bytes = Arc::new(plain_bytes);
                    let _ = state.with_workspace(|ws| {
                        ws.cache_media(session, id, bytes.clone());
                        Ok(())
                    });
                    (media.mime, bytes)
                }
                Err(_) => return plain(StatusCode::INTERNAL_SERVER_ERROR, "could not decrypt media"),
            }
        }
        Err(Error::Locked) => return plain(StatusCode::FORBIDDEN, "locked"),
        Err(_) => return plain(StatusCode::NOT_FOUND, "not found"),
    };

    let range = request.headers().get(header::RANGE).and_then(|v| v.to_str().ok());
    let len = bytes.len();
    let builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store");
    match parse_range(range, len) {
        Ok(Some((start, end))) => builder
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(header::CONTENT_LENGTH, end - start + 1)
            .body(bytes[start..=end].to_vec())
            .unwrap(),
        Ok(None) => builder.status(StatusCode::OK).header(header::CONTENT_LENGTH, len).body(bytes.to_vec()).unwrap(),
        Err(()) => Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{len}"))
            .body(Vec::new())
            .unwrap(),
    }
}

#[cfg(test)]
pub(crate) mod tests {

    /// A real PNG with some detail, so JPEG has something to compress.
    pub fn photo_png(w: u32, h: u32) -> Vec<u8> {
        let img = image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x * y) % 256) as u8]));
        let mut out = std::io::Cursor::new(Vec::new());
        img.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn fit_photo_shrinks_or_keeps() {
        let big = photo_png(1600, 800);
        let out = fit_photo(&big, 1080).expect("smaller");
        assert_eq!(sniff(&out), Some((MediaKind::Image, "image/jpeg")));
        let img = image::load_from_memory(&out).unwrap();
        assert_eq!((img.width(), img.height()), (1080, 540));
        assert!(out.len() < big.len());

        assert_eq!(fit_photo(&big, 0), None, "0 keeps originals");
        assert_eq!(fit_photo(&out, 1080), None, "a JPEG that fits is never re-encoded");
        let small = photo_png(600, 400);
        assert_eq!(sniff(&fit_photo(&small, 1080).expect("PNG that fits still becomes a smaller JPEG")), Some((MediaKind::Image, "image/jpeg")));
        assert_eq!(fit_photo(&[b"GIF89a".as_slice(), &[0; 64]].concat(), 720), None, "GIFs are kept");
        assert_eq!(fit_photo(&[b"\x89PNG\r\n\x1a\n".as_slice(), &[0; 64]].concat(), 720), None, "undecodable files are kept");
        assert_eq!(jpeg_name("front.png"), "front.jpg");
        assert_eq!(jpeg_name("noext"), "noext.jpg");
    }

    use super::*;

    #[test]
    fn sniffs_types() {
        assert_eq!(sniff(&[0xFF, 0xD8, 0xFF, 0xE0]).unwrap().1, "image/jpeg");
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n....").unwrap().1, "image/png");
        assert_eq!(sniff(b"RIFF\0\0\0\0WEBPVP8 ").unwrap().1, "image/webp");
        assert_eq!(sniff(b"\0\0\0\x18ftypheic").unwrap(), (MediaKind::Image, "image/heic"));
        assert_eq!(sniff(b"\0\0\0\x18ftypisom").unwrap(), (MediaKind::Video, "video/mp4"));
        assert_eq!(sniff(b"\0\0\0\x14ftypqt  ").unwrap(), (MediaKind::Video, "video/quicktime"));
        assert!(sniff(b"<svg xmlns=").is_none());
        assert!(sniff(b"").is_none());
    }

    #[test]
    fn size_limits() {
        assert!(check_size(MediaKind::Image, MAX_IMAGE_BYTES).is_ok());
        assert!(check_size(MediaKind::Image, MAX_IMAGE_BYTES + 1).is_err());
        assert!(check_size(MediaKind::Video, MAX_VIDEO_BYTES).is_ok());
        assert!(check_size(MediaKind::Video, 0).is_err());
    }

    #[test]
    fn ranges() {
        assert_eq!(parse_range(None, 100), Ok(None));
        assert_eq!(parse_range(Some("bytes=0-"), 100), Ok(Some((0, 99))));
        assert_eq!(parse_range(Some("bytes=10-19"), 100), Ok(Some((10, 19))));
        assert_eq!(parse_range(Some("bytes=90-500"), 100), Ok(Some((90, 99))));
        assert_eq!(parse_range(Some("bytes=-10"), 100), Ok(Some((90, 99))));
        assert_eq!(parse_range(Some("bytes=0-1"), 100), Ok(Some((0, 1))));
        assert_eq!(parse_range(Some("bytes=100-"), 100), Err(()));
        assert_eq!(parse_range(Some("bytes=5-2"), 100), Err(()));
        assert_eq!(parse_range(Some("bytes=0-1,5-6"), 100), Ok(None));
    }

    #[test]
    fn serves_decrypted_ranges() {
        use crate::model::PostInput;
        use crate::store::{create_workspace, KdfCost};

        let root = tempfile::tempdir().unwrap();
        let state = AppState::new(root.path().to_path_buf());
        let get = |id: &str, range: Option<&str>| {
            let mut req = Request::builder().uri(format!("journal://localhost/{id}"));
            if let Some(r) = range {
                req = req.header(header::RANGE, r);
            }
            serve(&state, &req.body(Vec::new()).unwrap())
        };
        let id = uuid::Uuid::new_v4().to_string();
        assert_eq!(get(&id, None).status(), StatusCode::FORBIDDEN, "locked");

        let fast = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };
        let mut ws = create_workspace(root.path(), "", "P", "Me", "long enough", fast).unwrap();
        let mut video = b"\0\0\0\x18ftypisom".to_vec();
        video.extend((0..5000u32).map(|i| i as u8));
        let media = ws.stage_media("clip.mp4", video.clone()).unwrap();
        let owner = ws.owner_id().to_string();
        let input = PostInput {
            id: None,
            kind: Default::default(),
            title: String::new(),
            captions: Default::default(),
            author_id: owner,
            content: String::new(),
            occurred_at: None,
            media_ids: vec![media.id.clone()],
            ..Default::default()
        };
        ws.save_post(input).unwrap();
        *state.workspace.lock().unwrap() = Some(ws);

        let full = get(&media.id, None);
        assert_eq!(full.status(), StatusCode::OK);
        assert_eq!(full.headers()[header::CONTENT_TYPE], "video/mp4");
        assert_eq!(full.headers()[header::CACHE_CONTROL], "no-store");
        assert_eq!(full.body(), &video);

        let part = get(&media.id, Some("bytes=100-199"));
        assert_eq!(part.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(part.headers()[header::CONTENT_RANGE], format!("bytes 100-199/{}", video.len()));
        assert_eq!(part.body(), &video[100..200]);

        assert_eq!(get(&media.id, Some("bytes=999999-")).status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(get(&id, None).status(), StatusCode::NOT_FOUND, "unknown id");
        assert_eq!(get("../workspace.json", None).status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn cache_evicts_oldest() {
        let mut cache = MediaCache::with_budget(100);
        let big = || Arc::new(Zeroizing::new(vec![0u8; 50]));
        cache.insert("a".into(), big());
        cache.insert("b".into(), big());
        assert!(cache.get("a").is_some()); // a is now most recent
        cache.insert("c".into(), big());
        assert!(cache.get("b").is_none(), "b was least recently used");
        assert!(cache.get("a").is_some() && cache.get("c").is_some());
    }
}
