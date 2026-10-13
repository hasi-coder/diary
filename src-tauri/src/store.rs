//! On-disk workspace layout and the in-memory decrypted cache.
//!
//! ```text
//! data_sources/workspace_<label>/
//! ├── workspace.json        plaintext: format version, Argon2id params, wrapped data key
//! ├── manifest.enc          workspace name, owner profile, created time
//! ├── entities/<uuid>.enc   profiles (me, people, pages, shops, places)
//! ├── posts/<uuid>.enc      journal entries
//! └── items/<uuid>.enc      shop listings
//! ```
//!
//! The folder label is chosen by the user and is the only name visible in the
//! repository. Record files are described in `record.rs`.
//!
//! Unlocking derives a key-encryption key from the password, unwraps the random
//! data key, and decrypts every record into memory, upgrading older schemas on
//! the fly (see `migrate.rs`). Dropping the [`Workspace`] (on lock or exit)
//! zeroizes the data key.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::crypto::{self, Key};
use crate::error::{Error, Result};
use crate::media::{self, Bytes, MediaCache};
use crate::migrate::{self, MigrationStatus};
use crate::model::*;
use crate::record::{self, Kind, CURRENT_SCHEMA};
use crate::search::{self, DocKey, DocKind, Field, Query, SearchIndex};

const CONFIG_FILE: &str = "workspace.json";
const MANIFEST_FILE: &str = "manifest.enc";
const MANIFEST_ID: &str = "manifest";
pub const WORKSPACE_PREFIX: &str = "workspace_";
const MENTION_PREFIX: &str = "@[profile:";
/// Staging area for a key rotation; see [`Workspace::change_password`].
const ROTATE_DIR: &str = ".rotate";
/// Written once everything is staged. Its presence means "roll forward".
const ROTATE_READY: &str = "READY";

/// Argon2id cost parameters.
#[derive(Clone, Copy, Debug)]
pub struct KdfCost {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

/// OWASP-recommended Argon2id settings (64 MiB, 3 passes).
pub const DEFAULT_KDF: KdfCost = KdfCost { memory_kib: 64 * 1024, iterations: 3, parallelism: 1 };

pub fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Where workspaces live: `$MY_DIARY_DATA_DIR`, or `data_sources/` in this repo.
pub fn data_root() -> PathBuf {
    std::env::var_os("MY_DIARY_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../data_sources")))
}

pub fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for c in name.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('_') && !slug.is_empty() {
            slug.push('_');
        }
    }
    slug.trim_end_matches('_').to_string()
}

/// Extracts the profile ids referenced as `@[profile:<id>]` in post content.
pub fn mentions(content: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find(MENTION_PREFIX) {
        rest = &rest[start + MENTION_PREFIX.len()..];
        match rest.find(']') {
            Some(end) => {
                out.push(&rest[..end]);
                rest = &rest[end + 1..];
            }
            None => break,
        }
    }
    out
}

/// Unique lower-cased `#tags` (must contain a letter; `#1` is not a tag).
pub fn hashtags(content: &str) -> Vec<String> {
    let chars: Vec<char> = content.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let at_boundary = i == 0 || chars[i - 1].is_whitespace() || chars[i - 1] == '(';
        if chars[i] == '#' && at_boundary {
            let mut j = i + 1;
            while j < chars.len() && (chars[j].is_alphanumeric() || chars[j] == '_' || chars[j] == '-') {
                j += 1;
            }
            let tag: String = chars[i + 1..j].iter().collect::<String>().to_lowercase();
            if tag.chars().any(char::is_alphabetic) && !out.contains(&tag) {
                out.push(tag);
            }
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// Every profile a post refers to: text mentions, "with" tags, check-in and photo tags.
pub fn involved(post: &Post) -> Vec<&str> {
    let mut ids: Vec<&str> = mentions(&post.content);
    ids.extend(post.with_ids.iter().map(String::as_str));
    ids.extend(post.activities.iter().flat_map(|a| a.with_ids.iter().map(String::as_str)));
    ids.extend(post.place_id.as_deref());
    ids.extend(post.media.iter().flat_map(|m| m.tags.iter().map(|t| t.profile_id.as_str())));
    ids.sort_unstable();
    ids.dedup();
    ids
}

/// Pre-built front matter stored (encrypted) alongside a post.
fn post_meta(post: &Post) -> Value {
    json!({ "mentions": involved(post), "tags": hashtags(&post.content) })
}

/// Relationship kinds, shared with the UI (`src/lib/relations.json`).
#[derive(serde::Deserialize)]
struct RelationCatalog {
    kinds: Vec<RelationKindDef>,
}

#[derive(serde::Deserialize)]
struct RelationKindDef {
    kind: String,
    inverse: String,
}

fn relation_kinds() -> &'static HashMap<String, String> {
    static KINDS: std::sync::OnceLock<HashMap<String, String>> = std::sync::OnceLock::new();
    KINDS.get_or_init(|| {
        let catalog: RelationCatalog =
            serde_json::from_str(include_str!("../../src/lib/relations.json")).expect("relations.json is valid");
        catalog.kinds.into_iter().map(|k| (k.kind, k.inverse)).collect()
    })
}

/// If B is A's `kind`, A is B's `inverse_relation(kind)` (e.g. parent / child).
fn inverse_relation(kind: &str) -> Option<&'static str> {
    relation_kinds().get(kind).map(String::as_str)
}

/// Words used for relationship labels: "Sister", "Brother" or "Sibling".
const TERMS: [&str; 3] = ["neutral", "feminine", "masculine"];

/// Up to 10 gender identities (as Facebook allows), trimmed and de-duplicated.
fn clean_genders(genders: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for g in genders.iter().map(|g| short(g, 40)).filter(|g| !g.is_empty()) {
        if !out.iter().any(|x| x.eq_ignore_ascii_case(&g)) && out.len() < 10 {
            out.push(g);
        }
    }
    out
}

/// Series one post can be part of.
const MAX_SERIES_PER_POST: usize = 10;

/// Photos and videos per shop item.
pub const MAX_MEDIA_PER_ITEM: usize = 20;

/// Activities ("wearing a saree") one post can have.
const MAX_ACTIVITIES: usize = 12;

/// Extra life events one milestone can combine, besides its main one.
const MAX_COMBINED_EVENTS: usize = 4;

fn short(value: &str, max: usize) -> String {
    value.trim().chars().take(max).collect()
}

fn kind_label(kind: MediaKind) -> &'static str {
    match kind {
        MediaKind::Image => "image",
        MediaKind::Video => "video",
    }
}

pub(crate) fn validate_workspace_id(id: &str) -> Result<()> {
    let ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err(Error::Invalid(format!("Invalid workspace id: {id}")))
    }
}

fn validate_record_id(id: &str) -> Result<()> {
    Uuid::parse_str(id).map(|_| ()).map_err(|_| Error::Invalid(format!("Invalid record id: {id}")))
}

fn required(value: &str, what: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        Err(Error::Invalid(format!("{what} is required.")))
    } else {
        Ok(value.to_string())
    }
}

/// Writes via a temp file + rename so a crash never leaves a half-written record.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn read_config(dir: &Path) -> Result<WorkspaceConfig> {
    let path = dir.join(CONFIG_FILE);
    if !path.exists() {
        return Err(Error::NotFound(format!("workspace at {}", dir.display())));
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_config(dir: &Path, config: &WorkspaceConfig) -> Result<()> {
    atomic_write(&dir.join(CONFIG_FILE), &serde_json::to_vec_pretty(config)?)
}

/// Builds a fresh `workspace.json` that wraps `key` under `password`.
fn wrap_key(key: &Key, password: &str, cost: KdfCost) -> Result<WorkspaceConfig> {
    let salt = crypto::random_bytes::<16>();
    let kek = crypto::derive_key(password.as_bytes(), &salt, cost.memory_kib, cost.iterations, cost.parallelism)?;
    Ok(WorkspaceConfig {
        format_version: CURRENT_SCHEMA,
        name: None,
        kdf: KdfParams {
            algorithm: "argon2id".into(),
            memory_kib: cost.memory_kib,
            iterations: cost.iterations,
            parallelism: cost.parallelism,
            salt: B64.encode(salt),
        },
        wrapped_key: B64.encode(crypto::seal(&kek, "keywrap", key.as_ref())?),
    })
}

/// Unwraps the data key from `config` with `password`.
fn unwrap_key(config: &WorkspaceConfig, password: &str) -> Result<Key> {
    let salt = B64.decode(&config.kdf.salt).map_err(|_| Error::Invalid("Corrupt KDF salt.".into()))?;
    let wrapped = B64.decode(&config.wrapped_key).map_err(|_| Error::Invalid("Corrupt wrapped key.".into()))?;
    let kdf = &config.kdf;
    let kek = crypto::derive_key(password.as_bytes(), &salt, kdf.memory_kib, kdf.iterations, kdf.parallelism)?;
    let raw = crypto::open(&kek, "keywrap", &wrapped).map_err(|_| Error::BadPassword)?;
    Ok(Zeroizing::new(raw.as_slice().try_into().map_err(|_| Error::BadPassword)?))
}

fn write_synced(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

/// Records sit in subfolders named after the first two characters of their id
/// (`media/3f/3f9a….enc`): ids are random, so 256 folders fill evenly and none
/// grows past a few hundred files.
fn shard_of(id: &str) -> String {
    match id.get(..2) {
        Some(p) if p.bytes().all(|b| b.is_ascii_alphanumeric()) => p.to_ascii_lowercase(),
        _ => "_".into(),
    }
}

/// Path of a record relative to the workspace folder.
fn record_rel_path(kind: Kind, id: &str) -> PathBuf {
    match kind {
        Kind::Manifest => PathBuf::from(MANIFEST_FILE),
        _ => Path::new(kind.dir()).join(shard_of(id)).join(format!("{id}.enc")),
    }
}

/// Kinds stored one file per record, in their own folder.
const FOLDER_KINDS: [Kind; 5] = [Kind::Profile, Kind::Post, Kind::Item, Kind::Series, Kind::Media];

/// Every record file in a kind's folder as `(id, path)`, whether in a subfolder
/// or (as older versions saved them) directly in the folder.
fn record_files(dir: &Path) -> Result<Vec<(String, PathBuf)>> {
    fn push(path: PathBuf, out: &mut Vec<(String, PathBuf)>) {
        if path.extension().and_then(|e| e.to_str()) == Some("enc") {
            if let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_owned) {
                out.push((id, path));
            }
        }
    }
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            for inner in fs::read_dir(&path)? {
                push(inner?.path(), &mut out);
            }
        } else {
            push(path, &mut out);
        }
    }
    Ok(out)
}

/// Moves files saved by older versions (directly in `media/` etc.) into their
/// subfolder. Each move is a rename, so an interrupted run finishes next time.
fn shard_flat_files(dir: &Path) -> Result<()> {
    for kind in FOLDER_KINDS {
        for (id, path) in record_files(&dir.join(kind.dir()))? {
            let target = dir.join(record_rel_path(kind, &id));
            if path != target {
                fs::create_dir_all(target.parent().unwrap_or(dir))?;
                fs::rename(&path, &target)?;
            }
        }
    }
    Ok(())
}

/// Moves a fully staged rotation into place. Idempotent, so it can be re-run
/// after a crash. `workspace.json` moves last because it decides which key
/// the files are read with; recovery always finishes the job first.
fn commit_rotation(dir: &Path) -> Result<()> {
    let staging = dir.join(ROTATE_DIR);
    for kind in FOLDER_KINDS {
        for (id, path) in record_files(&staging.join(kind.dir()))? {
            let target = dir.join(record_rel_path(kind, &id));
            fs::create_dir_all(target.parent().unwrap_or(dir))?;
            fs::rename(&path, target)?;
        }
    }
    for file in [MANIFEST_FILE, CONFIG_FILE] {
        if staging.join(file).exists() {
            fs::rename(staging.join(file), dir.join(file))?;
        }
    }
    fs::remove_dir_all(&staging)?;
    Ok(())
}

/// Finishes (if fully staged) or discards (if not) an interrupted key rotation.
fn recover_rotation(dir: &Path) -> Result<()> {
    let staging = dir.join(ROTATE_DIR);
    if !staging.exists() {
        return Ok(());
    }
    if staging.join(ROTATE_READY).exists() {
        commit_rotation(dir)
    } else {
        Ok(fs::remove_dir_all(&staging)?)
    }
}

fn label_of(id: &str) -> String {
    id.strip_prefix(WORKSPACE_PREFIX).unwrap_or(id).to_string()
}

pub fn list_workspaces(root: &Path) -> Result<Vec<WorkspaceInfo>> {
    let mut out = Vec::new();
    if !root.exists() {
        return Ok(out);
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() && entry.path().join(CONFIG_FILE).exists() {
            let id = entry.file_name().to_string_lossy().into_owned();
            out.push(WorkspaceInfo { label: label_of(&id), id });
        }
    }
    out.sort_by_key(|w| w.label.clone());
    Ok(out)
}

/// Creates `data_sources/workspace_<folder>`. `folder` is visible in the repo;
/// `name` is encrypted. An empty `folder` falls back to the slugified name.
pub fn create_workspace(
    root: &Path,
    folder: &str,
    name: &str,
    owner_name: &str,
    password: &str,
    cost: KdfCost,
) -> Result<Workspace> {
    let name = required(name, "Workspace name")?;
    let owner_name = required(owner_name, "Your name")?;
    if password.chars().count() < 8 {
        return Err(Error::Invalid("Password must be at least 8 characters.".into()));
    }
    let label = match slugify(folder) {
        l if l.is_empty() => slugify(&name),
        l => l,
    };
    if label.is_empty() {
        return Err(Error::Invalid("Folder name must contain letters or digits.".into()));
    }
    let id = format!("{WORKSPACE_PREFIX}{label}");
    let dir = root.join(&id);
    if dir.exists() {
        return Err(Error::Invalid(format!("A workspace folder named \"{id}\" already exists.")));
    }

    let data_key = crypto::random_key();
    let config = wrap_key(&data_key, password, cost)?;

    fs::create_dir_all(&dir)?;
    let result = (|| {
        for kind in Kind::RECORDS {
            fs::create_dir_all(dir.join(kind.dir()))?;
        }
        write_config(&dir, &config)?;

        let now = now_millis();
        let owner = Profile {
            id: Uuid::new_v4().to_string(),
            kind: ProfileKind::Me,
            name: owner_name,
            tagline: String::new(),
            bio: String::new(),
            relationship: String::new(),
            category: String::new(),
            location: String::new(),
            color: "teal".into(),
            has_shop: false,
            genders: Vec::new(),
            pronouns: String::new(),
            terms: "neutral".into(),
            relationship_status: String::new(),
            avatar: None,
            cover: None,
            cover_position: 50,
            relations: Vec::new(),
            source_url: String::new(),
            trashed_at: None,
            trashed_with: None,
            created_at: now,
            updated_at: now,
        };
        let manifest = Manifest { format_version: CURRENT_SCHEMA, name, owner_profile_id: owner.id.clone(), created_at: now, agent: None };
        let mut ws = Workspace {
            id: id.clone(),
            dir: dir.clone(),
            key: data_key,
            config,
            manifest,
            profiles: HashMap::new(),
            posts: HashMap::new(),
            items: HashMap::new(),
            series: HashMap::new(),
            trash: Trash::default(),
            stale: HashSet::new(),
            disk_schema: CURRENT_SCHEMA,
            media: MediaState::new(),
            index: SearchIndex::default(),
        };
        ws.write_manifest()?;
        ws.write_record(Kind::Profile, &owner.id, &owner, json!({}))?;
        ws.profiles.insert(owner.id.clone(), owner.clone());
        ws.index_profile(&owner.id);
        Ok(ws)
    })();

    if result.is_err() {
        // The folder did not exist before this call, so it is safe to remove.
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

pub fn open_workspace(root: &Path, id: &str, password: &str) -> Result<Workspace> {
    validate_workspace_id(id)?;
    let dir = root.join(id);
    recover_rotation(&dir)?;
    let config = read_config(&dir)?;
    if config.format_version > CURRENT_SCHEMA {
        return Err(Error::Invalid("This workspace was created by a newer version of My Diary. Update the app.".into()));
    }
    if config.kdf.algorithm != "argon2id" {
        return Err(Error::Invalid("Unsupported key derivation algorithm.".into()));
    }

    let key = unwrap_key(&config, password)?;

    let mut stale = HashSet::new();
    let manifest_bytes = fs::read(dir.join(MANIFEST_FILE))?;
    let decoded = record::decode(&key, Kind::Manifest, MANIFEST_ID, &manifest_bytes).map_err(|_| Error::BadPassword)?;
    let mut disk_schema = config.format_version.min(decoded.schema);
    if decoded.schema < CURRENT_SCHEMA {
        stale.insert((Kind::Manifest, MANIFEST_ID.to_string()));
    }
    let manifest: Manifest = serde_json::from_value(migrate::upgrade(Kind::Manifest, decoded.schema, decoded.data)?)?;
    // Only once the password is known to be right.
    shard_flat_files(&dir)?;

    let mut ws = Workspace {
        id: id.to_string(),
        dir,
        key,
        config,
        manifest,
        profiles: HashMap::new(),
        posts: HashMap::new(),
        items: HashMap::new(),
        series: HashMap::new(),
        trash: Trash::default(),
        stale,
        disk_schema: CURRENT_SCHEMA,
        media: MediaState::new(),
        index: SearchIndex::default(),
    };
    ws.profiles = ws.load_all(Kind::Profile, &mut disk_schema)?;
    ws.posts = ws.load_all(Kind::Post, &mut disk_schema)?;
    ws.items = ws.load_all(Kind::Item, &mut disk_schema)?;
    ws.series = ws.load_all(Kind::Series, &mut disk_schema)?;
    // Trashed records load into the Trash, out of every view.
    let (live, trashed): (HashMap<_, Profile>, _) = ws.profiles.drain().partition(|(_, p)| p.trashed_at.is_none());
    (ws.profiles, ws.trash.profiles) = (live, trashed);
    let (live, trashed): (HashMap<_, Post>, _) = ws.posts.drain().partition(|(_, p)| p.trashed_at.is_none());
    (ws.posts, ws.trash.posts) = (live, trashed);
    let (live, trashed): (HashMap<_, Item>, _) = ws.items.drain().partition(|(_, i)| i.trashed_at.is_none());
    (ws.items, ws.trash.items) = (live, trashed);
    ws.disk_schema = disk_schema;
    ws.reindex_media();
    ws.rebuild_index();
    Ok(ws)
}

/// Deleted records, kept (encrypted, on disk) until restored or deleted forever.
#[derive(Default)]
pub struct Trash {
    pub posts: HashMap<String, Post>,
    pub profiles: HashMap<String, Profile>,
    pub items: HashMap<String, Item>,
}

struct StagedMedia {
    media: MediaRef,
    bytes: Bytes,
}

/// Attachment bookkeeping for an unlocked workspace.
struct MediaState {
    /// Uploads not yet attached to a saved post. Never written to disk.
    staged: HashMap<String, StagedMedia>,
    /// Saved media id -> metadata, rebuilt from posts.
    index: HashMap<String, MediaRef>,
    cache: MediaCache,
    /// Distinguishes this unlock from a later one, so a decrypt that finishes
    /// after a lock/unlock cycle isn't cached into the wrong session.
    session: u64,
}

impl MediaState {
    fn new() -> Self {
        Self {
            staged: HashMap::new(),
            index: HashMap::new(),
            cache: MediaCache::default(),
            session: u64::from_le_bytes(crypto::random_bytes::<8>()),
        }
    }
}

/// Where the protocol handler gets a media file's bytes from.
pub enum MediaSource {
    Ready(Bytes),
    /// Needs decrypting; done outside the workspace lock.
    Encrypted { key: Key, path: PathBuf, session: u64 },
}

/// An unlocked workspace: the data key plus every decrypted record.
pub struct Workspace {
    pub id: String,
    dir: PathBuf,
    key: Key,
    config: WorkspaceConfig,
    pub manifest: Manifest,
    pub profiles: HashMap<String, Profile>,
    pub posts: HashMap<String, Post>,
    pub items: HashMap<String, Item>,
    pub series: HashMap<String, Series>,
    /// Deleted posts, profiles and products: still on disk, out of every view.
    pub trash: Trash,
    /// Records still on disk in an older schema.
    stale: HashSet<(Kind, String)>,
    /// Oldest schema found when the workspace was opened.
    disk_schema: u32,
    media: MediaState,
    /// Full-text index over the decrypted cache. Memory only.
    index: SearchIndex,
}

impl Workspace {
    fn record_path(&self, kind: Kind, id: &str) -> PathBuf {
        match kind {
            Kind::Manifest => self.dir.join(MANIFEST_FILE),
            _ => self.dir.join(record_rel_path(kind, id)),
        }
    }

    // ---- Media ----

    /// Size of the workspace's files on disk, per folder. Reads no contents.
    pub fn storage_usage(&self) -> Result<StorageUsage> {
        let mut parts = Vec::new();
        for kind in FOLDER_KINDS {
            let files = record_files(&self.dir.join(kind.dir()))?;
            let bytes = files.iter().filter_map(|(_, p)| fs::metadata(p).ok()).map(|m| m.len()).sum();
            parts.push(StoragePart { key: kind.dir().into(), files: files.len(), bytes });
        }
        let other: Vec<u64> = [MANIFEST_FILE, CONFIG_FILE].iter().filter_map(|f| fs::metadata(self.dir.join(f)).ok()).map(|m| m.len()).collect();
        parts.push(StoragePart { key: "other".into(), files: other.len(), bytes: other.iter().sum() });
        let total_bytes = parts.iter().map(|p| p.bytes).sum();
        Ok(StorageUsage { parts, total_bytes })
    }

    fn reindex_media(&mut self) {
        let post_media = self.posts.values().flat_map(|p| p.media.iter());
        let profile_media = self.profiles.values().flat_map(|p| p.avatar.iter().chain(p.cover.iter()));
        let item_media = self.items.values().flat_map(|i| i.media.iter());
        self.media.index = post_media.chain(profile_media).chain(item_media).map(|m| (m.id.clone(), m.clone())).collect();
    }

    /// Decrypted bytes of a staged or saved attachment.
    fn read_media_bytes(&mut self, id: &str) -> Result<Bytes> {
        if let Some(s) = self.media.staged.get(id) {
            return Ok(s.bytes.clone());
        }
        if let Some(bytes) = self.media.cache.get(id) {
            return Ok(bytes);
        }
        if !self.media.index.contains_key(id) {
            return Err(Error::NotFound(format!("media {id}")));
        }
        let bytes: Bytes = Arc::new(record::decode_blob(&self.key, id, &fs::read(self.record_path(Kind::Media, id))?)?);
        self.media.cache.insert(id.to_string(), bytes.clone());
        Ok(bytes)
    }

    /// Stages a copy of an existing photo (e.g. to use it as a profile picture),
    /// so it stays independent of the post it came from.
    pub fn stage_media_copy(&mut self, id: &str) -> Result<MediaRef> {
        let source = match self.media.staged.get(id) {
            Some(s) => s.media.clone(),
            None => self.media.index.get(id).cloned().ok_or_else(|| Error::NotFound(format!("media {id}")))?,
        };
        let bytes = self.read_media_bytes(id)?;
        let media = MediaRef { id: Uuid::new_v4().to_string(), caption: String::new(), tags: Vec::new(), ..source };
        self.media.staged.insert(media.id.clone(), StagedMedia { media: media.clone(), bytes });
        Ok(media)
    }

    /// Validates an upload and holds it in memory until a post references it.
    pub fn stage_media(&mut self, name: &str, bytes: Vec<u8>) -> Result<MediaRef> {
        let bytes = Zeroizing::new(bytes);
        let (kind, mime) = media::sniff(&bytes).ok_or_else(|| {
            Error::Invalid("Unsupported file type. Use JPEG, PNG, GIF, WebP, HEIC, AVIF, MP4, MOV or WebM.".into())
        })?;
        media::check_size(kind, bytes.len())?;
        let name = match name.trim() {
            "" => format!("{}.{}", kind_label(kind), mime.rsplit('/').next().unwrap_or("bin")),
            n => n.chars().take(200).collect(),
        };
        let media = MediaRef {
            id: Uuid::new_v4().to_string(),
            kind,
            mime: mime.into(),
            name,
            size: bytes.len() as u64,
            caption: String::new(),
            tags: Vec::new(),
        };
        self.media.staged.insert(media.id.clone(), StagedMedia { media: media.clone(), bytes: Arc::new(bytes) });
        Ok(media)
    }

    /// Drops staged uploads (e.g. when a draft is cancelled). Unknown ids are ignored.
    pub fn discard_media(&mut self, ids: &[String]) {
        for id in ids {
            self.media.staged.remove(id);
        }
    }

    pub fn media_lookup(&mut self, id: &str) -> Result<(MediaRef, MediaSource)> {
        if let Some(s) = self.media.staged.get(id) {
            return Ok((s.media.clone(), MediaSource::Ready(s.bytes.clone())));
        }
        let media = self.media.index.get(id).cloned().ok_or_else(|| Error::NotFound(format!("media {id}")))?;
        if let Some(bytes) = self.media.cache.get(id) {
            return Ok((media, MediaSource::Ready(bytes)));
        }
        let source = MediaSource::Encrypted {
            key: self.key.clone(),
            path: self.record_path(Kind::Media, id),
            session: self.media.session,
        };
        Ok((media, source))
    }

    pub fn cache_media(&mut self, session: u64, id: &str, bytes: Bytes) {
        if session == self.media.session && self.media.index.contains_key(id) {
            self.media.cache.insert(id.to_string(), bytes);
        }
    }

    /// Resolves the media a record will reference: ones it already has, then staged uploads.
    fn resolve_media(&self, ids: &[String], previous: &[MediaRef], max: usize, what: &str) -> Result<Vec<MediaRef>> {
        let mut attached: Vec<MediaRef> = Vec::new();
        for id in ids {
            if attached.iter().any(|m| &m.id == id) {
                continue;
            }
            let media = previous
                .iter()
                .find(|m| &m.id == id)
                .or_else(|| self.media.staged.get(id).map(|s| &s.media))
                .ok_or_else(|| Error::NotFound(format!("attachment {id}")))?;
            attached.push(media.clone());
        }
        if attached.len() > max {
            return Err(Error::Invalid(format!("At most {max} photos and videos per {what}.")));
        }
        Ok(attached)
    }

    /// Seals staged uploads among `media` to disk (before the record that references them is written).
    fn seal_staged(&self, media: &[MediaRef]) -> Result<()> {
        fs::create_dir_all(self.dir.join(Kind::Media.dir()))?;
        for m in media {
            if let Some(staged) = self.media.staged.get(&m.id) {
                let sealed = record::encode_blob(&self.key, &m.id, &staged.bytes)?;
                atomic_write(&self.record_path(Kind::Media, &m.id), &sealed)?;
            }
        }
        Ok(())
    }

    /// After the record is written: moves sealed uploads from staging to the cache.
    fn commit_staged(&mut self, media: &[MediaRef]) {
        for m in media {
            if let Some(staged) = self.media.staged.remove(&m.id) {
                self.media.cache.insert(m.id.clone(), staged.bytes);
            }
        }
    }

    fn remove_media_file(&mut self, id: &str) -> Result<()> {
        self.media.cache.remove(id);
        self.remove_record(Kind::Media, id)
    }

    fn write_record<T: Serialize>(&mut self, kind: Kind, id: &str, value: &T, meta: Value) -> Result<()> {
        if kind != Kind::Manifest {
            fs::create_dir_all(self.dir.join(kind.dir()))?;
        }
        let bytes = record::encode(&self.key, kind, id, serde_json::to_value(value)?, meta)?;
        atomic_write(&self.record_path(kind, id), &bytes)?;
        self.stale.remove(&(kind, id.to_string()));
        Ok(())
    }

    fn write_manifest(&mut self) -> Result<()> {
        let manifest = self.manifest.clone();
        self.write_record(Kind::Manifest, MANIFEST_ID, &manifest, json!({}))
    }

    fn write_post(&mut self, post: &Post) -> Result<()> {
        self.write_record(Kind::Post, &post.id, post, post_meta(post))
    }

    fn remove_record(&mut self, kind: Kind, id: &str) -> Result<()> {
        self.stale.remove(&(kind, id.to_string()));
        match fs::remove_file(self.record_path(kind, id)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn load_all<T: DeserializeOwned>(&mut self, kind: Kind, disk_schema: &mut u32) -> Result<HashMap<String, T>> {
        let mut out = HashMap::new();
        for (id, path) in record_files(&self.dir.join(kind.dir()))? {
            let decoded = record::decode(&self.key, kind, &id, &fs::read(&path)?).map_err(|e| match e {
                Error::Invalid(msg) => Error::Invalid(msg),
                _ => Error::Invalid(format!("Could not decrypt {}", path.display())),
            })?;
            if decoded.schema < CURRENT_SCHEMA {
                self.stale.insert((kind, id.clone()));
                *disk_schema = (*disk_schema).min(decoded.schema);
            }
            let data = migrate::upgrade(kind, decoded.schema, decoded.data)?;
            out.insert(id, serde_json::from_value(data)?);
        }
        Ok(out)
    }

    pub fn owner_id(&self) -> &str {
        &self.manifest.owner_profile_id
    }

    fn config_is_stale(&self) -> bool {
        self.config.format_version < CURRENT_SCHEMA || self.config.name.is_some()
    }

    // ---- Password ----

    /// Changes the workspace password.
    ///
    /// Without `rotate`, the existing data key is re-wrapped under the new
    /// password and only `workspace.json` changes. Git history still holds the
    /// old wrapping, so the old password keeps working on old clones, and on
    /// anything written later with the same key.
    ///
    /// With `rotate`, a new data key is generated and every file is
    /// re-encrypted under it (completing any pending migration on the way).
    /// Files are staged in `.rotate/`, a `READY` marker is synced, then they
    /// are moved into place; `open_workspace` rolls an interrupted commit
    /// forward, or discards a half-staged one.
    pub fn change_password(&mut self, current: &str, new: &str, rotate: bool, cost: KdfCost) -> Result<PasswordChange> {
        if new.chars().count() < 8 {
            return Err(Error::Invalid("The new password must be at least 8 characters.".into()));
        }
        if new == current {
            return Err(Error::Invalid("The new password must be different from the current one.".into()));
        }
        if unwrap_key(&self.config, current)?.as_ref() != self.key.as_ref() {
            return Err(Error::BadPassword);
        }

        if !rotate {
            let config = WorkspaceConfig {
                format_version: self.config.format_version,
                name: self.config.name.clone(),
                ..wrap_key(&self.key, new, cost)?
            };
            write_config(&self.dir, &config)?;
            self.config = config;
            return Ok(PasswordChange { rotated: false, files_rewritten: 1 });
        }

        let new_key = crypto::random_key();
        let config = wrap_key(&new_key, new, cost)?;
        let staging = self.dir.join(ROTATE_DIR);
        if staging.exists() {
            fs::remove_dir_all(&staging)?;
        }
        let files = match self.stage_rotation(&staging, &new_key, &config) {
            Ok(n) => n,
            Err(e) => {
                let _ = fs::remove_dir_all(&staging);
                return Err(e);
            }
        };
        commit_rotation(&self.dir)?;

        self.key = new_key;
        self.config = config;
        self.manifest.format_version = CURRENT_SCHEMA;
        self.stale.clear();
        self.disk_schema = CURRENT_SCHEMA;
        Ok(PasswordChange { rotated: true, files_rewritten: files })
    }

    /// Writes every file, encrypted under `key`, into `staging`. Returns the file count.
    fn stage_rotation(&self, staging: &Path, key: &Key, config: &WorkspaceConfig) -> Result<usize> {
        let mut count = 0;
        let mut put = |rel: PathBuf, bytes: Vec<u8>| -> Result<()> {
            count += 1;
            write_synced(&staging.join(rel), &bytes)
        };

        let manifest = Manifest { format_version: CURRENT_SCHEMA, ..self.manifest.clone() };
        put(record_rel_path(Kind::Manifest, MANIFEST_ID), record::encode(key, Kind::Manifest, MANIFEST_ID, serde_json::to_value(&manifest)?, json!({}))?)?;
        for p in self.profiles.values().chain(self.trash.profiles.values()) {
            put(record_rel_path(Kind::Profile, &p.id), record::encode(key, Kind::Profile, &p.id, serde_json::to_value(p)?, json!({}))?)?;
        }
        for p in self.posts.values().chain(self.trash.posts.values()) {
            put(record_rel_path(Kind::Post, &p.id), record::encode(key, Kind::Post, &p.id, serde_json::to_value(p)?, post_meta(p))?)?;
        }
        for i in self.items.values().chain(self.trash.items.values()) {
            put(record_rel_path(Kind::Item, &i.id), record::encode(key, Kind::Item, &i.id, serde_json::to_value(i)?, json!({}))?)?;
        }
        for x in self.series.values() {
            put(record_rel_path(Kind::Series, &x.id), record::encode(key, Kind::Series, &x.id, serde_json::to_value(x)?, json!({}))?)?;
        }

        for (id, path) in record_files(&self.dir.join(Kind::Media.dir()))? {
            let plain = record::decode_blob(&self.key, &id, &fs::read(&path)?)
                .map_err(|_| Error::Invalid(format!("Could not decrypt {}; nothing was changed.", path.display())))?;
            put(record_rel_path(Kind::Media, &id), record::encode_blob(key, &id, &plain)?)?;
        }

        put(PathBuf::from(CONFIG_FILE), serde_json::to_vec_pretty(config)?)?;
        write_synced(&staging.join(ROTATE_READY), b"")?;
        Ok(count)
    }

    // ---- Migrations ----

    pub fn migration_status(&self) -> MigrationStatus {
        let stale_files = self.stale.len() + usize::from(self.config_is_stale());
        let disk_schema = if stale_files == 0 { CURRENT_SCHEMA } else { self.disk_schema };
        migrate::status(disk_schema, stale_files)
    }

    /// Rewrites every stale file in the current format. Each file is replaced
    /// atomically and the reader handles mixed formats, so an interrupted run
    /// is safe to resume. Returns the number of files rewritten.
    pub fn run_migration(&mut self) -> Result<usize> {
        let mut stale: Vec<(Kind, String)> = self.stale.iter().cloned().collect();
        stale.sort_by_key(|(kind, id)| (kind.name(), id.clone()));
        let mut rewritten = 0;
        for (kind, id) in stale {
            match kind {
                Kind::Manifest => {
                    self.manifest.format_version = CURRENT_SCHEMA;
                    self.write_manifest()?
                }
                Kind::Profile => {
                    let Some(p) = self.profiles.get(&id).or(self.trash.profiles.get(&id)).cloned() else { continue };
                    self.write_record(kind, &id, &p, json!({}))?
                }
                Kind::Post => {
                    let Some(p) = self.posts.get(&id).or(self.trash.posts.get(&id)).cloned() else { continue };
                    self.write_post(&p)?
                }
                Kind::Item => {
                    let Some(i) = self.items.get(&id).or(self.trash.items.get(&id)).cloned() else { continue };
                    self.write_record(kind, &id, &i, json!({}))?
                }
                Kind::Series => {
                    let x = self.series[&id].clone();
                    self.write_record(kind, &id, &x, json!({}))?
                }
                // Blobs have no schema and are never marked stale.
                Kind::Media => continue,
            }
            rewritten += 1;
        }
        // Rewrite workspace.json last: it is what marks the workspace as current.
        if self.config_is_stale() {
            self.config.format_version = CURRENT_SCHEMA;
            self.config.name = None;
            write_config(&self.dir, &self.config)?;
            rewritten += 1;
        }
        self.disk_schema = CURRENT_SCHEMA;
        Ok(rewritten)
    }

    // ---- Profiles ----

    pub fn save_profile(&mut self, input: ProfileInput) -> Result<Profile> {
        let name = required(&input.name, "Name")?;
        let now = now_millis();
        let (id, created_at, existing) = match &input.id {
            Some(id) => {
                let existing = self.profiles.get(id).ok_or_else(|| Error::NotFound(format!("profile {id}")))?;
                if (existing.kind == ProfileKind::Me) != (input.kind == ProfileKind::Me) {
                    return Err(Error::Invalid("The journal owner's profile type can't be changed.".into()));
                }
                (id.clone(), existing.created_at, Some(existing.clone()))
            }
            None => {
                if input.kind == ProfileKind::Me {
                    return Err(Error::Invalid("A workspace has exactly one journal owner.".into()));
                }
                (Uuid::new_v4().to_string(), now, None)
            }
        };

        let profile = Profile {
            id,
            kind: input.kind,
            name,
            tagline: input.tagline.trim().to_string(),
            bio: input.bio.trim().to_string(),
            relationship: input.relationship.trim().to_string(),
            category: input.category.trim().to_string(),
            location: input.location.trim().to_string(),
            color: input.color,
            has_shop: match input.kind {
                ProfileKind::Shop => true,
                ProfileKind::Page => input.has_shop,
                _ => false,
            },
            genders: clean_genders(&input.genders),
            pronouns: short(&input.pronouns, 40),
            terms: if TERMS.contains(&input.terms.as_str()) { input.terms.clone() } else { "neutral".into() },
            relationship_status: short(&input.relationship_status, 60),
            // Photos and relationships have their own commands; edits keep them.
            avatar: existing.as_ref().and_then(|p| p.avatar.clone()),
            cover: existing.as_ref().and_then(|p| p.cover.clone()),
            cover_position: existing.as_ref().map_or(50, |p| p.cover_position),
            // An edit that doesn't mention the source (the UI) keeps it.
            source_url: match input.source_url.trim() {
                "" => existing.as_ref().map(|p| p.source_url.clone()).unwrap_or_default(),
                url => short(url, 2000),
            },
            relations: existing.map(|p| p.relations).unwrap_or_default(),
            trashed_at: None,
            trashed_with: None,
            created_at,
            updated_at: now,
        };
        if !profile.can_sell() && self.items.values().any(|i| i.shop_id == profile.id) {
            return Err(Error::Invalid("Remove this profile's listed items before turning off its shop.".into()));
        }

        self.write_record(Kind::Profile, &profile.id, &profile, json!({}))?;
        self.profiles.insert(profile.id.clone(), profile.clone());
        self.index_profile(&profile.id);
        Ok(profile)
    }

    /// Deletes a profile together with the posts it authored and the items it lists.
    /// Mentions of it in other posts are left as-is and render as a deleted profile.
    /// Moves a profile to the Trash, with the posts it wrote and the products it lists.
    /// Restoring it brings them back; deleting it forever removes them for good.
    pub fn delete_profile(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        let profile = self.profiles.get(id).ok_or_else(|| Error::NotFound(format!("profile {id}")))?.clone();
        if profile.kind == ProfileKind::Me {
            return Err(Error::Invalid("The journal owner's profile can't be deleted.".into()));
        }
        let posts: Vec<String> = self.posts.values().filter(|p| p.author_id == id).map(|p| p.id.clone()).collect();
        for post_id in posts {
            self.trash_post(&post_id, Some(id))?;
        }
        let items: Vec<String> = self.items.values().filter(|i| i.shop_id == id).map(|i| i.id.clone()).collect();
        for item_id in items {
            self.trash_item(&item_id, Some(id))?;
        }
        let profile = Profile { trashed_at: Some(now_millis()), trashed_with: None, ..profile };
        self.write_record(Kind::Profile, id, &profile, json!({}))?;
        self.profiles.remove(id);
        self.trash.profiles.insert(id.to_string(), profile);
        self.reindex_media();
        self.index.remove(&DocKey::new(DocKind::Profile, id));
        // Posts that mention it no longer find it by name.
        let referring: Vec<String> = self.posts.values().filter(|p| involved(p).contains(&id)).map(|p| p.id.clone()).collect();
        for post_id in referring {
            self.index_post(&post_id);
        }
        Ok(())
    }

    /// Saves the agent access settings (in the encrypted manifest).
    pub fn save_agent_access(&mut self, access: Option<AgentAccess>) -> Result<()> {
        self.manifest.agent = access;
        self.write_manifest()
    }

    /// A live profile, or one in the Trash: tags of a trashed profile are kept until it's deleted forever.
    fn profile_known(&self, id: &str) -> bool {
        self.profiles.contains_key(id) || self.trash.profiles.contains_key(id)
    }

    fn put_profile(&mut self, mut profile: Profile) -> Result<Profile> {
        profile.updated_at = now_millis();
        self.write_record(Kind::Profile, &profile.id, &profile, json!({}))?;
        self.profiles.insert(profile.id.clone(), profile.clone());
        Ok(profile)
    }

    // ---- Profile photos ----

    /// Sets or clears a profile's picture or cover. `media_id` must be a staged
    /// upload (or the current photo). The replaced photo's file is deleted.
    pub fn set_profile_photo(&mut self, profile_id: &str, slot: PhotoSlot, media_id: Option<String>) -> Result<Profile> {
        let mut profile = self.profiles.get(profile_id).ok_or_else(|| Error::NotFound(format!("profile {profile_id}")))?.clone();
        let current = match slot {
            PhotoSlot::Avatar => profile.avatar.clone(),
            PhotoSlot::Cover => profile.cover.clone(),
        };
        let next = match media_id {
            None => None,
            Some(id) if current.as_ref().is_some_and(|m| m.id == id) => current.clone(),
            Some(id) => {
                let staged = self.media.staged.get(&id).ok_or_else(|| Error::NotFound(format!("upload {id}")))?;
                if staged.media.kind != MediaKind::Image {
                    return Err(Error::Invalid("Choose a photo, not a video.".into()));
                }
                let sealed = record::encode_blob(&self.key, &id, &staged.bytes)?;
                fs::create_dir_all(self.dir.join(Kind::Media.dir()))?;
                atomic_write(&self.record_path(Kind::Media, &id), &sealed)?;
                Some(MediaRef { caption: String::new(), tags: Vec::new(), ..staged.media.clone() })
            }
        };
        match slot {
            PhotoSlot::Avatar => profile.avatar = next.clone(),
            PhotoSlot::Cover => profile.cover = next.clone(),
        }
        let profile = self.put_profile(profile)?;
        if let Some(m) = &next {
            if let Some(staged) = self.media.staged.remove(&m.id) {
                self.media.cache.insert(m.id.clone(), staged.bytes);
            }
        }
        self.reindex_media();
        if let Some(old) = current.filter(|old| next.as_ref().map_or(true, |n| n.id != old.id)) {
            self.remove_media_file(&old.id)?;
        }
        Ok(profile)
    }

    pub fn set_cover_position(&mut self, profile_id: &str, position: u8) -> Result<Profile> {
        let mut profile = self.profiles.get(profile_id).ok_or_else(|| Error::NotFound(format!("profile {profile_id}")))?.clone();
        profile.cover_position = position.min(100);
        self.put_profile(profile)
    }

    // ---- Relationships ----

    /// Adds or updates a relationship declared by `profile_id`: "`to_id` is my `kind`".
    pub fn save_relation(&mut self, profile_id: &str, input: RelationInput) -> Result<Profile> {
        let mut profile = self.profiles.get(profile_id).ok_or_else(|| Error::NotFound(format!("profile {profile_id}")))?.clone();
        if !self.profiles.contains_key(&input.to_id) {
            return Err(Error::NotFound(format!("profile {}", input.to_id)));
        }
        if input.to_id == profile_id {
            return Err(Error::Invalid("A profile can't be related to itself.".into()));
        }
        let inverse = inverse_relation(&input.kind).ok_or_else(|| Error::Invalid(format!("Unknown relationship: {}", input.kind)))?;
        let label = short(&input.label, 60);
        if input.kind == "custom" && label.is_empty() {
            return Err(Error::Invalid("Describe the relationship.".into()));
        }
        let id = input.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        if input.id.is_some() && !profile.relations.iter().any(|r| r.id == id) {
            return Err(Error::NotFound(format!("relationship {id}")));
        }
        let duplicate = profile.relations.iter().any(|r| r.id != id && r.to_id == input.to_id && r.kind == input.kind && r.label == label)
            || self.profiles[&input.to_id]
                .relations
                .iter()
                .any(|r| r.to_id == profile_id && r.kind == inverse && (inverse != "custom" || r.inverse_label == label));
        if duplicate {
            return Err(Error::Invalid("That relationship already exists.".into()));
        }

        let relation = Relation {
            id: id.clone(),
            to_id: input.to_id,
            kind: input.kind,
            label,
            inverse_label: short(&input.inverse_label, 60),
            since: short(&input.since, 40),
        };
        match profile.relations.iter_mut().find(|r| r.id == id) {
            Some(existing) => *existing = relation,
            None => profile.relations.push(relation),
        }
        self.put_profile(profile)
    }

    pub fn delete_relation(&mut self, profile_id: &str, relation_id: &str) -> Result<Profile> {
        let mut profile = self.profiles.get(profile_id).ok_or_else(|| Error::NotFound(format!("profile {profile_id}")))?.clone();
        let before = profile.relations.len();
        profile.relations.retain(|r| r.id != relation_id);
        if profile.relations.len() == before {
            return Err(Error::NotFound(format!("relationship {relation_id}")));
        }
        self.put_profile(profile)
    }

    // ---- Posts ----

    pub fn save_post(&mut self, input: PostInput) -> Result<Post> {
        let content = input.content.trim().to_string();
        let title: String = input.title.trim().chars().take(300).collect();
        match input.kind {
            // A story on its own ("📈 got promoted") is a post too.
            PostKind::Status if content.is_empty() && input.media_ids.is_empty() && !input.activities.iter().any(|a| !a.object.trim().is_empty()) => {
                return Err(Error::Invalid("Write something, tell the story or attach a photo or video.".into()))
            }
            PostKind::Article if title.is_empty() => return Err(Error::Invalid("An article needs a title.".into())),
            PostKind::Article if content.is_empty() => return Err(Error::Invalid("An article needs some text.".into())),
            PostKind::Album if title.is_empty() => return Err(Error::Invalid("An album needs a title.".into())),
            PostKind::Album if input.media_ids.is_empty() => {
                return Err(Error::Invalid("Add at least one photo or video to the album.".into()))
            }
            _ => {}
        }
        if !self.profiles.contains_key(&input.author_id) {
            return Err(Error::NotFound(format!("author {}", input.author_id)));
        }
        let existing = match &input.id {
            Some(id) => Some(self.posts.get(id).ok_or_else(|| Error::NotFound(format!("post {id}")))?.clone()),
            None => None,
        };
        let previous: &[MediaRef] = existing.as_ref().map_or(&[], |p| &p.media);

        // Resolve attachments: keep ones already on this post, take the rest from staging.
        let (max, what) = if input.kind == PostKind::Album { (media::MAX_MEDIA_PER_ALBUM, "album") } else { (media::MAX_MEDIA_PER_POST, "post") };
        let mut attached = self.resolve_media(&input.media_ids, previous, max, what)?;
        for media in &mut attached {
            if let Some(caption) = input.captions.get(&media.id) {
                media.caption = caption.trim().chars().take(2000).collect();
            }
        }

        let mut with_ids: Vec<String> = Vec::new();
        for id in &input.with_ids {
            if !self.profile_known(id) {
                return Err(Error::NotFound(format!("tagged profile {id}")));
            }
            if !with_ids.contains(id) && with_ids.len() < 50 {
                with_ids.push(id.clone());
            }
        }
        if let Some(place) = &input.place_id {
            let kind = self.profiles.get(place).or(self.trash.profiles.get(place)).ok_or_else(|| Error::NotFound(format!("place {place}")))?.kind;
            if !matches!(kind, ProfileKind::Place | ProfileKind::Shop | ProfileKind::Page) {
                return Err(Error::Invalid("Check in at a place, shop or page.".into()));
            }
        }
        let feeling = input
            .feeling
            .as_ref()
            .map(|f| Feeling { emoji: short(&f.emoji, 16), text: short(&f.text, 80) })
            .filter(|f| !f.text.is_empty());
        let mut activities: Vec<Activity> = Vec::new();
        for a in input.activities.iter().filter(|a| !a.object.trim().is_empty()).take(MAX_ACTIVITIES) {
            let mut clause_with: Vec<String> = Vec::new();
            for id in &a.with_ids {
                if !self.profile_known(id) {
                    return Err(Error::NotFound(format!("tagged profile {id}")));
                }
                if !clause_with.contains(id) && clause_with.len() < 20 {
                    clause_with.push(id.clone());
                }
            }
            activities.push(Activity {
                emoji: short(&a.emoji, 16),
                verb: short(&a.verb, 40),
                object: short(&a.object, 100),
                thing: short(&a.thing, 120),
                with_ids: clause_with,
                detail: short(&a.detail, 120),
                adjectives: short(&a.adjectives, 60),
                adverb: short(&a.adverb, 60),
                tense: if a.tense == "was" { "was".into() } else { String::new() },
            });
        }
        let mut series_ids: Vec<String> = Vec::new();
        for id in &input.series_ids {
            if !self.series.contains_key(id) {
                return Err(Error::NotFound(format!("series {id}")));
            }
            if !series_ids.contains(id) && series_ids.len() < MAX_SERIES_PER_POST {
                series_ids.push(id.clone());
            }
        }
        let event_type = short(&input.event_type, 120);
        if input.kind == PostKind::Milestone && (title.is_empty() || event_type.is_empty()) {
            return Err(Error::Invalid("A life event needs a type and a title.".into()));
        }
        let mut also_event_types: Vec<String> = Vec::new();
        for t in input.also_event_types.iter().map(|t| short(t, 120)) {
            if !t.is_empty() && t != event_type && !also_event_types.contains(&t) && also_event_types.len() < MAX_COMBINED_EVENTS {
                also_event_types.push(t);
            }
        }

        let now = now_millis();
        let post = Post {
            id: existing.as_ref().map_or_else(|| Uuid::new_v4().to_string(), |p| p.id.clone()),
            with_ids,
            place_id: input.place_id.clone(),
            feeling,
            activities,
            also_event_types: if input.kind == PostKind::Milestone { also_event_types } else { Vec::new() },
            event_type: if input.kind == PostKind::Milestone { event_type } else { String::new() },
            series_ids,
            trashed_at: None,
            trashed_with: None,
            kind: input.kind,
            title: if input.kind == PostKind::Status { String::new() } else { title },
            author_id: input.author_id,
            content,
            occurred_at: input.occurred_at.or(existing.as_ref().map(|p| p.occurred_at)).unwrap_or(now),
            media: attached,
            created_at: existing.as_ref().map_or(now, |p| p.created_at),
            updated_at: now,
        };

        // Write new blobs first, then the post, then drop detached blobs. A crash
        // at any point leaves at worst an unreferenced file, never a dangling reference.
        self.seal_staged(&post.media)?;
        self.write_post(&post)?;
        self.commit_staged(&post.media);
        let detached: Vec<String> =
            previous.iter().filter(|m| !post.media.iter().any(|n| n.id == m.id)).map(|m| m.id.clone()).collect();
        self.posts.insert(post.id.clone(), post.clone());
        self.reindex_media();
        self.index_post(&post.id);
        for id in detached {
            self.remove_media_file(&id)?;
        }
        Ok(post)
    }

    /// Moves a post (article, album) to the Trash.
    pub fn delete_post(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        self.trash_post(id, None)
    }

    fn trash_post(&mut self, id: &str, with: Option<&str>) -> Result<()> {
        let mut post = self.posts.get(id).cloned().ok_or_else(|| Error::NotFound(format!("post {id}")))?;
        post.trashed_at = Some(now_millis());
        post.trashed_with = with.map(str::to_owned);
        self.write_post(&post)?;
        self.posts.remove(id);
        self.trash.posts.insert(id.to_string(), post);
        self.reindex_media();
        self.index.remove(&DocKey::new(DocKind::Post, id));
        Ok(())
    }

    /// Replaces the people and products tagged on one photo of a post.
    pub fn set_photo_tags(&mut self, post_id: &str, media_id: &str, tags: Vec<PhotoTag>) -> Result<Post> {
        let mut post = self.posts.get(post_id).ok_or_else(|| Error::NotFound(format!("post {post_id}")))?.clone();
        let mut clean: Vec<PhotoTag> = Vec::new();
        for tag in tags {
            match (tag.profile_id.is_empty(), tag.item_id.is_empty()) {
                (false, true) if !self.profile_known(&tag.profile_id) => {
                    return Err(Error::NotFound(format!("profile {}", tag.profile_id)))
                }
                (true, false) if !self.items.contains_key(&tag.item_id) => return Err(Error::NotFound(format!("item {}", tag.item_id))),
                (false, true) | (true, false) => {}
                _ => return Err(Error::Invalid("Tag a person or a product.".into())),
            }
            if !(tag.x.is_finite() && tag.y.is_finite()) {
                return Err(Error::Invalid("Invalid tag position.".into()));
            }
            clean.retain(|t| t.profile_id != tag.profile_id || t.item_id != tag.item_id);
            clean.push(PhotoTag { x: tag.x.clamp(0.0, 1.0), y: tag.y.clamp(0.0, 1.0), ..tag });
        }
        clean.truncate(50);
        let media = post.media.iter_mut().find(|m| m.id == media_id).ok_or_else(|| Error::NotFound(format!("photo {media_id}")))?;
        media.tags = clean;
        post.updated_at = now_millis();
        self.write_post(&post)?;
        self.posts.insert(post.id.clone(), post.clone());
        self.reindex_media();
        self.index_post(post_id);
        Ok(post)
    }

    pub fn query_posts(&self, filter: &PostFilter) -> Vec<Post> {
        let matches: Option<HashSet<String>> = filter
            .search
            .as_deref()
            .map(Query::parse)
            .filter(|q| !q.is_empty())
            .map(|q| self.index.search(&q).into_iter().filter(|(k, _)| k.kind == DocKind::Post).map(|(k, _)| k.id).collect());
        let mut posts: Vec<Post> = self
            .posts
            .values()
            .filter(|p| match &filter.profile_id {
                Some(pid) => p.author_id == *pid || involved(p).contains(&pid.as_str()),
                None => true,
            })
            .filter(|p| filter.kind.map_or(true, |k| p.kind == k))
            .filter(|p| filter.series_id.as_ref().map_or(true, |s| p.series_ids.contains(s)))
            .filter(|p| filter.from.map_or(true, |from| p.occurred_at >= from))
            .filter(|p| filter.to.map_or(true, |to| p.occurred_at < to))
            .filter(|p| matches.as_ref().map_or(true, |m| m.contains(&p.id)))
            .cloned()
            .collect();
        posts.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at).then(b.created_at.cmp(&a.created_at)));
        posts
    }

    // ---- Items ----

    pub fn save_item(&mut self, input: ItemInput) -> Result<Item> {
        let name = required(&input.name, "Item name")?;
        let shop = self.profiles.get(&input.shop_id).ok_or_else(|| Error::NotFound(format!("shop {}", input.shop_id)))?;
        if !shop.can_sell() {
            return Err(Error::Invalid(format!("{} doesn't have a shop.", shop.name)));
        }
        if input.price_cents.is_some_and(|p| p < 0) {
            return Err(Error::Invalid("Price can't be negative.".into()));
        }
        let currency = match input.currency.trim() {
            "" => "USD".to_string(),
            c => c.to_uppercase(),
        };
        let now = now_millis();
        let existing = match &input.id {
            Some(id) => Some(self.items.get(id).ok_or_else(|| Error::NotFound(format!("item {id}")))?.clone()),
            None => None,
        };
        let created_at = existing.as_ref().map_or(now, |i| i.created_at);
        let source_url = match input.source_url.trim() {
            "" => existing.as_ref().map(|i| i.source_url.clone()).unwrap_or_default(),
            url => short(url, 2000),
        };
        let previous: Vec<MediaRef> = existing.map(|i| i.media).unwrap_or_default();
        let media = self.resolve_media(&input.media_ids, &previous, MAX_MEDIA_PER_ITEM, "item")?;
        let item = Item {
            id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            shop_id: input.shop_id,
            name,
            description: input.description.trim().to_string(),
            price_cents: input.price_cents,
            currency,
            status: input.status,
            media,
            source_url,
            trashed_at: None,
            trashed_with: None,
            created_at,
            updated_at: now,
        };
        // Same order as posts: blobs, then the record, then detached blobs.
        self.seal_staged(&item.media)?;
        self.write_record(Kind::Item, &item.id, &item, json!({}))?;
        self.commit_staged(&item.media);
        self.items.insert(item.id.clone(), item.clone());
        self.reindex_media();
        self.index_item(&item.id);
        for old in previous.iter().filter(|m| !item.media.iter().any(|n| n.id == m.id)) {
            self.remove_media_file(&old.id)?;
        }
        Ok(item)
    }

    /// Moves a product to the Trash. Photos it's tagged in keep the tag (hidden
    /// while it's trashed) until it's deleted forever.
    pub fn delete_item(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        self.trash_item(id, None)
    }

    fn trash_item(&mut self, id: &str, with: Option<&str>) -> Result<()> {
        let mut item = self.items.get(id).cloned().ok_or_else(|| Error::NotFound(format!("item {id}")))?;
        item.trashed_at = Some(now_millis());
        item.trashed_with = with.map(str::to_owned);
        self.write_record(Kind::Item, id, &item, json!({}))?;
        self.items.remove(id);
        self.trash.items.insert(id.to_string(), item);
        self.reindex_media();
        self.index.remove(&DocKey::new(DocKind::Item, id));
        Ok(())
    }

    // ---- Trash ----

    /// What's in the Trash: deleted posts, profiles and products, newest first.
    /// Posts and products that went with a deleted profile are counted under it.
    pub fn list_trash(&self) -> Vec<TrashEntry> {
        let with_count = |id: &str| {
            self.trash.posts.values().filter(|p| p.trashed_with.as_deref() == Some(id)).count()
                + self.trash.items.values().filter(|i| i.trashed_with.as_deref() == Some(id)).count()
        };
        let mut out: Vec<TrashEntry> = Vec::new();
        for p in self.trash.profiles.values() {
            let subtitle = serde_json::to_value(p.kind).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();
            out.push(TrashEntry { kind: "profile".into(), id: p.id.clone(), title: p.name.clone(), subtitle, trashed_at: p.trashed_at.unwrap_or(0), with_count: with_count(&p.id) });
        }
        for p in self.trash.posts.values().filter(|p| p.trashed_with.is_none()) {
            let title = if p.title.is_empty() {
                let text = search::markdown_to_plain(&p.content);
                let short: String = text.chars().take(80).collect();
                if short.is_empty() { format!("{} photo(s)", p.media.len()) } else { short }
            } else {
                p.title.clone()
            };
            let subtitle = serde_json::to_value(p.kind).ok().and_then(|v| v.as_str().map(str::to_owned)).unwrap_or_default();
            out.push(TrashEntry { kind: "post".into(), id: p.id.clone(), title, subtitle, trashed_at: p.trashed_at.unwrap_or(0), with_count: 0 });
        }
        for i in self.trash.items.values().filter(|i| i.trashed_with.is_none()) {
            out.push(TrashEntry { kind: "item".into(), id: i.id.clone(), title: i.name.clone(), subtitle: "product".into(), trashed_at: i.trashed_at.unwrap_or(0), with_count: 0 });
        }
        out.sort_by_key(|e| std::cmp::Reverse(e.trashed_at));
        out
    }

    /// Takes something out of the Trash. A profile brings back its posts and products.
    pub fn restore(&mut self, kind: &str, id: &str) -> Result<()> {
        validate_record_id(id)?;
        match kind {
            "post" => {
                let post = self.trash.posts.get(id).ok_or_else(|| Error::NotFound(format!("post {id} in the Trash")))?;
                if !self.profiles.contains_key(&post.author_id) {
                    return Err(Error::Invalid("Its author is in the Trash. Restore the author first.".into()));
                }
                self.untrash_post(id)
            }
            "item" => {
                let item = self.trash.items.get(id).ok_or_else(|| Error::NotFound(format!("item {id} in the Trash")))?;
                if !self.profiles.contains_key(&item.shop_id) {
                    return Err(Error::Invalid("Its shop is in the Trash. Restore the shop first.".into()));
                }
                self.untrash_item(id)
            }
            "profile" => {
                let mut profile = self.trash.profiles.get(id).cloned().ok_or_else(|| Error::NotFound(format!("profile {id} in the Trash")))?;
                profile.trashed_at = None;
                profile.trashed_with = None;
                self.write_record(Kind::Profile, id, &profile, json!({}))?;
                self.trash.profiles.remove(id);
                self.profiles.insert(id.to_string(), profile);
                self.index_profile(id);
                let posts: Vec<String> = self.trash.posts.values().filter(|p| p.trashed_with.as_deref() == Some(id)).map(|p| p.id.clone()).collect();
                for post_id in posts {
                    self.untrash_post(&post_id)?;
                }
                let items: Vec<String> = self.trash.items.values().filter(|i| i.trashed_with.as_deref() == Some(id)).map(|i| i.id.clone()).collect();
                for item_id in items {
                    self.untrash_item(&item_id)?;
                }
                // Posts that mention it find it by name again.
                let referring: Vec<String> = self.posts.values().filter(|p| involved(p).contains(&id)).map(|p| p.id.clone()).collect();
                for post_id in referring {
                    self.index_post(&post_id);
                }
                self.reindex_media();
                Ok(())
            }
            _ => Err(Error::Invalid(format!("Unknown kind {kind}."))),
        }
    }

    fn untrash_post(&mut self, id: &str) -> Result<()> {
        let mut post = self.trash.posts.get(id).cloned().ok_or_else(|| Error::NotFound(format!("post {id}")))?;
        post.trashed_at = None;
        post.trashed_with = None;
        // Series deleted in the meantime are gone.
        post.series_ids.retain(|s| self.series.contains_key(s));
        self.write_post(&post)?;
        self.trash.posts.remove(id);
        self.posts.insert(id.to_string(), post);
        self.reindex_media();
        self.index_post(id);
        Ok(())
    }

    fn untrash_item(&mut self, id: &str) -> Result<()> {
        let mut item = self.trash.items.get(id).cloned().ok_or_else(|| Error::NotFound(format!("item {id}")))?;
        item.trashed_at = None;
        item.trashed_with = None;
        self.write_record(Kind::Item, id, &item, json!({}))?;
        self.trash.items.remove(id);
        self.items.insert(id.to_string(), item);
        self.reindex_media();
        self.index_item(id);
        Ok(())
    }

    /// Deletes something in the Trash for good: its record and its photos and videos.
    pub fn purge(&mut self, kind: &str, id: &str) -> Result<()> {
        validate_record_id(id)?;
        match kind {
            "post" => {
                let post = self.trash.posts.remove(id).ok_or_else(|| Error::NotFound(format!("post {id} in the Trash")))?;
                self.remove_record(Kind::Post, id)?;
                for m in &post.media {
                    self.remove_media_file(&m.id)?;
                }
            }
            "item" => {
                let item = self.trash.items.remove(id).ok_or_else(|| Error::NotFound(format!("item {id} in the Trash")))?;
                self.remove_record(Kind::Item, id)?;
                self.strip_references(|t| t.item_id == id, None)?;
                for m in &item.media {
                    self.remove_media_file(&m.id)?;
                }
            }
            "profile" => {
                let profile = self.trash.profiles.get(id).cloned().ok_or_else(|| Error::NotFound(format!("profile {id} in the Trash")))?;
                let posts: Vec<String> = self.trash.posts.values().filter(|p| p.trashed_with.as_deref() == Some(id)).map(|p| p.id.clone()).collect();
                for post_id in posts {
                    self.purge("post", &post_id)?;
                }
                let items: Vec<String> = self.trash.items.values().filter(|i| i.trashed_with.as_deref() == Some(id)).map(|i| i.id.clone()).collect();
                for item_id in items {
                    self.purge("item", &item_id)?;
                }
                self.remove_record(Kind::Profile, id)?;
                self.trash.profiles.remove(id);
                for m in [&profile.avatar, &profile.cover].into_iter().flatten() {
                    self.remove_media_file(&m.id)?;
                }
                // Relationships with it, and tags of it in posts, go too.
                let related: Vec<Profile> = self.profiles.values().filter(|p| p.relations.iter().any(|r| r.to_id == id)).cloned().collect();
                for mut p in related {
                    p.relations.retain(|r| r.to_id != id);
                    self.put_profile(p)?;
                }
                self.strip_references(|t| t.profile_id == id, Some(id))?;
            }
            _ => return Err(Error::Invalid(format!("Unknown kind {kind}."))),
        }
        self.reindex_media();
        Ok(())
    }

    /// Removes photo tags matching `tag`, and (for a profile) "with" tags and
    /// check-ins of `profile`, from every post, live or trashed.
    fn strip_references(&mut self, tag: impl Fn(&PhotoTag) -> bool, profile: Option<&str>) -> Result<()> {
        let touches = |p: &Post| {
            p.media.iter().any(|m| m.tags.iter().any(&tag))
                || profile.is_some_and(|id| p.with_ids.iter().any(|w| w == id) || p.place_id.as_deref() == Some(id) || p.activities.iter().any(|a| a.with_ids.iter().any(|w| w == id)))
        };
        let affected: Vec<(bool, Post)> = self
            .posts
            .values()
            .map(|p| (true, p))
            .chain(self.trash.posts.values().map(|p| (false, p)))
            .filter(|(_, p)| touches(p))
            .map(|(live, p)| (live, p.clone()))
            .collect();
        for (live, mut post) in affected {
            for m in &mut post.media {
                m.tags.retain(|t| !tag(t));
            }
            if let Some(id) = profile {
                post.with_ids.retain(|w| w != id);
                if post.place_id.as_deref() == Some(id) {
                    post.place_id = None;
                }
                for a in &mut post.activities {
                    a.with_ids.retain(|w| w != id);
                }
            }
            self.write_post(&post)?;
            let id = post.id.clone();
            if live {
                self.posts.insert(id.clone(), post);
                self.index_post(&id);
            } else {
                self.trash.posts.insert(id, post);
            }
        }
        Ok(())
    }

    /// Deletes everything in the Trash for good. Returns how many entries went.
    pub fn empty_trash(&mut self) -> Result<usize> {
        let entries = self.list_trash();
        for e in &entries {
            // An entry may already have gone with its profile.
            match self.purge(&e.kind, &e.id) {
                Ok(()) | Err(Error::NotFound(_)) => {}
                Err(err) => return Err(err),
            }
        }
        // Anything left over (e.g. a post whose profile was restored, then deleted again separately).
        let posts: Vec<String> = self.trash.posts.keys().cloned().collect();
        for id in posts {
            self.purge("post", &id)?;
        }
        let items: Vec<String> = self.trash.items.keys().cloned().collect();
        for id in items {
            self.purge("item", &id)?;
        }
        Ok(entries.len())
    }

    // ---- Series ----

    pub fn save_series(&mut self, input: SeriesInput) -> Result<Series> {
        let title = required(&input.title, "Series title")?;
        let now = now_millis();
        let created_at = match &input.id {
            Some(id) => self.series.get(id).ok_or_else(|| Error::NotFound(format!("series {id}")))?.created_at,
            None => now,
        };
        let series = Series {
            id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            title: title.chars().take(200).collect(),
            description: short(&input.description, 5000),
            color: short(&input.color, 20),
            created_at,
            updated_at: now,
        };
        self.write_record(Kind::Series, &series.id, &series, json!({}))?;
        self.series.insert(series.id.clone(), series.clone());
        // Its title is searchable on its posts.
        let posts: Vec<String> = self.posts.values().filter(|p| p.series_ids.contains(&series.id)).map(|p| p.id.clone()).collect();
        for id in posts {
            self.index_post(&id);
        }
        Ok(series)
    }

    /// Every series with its posts in date order (oldest first: part 1, part 2, …).
    pub fn series_summaries(&self) -> Vec<SeriesSummary> {
        let mut out: Vec<SeriesSummary> = self
            .series
            .values()
            .map(|x| {
                let mut members: Vec<&Post> = self.posts.values().filter(|p| p.series_ids.contains(&x.id)).collect();
                members.sort_by_key(|p| (p.occurred_at, p.created_at));
                SeriesSummary {
                    series: x.clone(),
                    from: members.first().map(|p| p.occurred_at),
                    to: members.last().map(|p| p.occurred_at),
                    post_ids: members.iter().map(|p| p.id.clone()).collect(),
                }
            })
            .collect();
        out.sort_by_key(|x| (x.from.unwrap_or(i64::MAX), x.series.title.to_lowercase()));
        out
    }

    /// Deletes a series; its posts stay, just no longer part of it.
    pub fn delete_series(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        if self.series.remove(id).is_none() {
            return Err(Error::NotFound(format!("series {id}")));
        }
        self.remove_record(Kind::Series, id)?;
        let members: Vec<Post> = self.posts.values().filter(|p| p.series_ids.iter().any(|s| s == id)).cloned().collect();
        let trashed: Vec<Post> = self.trash.posts.values().filter(|p| p.series_ids.iter().any(|s| s == id)).cloned().collect();
        for mut post in trashed {
            post.series_ids.retain(|s| s != id);
            self.write_post(&post)?;
            self.trash.posts.insert(post.id.clone(), post);
        }
        for mut post in members {
            post.series_ids.retain(|s| s != id);
            self.write_post(&post)?;
            self.posts.insert(post.id.clone(), post.clone());
            self.index_post(&post.id);
        }
        Ok(())
    }

    // ---- Search ----

    /// Post text as a reader sees it: mentions resolved to names, Markdown stripped.
    fn post_plain_text(&self, post: &Post) -> String {
        let mut text = post.content.clone();
        for id in mentions(&post.content) {
            let name = self.profiles.get(id).map_or("", |p| p.name.as_str());
            text = text.replace(&format!("{MENTION_PREFIX}{id}]"), &format!("@{name}"));
        }
        search::markdown_to_plain(&text)
    }

    fn index_post(&mut self, id: &str) {
        let Some(post) = self.posts.get(id) else { return };
        let text = self.post_plain_text(post);
        let author = self.profiles.get(&post.author_id).map_or("", |p| p.name.as_str());
        let files = post.media.iter().map(|m| m.name.as_str()).collect::<Vec<_>>().join(" ");
        let captions = post.media.iter().map(|m| m.caption.as_str()).collect::<Vec<_>>().join("\n");
        let mentioned_in_text = mentions(&post.content);
        let tagged = involved(post)
            .into_iter()
            .filter(|id| !mentioned_in_text.contains(id))
            .filter_map(|id| self.profiles.get(id).map(|p| p.name.as_str()))
            .collect::<Vec<_>>()
            .join(" ");
        let activities = post
            .activities
            .iter()
            .map(|a| format!("{} {} {} {} {}", a.verb, a.adjectives, a.object, a.adverb, a.detail))
            .collect::<Vec<_>>()
            .join(" ");
        // Series titles and products tagged on its photos find a post too.
        let series = post.series_ids.iter().filter_map(|id| self.series.get(id).map(|x| x.title.as_str())).collect::<Vec<_>>().join(" ");
        let products = post
            .media
            .iter()
            .flat_map(|m| m.tags.iter())
            .filter_map(|t| self.items.get(&t.item_id).map(|i| i.name.as_str()))
            .collect::<Vec<_>>()
            .join(" ");
        let extra = format!(
            "{} {} {} {} {} {}",
            post.feeling.as_ref().map_or("", |f| f.text.as_str()),
            activities,
            post.event_type,
            post.also_event_types.join(" "),
            series,
            products
        );
        let fields = [
            Field { text: &post.title, weight: 2.5 },
            Field { text: &text, weight: 1.0 },
            Field { text: &captions, weight: 0.8 },
            Field { text: &tagged, weight: 0.8 },
            Field { text: &extra, weight: 0.6 },
            Field { text: author, weight: 0.5 },
            Field { text: &files, weight: 0.5 },
        ];
        let (key, tags, time) = (DocKey::new(DocKind::Post, id), hashtags(&post.content), post.occurred_at);
        self.index.upsert(key, &fields, &tags, time);
    }

    /// Indexes the profile document alone.
    fn index_profile_doc(&mut self, id: &str) {
        let Some(p) = self.profiles.get(id) else { return };
        let fields = [
            Field { text: &p.name, weight: 3.0 },
            Field { text: &p.tagline, weight: 1.5 },
            Field { text: &p.relationship, weight: 1.5 },
            Field { text: &p.category, weight: 1.5 },
            Field { text: &p.bio, weight: 1.0 },
            Field { text: &p.location, weight: 1.0 },
        ];
        self.index.upsert(DocKey::new(DocKind::Profile, id), &fields, &[], p.updated_at);
    }

    /// Indexes a profile, plus the posts and items whose text includes its name.
    fn index_profile(&mut self, id: &str) {
        self.index_profile_doc(id);
        let posts: Vec<String> = self
            .posts
            .values()
            .filter(|post| post.author_id == id || involved(post).contains(&id))
            .map(|post| post.id.clone())
            .collect();
        for post_id in posts {
            self.index_post(&post_id);
        }
        let items: Vec<String> = self.items.values().filter(|i| i.shop_id == id).map(|i| i.id.clone()).collect();
        for item_id in items {
            self.index_item(&item_id);
        }
    }

    fn index_item(&mut self, id: &str) {
        let Some(item) = self.items.get(id) else { return };
        let shop = self.profiles.get(&item.shop_id).map_or("", |p| p.name.as_str());
        let fields = [
            Field { text: &item.name, weight: 3.0 },
            Field { text: &item.description, weight: 1.0 },
            Field { text: shop, weight: 0.5 },
        ];
        self.index.upsert(DocKey::new(DocKind::Item, id), &fields, &[], item.updated_at);
    }

    fn rebuild_index(&mut self) {
        self.index = SearchIndex::default();
        let profiles: Vec<String> = self.profiles.keys().cloned().collect();
        let posts: Vec<String> = self.posts.keys().cloned().collect();
        let items: Vec<String> = self.items.keys().cloned().collect();
        profiles.iter().for_each(|id| self.index_profile_doc(id));
        posts.iter().for_each(|id| self.index_post(id));
        items.iter().for_each(|id| self.index_item(id));
    }

    /// Ranked results across posts, profiles and items, with snippets.
    pub fn search(&self, input: &str, limit: usize) -> SearchResults {
        let query = Query::parse(input);
        let terms = query.highlight_terms();
        let mut results = SearchResults { terms: terms.clone(), ..Default::default() };
        if query.is_empty() {
            return results;
        }
        for (key, _) in self.index.search(&query) {
            match key.kind {
                DocKind::Post => {
                    results.totals.posts += 1;
                    if results.posts.len() < limit {
                        let post = &self.posts[&key.id];
                        let mut text = self.post_plain_text(post);
                        for m in post.media.iter().filter(|m| !m.caption.is_empty()) {
                            text.push('\n');
                            text.push_str(&m.caption);
                        }
                        let snippet = search::snippet(&text, &terms, 180);
                        results.posts.push(PostHit { post: post.clone(), snippet });
                    }
                }
                DocKind::Profile => {
                    results.totals.profiles += 1;
                    if results.profiles.len() < limit {
                        let p = &self.profiles[&key.id];
                        let text = [p.tagline.as_str(), &p.bio, &p.relationship, &p.category, &p.location]
                            .iter()
                            .filter(|s| !s.is_empty())
                            .copied()
                            .collect::<Vec<_>>()
                            .join(" · ");
                        results.profiles.push(Hit { id: key.id.clone(), snippet: search::snippet(&text, &terms, 120) });
                    }
                }
                DocKind::Item => {
                    results.totals.items += 1;
                    if results.items.len() < limit {
                        let item = &self.items[&key.id];
                        results.items.push(Hit { id: key.id.clone(), snippet: search::snippet(&item.description, &terms, 120) });
                    }
                }
            }
        }
        results
    }

    // ---- Views ----

    pub fn snapshot(&self) -> Snapshot {
        let mut stats: HashMap<String, ProfileStats> =
            self.profiles.keys().map(|id| (id.clone(), ProfileStats::default())).collect();
        for post in self.posts.values() {
            stats.entry(post.author_id.clone()).or_default().posts += 1;
            let unique: HashSet<&str> = involved(post).into_iter().collect();
            for id in unique {
                if let Some(s) = stats.get_mut(id) {
                    s.mentions += 1;
                }
            }
        }

        let mut profiles: Vec<Profile> = self.profiles.values().cloned().collect();
        profiles.sort_by_key(|p| p.name.to_lowercase());
        let mut items: Vec<Item> = self.items.values().cloned().collect();
        items.sort_by_key(|i| std::cmp::Reverse(i.created_at));

        let kdf = &self.config.kdf;
        Snapshot {
            workspace: WorkspaceSummary {
                id: self.id.clone(),
                label: label_of(&self.id),
                name: self.manifest.name.clone(),
                owner_profile_id: self.manifest.owner_profile_id.clone(),
            },
            profiles,
            items,
            series: self.series_summaries(),
            trash_count: self.list_trash().len(),
            stats,
            post_dates: self.posts.values().map(|p| p.occurred_at).collect(),
            migration: self.migration_status(),
            storage: StorageInfo {
                path: self.dir.display().to_string(),
                cipher: "AES-256-GCM".into(),
                kdf: "Argon2id".into(),
                kdf_memory_kib: kdf.memory_kib,
                kdf_iterations: kdf.iterations,
                kdf_parallelism: kdf.parallelism,
                pad_block: record::PAD_BLOCK,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfCost = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };

    fn person(name: &str, kind: ProfileKind) -> ProfileInput {
        ProfileInput {
            source_url: String::new(),
            id: None,
            kind,
            name: name.into(),
            tagline: String::new(),
            bio: String::new(),
            relationship: String::new(),
            category: String::new(),
            location: String::new(),
            color: "pink".into(),
            has_shop: false,
            genders: Vec::new(),
            pronouns: String::new(),
            terms: "neutral".into(),
            relationship_status: String::new(),
        }
    }

    fn walk(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                out.extend(walk(&path));
            } else {
                out.push(path);
            }
        }
        out
    }

    /// Record files under a kind's folder, in any subfolder.
    fn files_in(dir: &Path) -> usize {
        record_files(dir).map(|f| f.len()).unwrap_or(0)
    }

    /// Asserts that none of `needles` appear anywhere under `root`.
    fn assert_no_plaintext(root: &Path, needles: &[&str]) {
        for path in walk(root) {
            let text = String::from_utf8_lossy(&fs::read(&path).unwrap()).to_string();
            for needle in needles {
                assert!(!text.contains(needle), "{} leaks {needle:?}", path.display());
            }
        }
    }

    #[test]
    fn slugify_names() {
        assert_eq!(slugify("  Personal Journal! "), "personal_journal");
        assert_eq!(slugify("Travel / 2026"), "travel_2026");
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn parses_mentions_and_tags() {
        let content = "Coffee at @[profile:a] with @[profile:b] and @[profile:a]. Broken @[profile:c";
        assert_eq!(mentions(content), vec!["a", "b", "a"]);
        assert_eq!(hashtags("#Coffee time (#family) #coffee x#no #1 #a-b_c"), vec!["coffee", "family", "a-b_c"]);
    }

    #[test]
    fn create_and_unlock() {
        let root = tempfile::tempdir().unwrap();
        let ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        assert_eq!(ws.id, "workspace_personal");
        assert_eq!(ws.profiles[ws.owner_id()].kind, ProfileKind::Me);
        assert!(ws.migration_status().pending.is_empty());

        let listed = list_workspaces(root.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].label, "personal");

        assert!(matches!(open_workspace(root.path(), &ws.id, "wrong password"), Err(Error::BadPassword)));
        let reopened = open_workspace(root.path(), &ws.id, "correct horse").unwrap();
        assert_eq!(reopened.owner_id(), ws.owner_id());
        assert_eq!(reopened.manifest.name, "Personal");
        assert_eq!(reopened.snapshot().migration.stale_files, 0);
    }

    #[test]
    fn folder_label_hides_the_name() {
        let root = tempfile::tempdir().unwrap();
        let ws = create_workspace(root.path(), "Journal 2", "Secret Affairs", "Alex Hidden", "correct horse", FAST).unwrap();
        assert_eq!(ws.id, "workspace_journal_2");
        assert_no_plaintext(root.path(), &["Secret", "Affairs", "Alex", "Hidden"]);
        assert_eq!(open_workspace(root.path(), &ws.id, "correct horse").unwrap().manifest.name, "Secret Affairs");
    }

    #[test]
    fn rejects_short_password_and_duplicate_workspace() {
        let root = tempfile::tempdir().unwrap();
        assert!(create_workspace(root.path(), "", "A", "Me", "short", FAST).is_err());
        create_workspace(root.path(), "", "A", "Me", "long enough", FAST).unwrap();
        assert!(create_workspace(root.path(), "a", "Other", "Me", "long enough", FAST).is_err());
    }

    #[test]
    fn records_persist_encrypted() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();

        let sarah = ws.save_profile(person("Sarah Secretname", ProfileKind::Person)).unwrap();
        let shop = ws.save_profile(person("The Rusty Bean", ProfileKind::Shop)).unwrap();
        assert!(shop.has_shop);
        ws.save_post(PostInput {
            id: None,
            kind: Default::default(),
            title: String::new(),
            captions: Default::default(),
            author_id: owner.clone(),
            content: format!("Latte at @[profile:{}] with @[profile:{}] #coffee", shop.id, sarah.id),
            occurred_at: Some(1_000),
            media_ids: vec![],
            ..Default::default()
        })
        .unwrap();
        ws.save_post(PostInput { kind: Default::default(), title: String::new(), captions: Default::default(), id: None, author_id: sarah.id.clone(), content: "Hi from Sarah".into(), occurred_at: Some(2_000), media_ids: vec![], ..Default::default() })
            .unwrap();
        ws.save_item(ItemInput {
            source_url: String::new(),
            media_ids: Vec::new(),
            id: None,
            shop_id: shop.id.clone(),
            name: "Pour-over".into(),
            description: String::new(),
            price_cents: Some(450),
            currency: String::new(),
            status: ItemStatus::Available,
        })
        .unwrap();

        assert_no_plaintext(root.path(), &["Secretname", "Latte", "Rusty", "Pour-over", "Personal", "coffee"]);
        for path in walk(root.path()).into_iter().filter(|p| p.extension().is_some_and(|e| e == "enc")) {
            let len = fs::metadata(&path).unwrap().len() as usize;
            assert_eq!((len - 5 - 12 - 16) % record::PAD_BLOCK, 0, "{} not padded", path.display());
        }

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.profiles.len(), 3);
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items.values().next().unwrap().currency, "USD");

        // Posts carry pre-built front matter.
        let post = ws.posts.values().find(|p| p.author_id == owner).unwrap();
        let bytes = fs::read(root.path().join("workspace_personal").join(record_rel_path(Kind::Post, &post.id))).unwrap();
        let meta = record::decode(&ws.key, Kind::Post, &post.id, &bytes).unwrap().meta;
        assert_eq!(meta["tags"], json!(["coffee"]));
        assert_eq!(meta["mentions"].as_array().unwrap().len(), 2);

        let snap = ws.snapshot();
        assert_eq!(snap.stats[&sarah.id].mentions, 1);
        assert_eq!(snap.stats[&sarah.id].posts, 1);
        assert_eq!(snap.stats[&shop.id].mentions, 1);

        let sarahs = ws.query_posts(&PostFilter { profile_id: Some(sarah.id.clone()), ..Default::default() });
        assert_eq!(sarahs.len(), 2);
        assert_eq!(sarahs[0].occurred_at, 2_000, "newest first");
        let ranged = ws.query_posts(&PostFilter { from: Some(1_500), to: Some(3_000), ..Default::default() });
        assert_eq!(ranged.len(), 1);
        let searched = ws.query_posts(&PostFilter { search: Some("LATTE".into()), ..Default::default() });
        assert_eq!(searched.len(), 1);
    }

    #[test]
    fn profile_rules_and_cascading_delete() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();

        assert!(ws.save_profile(person("Second me", ProfileKind::Me)).is_err());
        assert!(ws.delete_profile(&owner).is_err());

        let page = ws.save_profile(person("Book Club", ProfileKind::Page)).unwrap();
        let item = ItemInput {
            source_url: String::new(),
            media_ids: Vec::new(),
            id: None,
            shop_id: page.id.clone(),
            name: "Tote bag".into(),
            description: String::new(),
            price_cents: None,
            currency: "lkr".into(),
            status: ItemStatus::Available,
        };
        assert!(ws.save_item(item.clone()).is_err(), "page without a shop can't sell");

        let page = ws
            .save_profile(ProfileInput { id: Some(page.id.clone()), has_shop: true, ..person("Book Club", ProfileKind::Page) })
            .unwrap();
        assert_eq!(ws.save_item(item).unwrap().currency, "LKR");
        assert!(
            ws.save_profile(ProfileInput { id: Some(page.id.clone()), has_shop: false, ..person("Book Club", ProfileKind::Page) })
                .is_err(),
            "can't disable a shop that still lists items"
        );

        ws.save_post(PostInput { kind: Default::default(), title: String::new(), captions: Default::default(), id: None, author_id: page.id.clone(), content: "Meeting Friday".into(), occurred_at: None, media_ids: vec![], ..Default::default() }).unwrap();
        ws.delete_profile(&page.id).unwrap();
        assert!(ws.posts.is_empty() && ws.items.is_empty());

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.profiles.len(), 1);
        assert!(ws.posts.is_empty() && ws.items.is_empty());
    }

    #[test]
    fn rejects_path_traversal() {
        let root = tempfile::tempdir().unwrap();
        assert!(open_workspace(root.path(), "../etc", "x").is_err());
        let mut ws = create_workspace(root.path(), "", "P", "Me", "long enough", FAST).unwrap();
        assert!(ws.delete_post("../../workspace.json").is_err());
    }

    fn post(author: &str, content: &str, media_ids: Vec<String>) -> PostInput {
        PostInput { author_id: author.into(), content: content.into(), media_ids, ..Default::default() }
    }

    fn decrypt_saved(ws: &mut Workspace, id: &str) -> Vec<u8> {
        ws.media.cache = MediaCache::default(); // force a disk read
        match ws.media_lookup(id).unwrap().1 {
            MediaSource::Encrypted { key, path, .. } => record::decode_blob(&key, id, &fs::read(path).unwrap()).unwrap().to_vec(),
            MediaSource::Ready(_) => panic!("expected an encrypted source"),
        }
    }

    #[test]
    fn media_lifecycle() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let media_dir = root.path().join("workspace_personal/media");

        let mut png = b"\x89PNG\r\n\x1a\nSECRETPIXELS".to_vec();
        png.resize(3000, 7);
        let jpeg = [&[0xFF, 0xD8, 0xFF, 0xE0][..], b"MOREPIXELS"].concat();
        assert!(ws.stage_media("x.svg", b"<svg/>".to_vec()).is_err(), "unknown type");
        assert!(ws.stage_media("big.png", [&png[..8], &vec![0; media::MAX_IMAGE_BYTES]].concat()).is_err(), "too big");

        let a = ws.stage_media("beach.png", png.clone()).unwrap();
        let b = ws.stage_media("", jpeg.clone()).unwrap();
        assert_eq!((a.kind, a.mime.as_str(), a.size), (MediaKind::Image, "image/png", 3000));
        assert_eq!(b.name, "image.jpeg");
        assert!(matches!(ws.media_lookup(&a.id).unwrap().1, MediaSource::Ready(_)), "staged media is servable");
        assert_eq!(files_in(&media_dir), 0, "staging writes nothing");

        assert!(ws.save_post(post(&owner, "", vec![])).is_err(), "empty post");
        assert!(ws.save_post(post(&owner, "x", vec![Uuid::new_v4().to_string()])).is_err(), "unknown attachment");
        let saved = ws.save_post(post(&owner, "", vec![a.id.clone(), b.id.clone(), a.id.clone()])).unwrap();
        assert_eq!(saved.media.iter().map(|m| &m.id).collect::<Vec<_>>(), vec![&a.id, &b.id], "ordered, deduped");
        assert_eq!(files_in(&media_dir), 2);
        assert_no_plaintext(root.path(), &["SECRETPIXELS", "MOREPIXELS", "beach.png"]);

        let mut ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(decrypt_saved(&mut ws, &a.id), png);
        assert_eq!(ws.posts[&saved.id].media[0].name, "beach.png");

        // Detaching an attachment deletes its file.
        let edited = PostInput { id: Some(saved.id.clone()), ..post(&owner, "Beach day", vec![a.id.clone()]) };
        ws.save_post(edited).unwrap();
        assert!(!media_dir.join(shard_of(&b.id)).join(format!("{}.enc", b.id)).exists());
        assert!(ws.media_lookup(&b.id).is_err());

        // Discarded uploads can't be attached.
        let c = ws.stage_media("c.png", png.clone()).unwrap();
        ws.discard_media(std::slice::from_ref(&c.id));
        assert!(ws.save_post(post(&owner, "x", vec![c.id])).is_err());

        let before = files_in(&media_dir);
        ws.delete_post(&saved.id).unwrap();
        assert_eq!(files_in(&media_dir), before, "a trashed post keeps its media");
        ws.purge("post", &saved.id).unwrap();
        assert_eq!(files_in(&media_dir), 0, "deleting it forever deletes its media");
    }

    #[test]
    fn search_tracks_every_change() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let sarah = ws.save_profile(ProfileInput { bio: "Loves crosswords".into(), ..person("Sarah Jenkins", ProfileKind::Person) }).unwrap();
        let shop = ws.save_profile(person("The Rusty Bean", ProfileKind::Shop)).unwrap();
        let p = ws
            .save_post(post(&owner, &format!("Had a **latte** at @[profile:{}] with @[profile:{}] #Coffee", shop.id, sarah.id), vec![]))
            .unwrap();
        ws.save_item(ItemInput {
            source_url: String::new(),
            media_ids: Vec::new(),
            id: None,
            shop_id: shop.id.clone(),
            name: "Pour-over".into(),
            description: "Single origin, brewed slowly".into(),
            price_cents: None,
            currency: String::new(),
            status: ItemStatus::Available,
        })
        .unwrap();

        let r = ws.search("sarah", 10);
        assert_eq!((r.totals.profiles, r.totals.posts), (1, 1), "profile and the post mentioning her");
        assert!(r.posts[0].snippet.contains("@Sarah Jenkins"), "mentions resolve to names: {}", r.posts[0].snippet);
        assert!(!r.posts[0].snippet.contains("**"), "markdown stripped");
        assert_eq!(ws.search("crossword", 10).profiles[0].snippet, "Loves crosswords");
        assert_eq!(ws.search("#coffee", 10).totals.posts, 1);
        assert_eq!(ws.search("brewed", 10).items[0].id, ws.items.keys().next().unwrap().clone());
        assert_eq!(ws.search("rusty", 10).totals, SearchTotals { posts: 1, profiles: 1, items: 1 });
        let timeline = ws.query_posts(&PostFilter { search: Some("lat".into()), ..Default::default() });
        assert_eq!(timeline.len(), 1, "timeline search uses the index with prefixes");

        // Renaming a profile re-indexes posts that mention it.
        ws.save_profile(ProfileInput { id: Some(sarah.id.clone()), ..person("Sara Lee", ProfileKind::Person) }).unwrap();
        assert_eq!(ws.search("lee", 10).totals.posts, 1);
        assert_eq!(ws.search("jenkins", 10).totals.posts, 0);

        // Editing a post replaces its terms.
        ws.save_post(PostInput { id: Some(p.id.clone()), ..post(&owner, "Tea instead #tea", vec![]) }).unwrap();
        assert_eq!(ws.search("latte", 10).totals.posts, 0);
        assert_eq!(ws.search("#tea", 10).totals.posts, 1);

        // Rebuilt from scratch on unlock.
        let ws2 = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws2.search("tea", 10).totals.posts, 1);
        assert_eq!(ws2.search("lee", 10).totals.profiles, 1);

        ws.delete_profile(&shop.id).unwrap();
        assert_eq!(ws.search("rusty", 10).totals, SearchTotals::default());
        ws.delete_post(&p.id).unwrap();
        assert_eq!(ws.search("tea", 10).totals.posts, 0);
    }

    /// A workspace with a profile, a post and an attached image.
    fn populated(root: &Path) -> (Workspace, Vec<u8>, String) {
        let mut ws = create_workspace(root, "", "Personal", "Alex", "old password", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let sarah = ws.save_profile(person("Sarah", ProfileKind::Person)).unwrap();
        let png = [&b"\x89PNG\r\n\x1a\n"[..], &[3u8; 5000]].concat();
        let media = ws.stage_media("p.png", png.clone()).unwrap();
        ws.save_post(post(&owner, &format!("Walk with @[profile:{}]", sarah.id), vec![media.id.clone()])).unwrap();
        (ws, png, media.id)
    }

    fn snapshot_files(root: &Path) -> HashMap<PathBuf, Vec<u8>> {
        walk(root).into_iter().map(|p| (p.clone(), fs::read(&p).unwrap())).collect()
    }

    #[test]
    fn change_password_rewraps_key() {
        let root = tempfile::tempdir().unwrap();
        let (mut ws, _, _) = populated(root.path());
        assert!(matches!(ws.change_password("wrong", "new password", false, FAST), Err(Error::BadPassword)));
        assert!(ws.change_password("old password", "short", false, FAST).is_err());
        assert!(ws.change_password("old password", "old password", false, FAST).is_err());

        let before = snapshot_files(root.path());
        let change = ws.change_password("old password", "new password", false, FAST).unwrap();
        assert_eq!((change.rotated, change.files_rewritten), (false, 1));
        let after = snapshot_files(root.path());
        for (path, bytes) in &before {
            let same = &after[path] == bytes;
            assert_eq!(same, !path.ends_with(CONFIG_FILE), "{}", path.display());
        }

        assert!(matches!(open_workspace(root.path(), "workspace_personal", "old password"), Err(Error::BadPassword)));
        let reopened = open_workspace(root.path(), "workspace_personal", "new password").unwrap();
        assert_eq!(reopened.posts.len(), 1);
        // The session keeps working with the new password.
        assert!(ws.change_password("new password", "third password", false, FAST).is_ok());
    }

    #[test]
    fn change_password_rotates_key() {
        let root = tempfile::tempdir().unwrap();
        let (mut ws, png, media_id) = populated(root.path());
        let before = snapshot_files(root.path());

        let change = ws.change_password("old password", "new password", true, FAST).unwrap();
        assert!(change.rotated);
        assert_eq!(change.files_rewritten, 6, "manifest, 2 profiles, post, media, config");
        let after = snapshot_files(root.path());
        assert_eq!(before.len(), after.len(), "same set of files");
        for (path, bytes) in &before {
            assert_ne!(&after[path], bytes, "{} was not re-encrypted", path.display());
        }
        assert!(!root.path().join("workspace_personal").join(ROTATE_DIR).exists());

        // The live session uses the new key: saving and reading media still work.
        let owner = ws.owner_id().to_string();
        ws.save_post(post(&owner, "after rotation", vec![])).unwrap();
        assert_eq!(decrypt_saved(&mut ws, &media_id), png);

        assert!(matches!(open_workspace(root.path(), "workspace_personal", "old password"), Err(Error::BadPassword)));
        let mut reopened = open_workspace(root.path(), "workspace_personal", "new password").unwrap();
        assert_eq!(reopened.posts.len(), 2);
        assert_eq!(decrypt_saved(&mut reopened, &media_id), png);
        assert_eq!(reopened.search("walk", 10).totals.posts, 1);
    }

    #[test]
    fn rotation_completes_pending_migration() {
        let root = tempfile::tempdir().unwrap();
        write_phase1_workspace(root.path());
        let mut ws = open_workspace(root.path(), "workspace_old", "correct horse").unwrap();
        assert!(ws.migration_status().stale_files > 0);
        ws.change_password("correct horse", "brand new pass", true, FAST).unwrap();
        assert_eq!(ws.migration_status().stale_files, 0);
        assert_no_plaintext(root.path(), &["Old Plaintext Name"]);
        let ws = open_workspace(root.path(), "workspace_old", "brand new pass").unwrap();
        assert_eq!(ws.migration_status().stale_files, 0);
        assert_eq!(ws.manifest.name, "Old Plaintext Name");
    }

    #[test]
    fn recovers_from_interrupted_rotation() {
        // Crash while staging: the half-staged copy is discarded.
        let root = tempfile::tempdir().unwrap();
        let (ws, _, _) = populated(root.path());
        let dir = root.path().join("workspace_personal");
        fs::create_dir_all(dir.join(ROTATE_DIR).join("posts")).unwrap();
        fs::write(dir.join(ROTATE_DIR).join("posts/junk.enc"), b"partial").unwrap();
        drop(ws);
        let ws = open_workspace(root.path(), "workspace_personal", "old password").unwrap();
        assert!(!dir.join(ROTATE_DIR).exists());

        // Crash halfway through the commit: unlocking rolls it forward.
        let new_key = crypto::random_key();
        let config = wrap_key(&new_key, "new password", FAST).unwrap();
        ws.stage_rotation(&dir.join(ROTATE_DIR), &new_key, &config).unwrap();
        fs::rename(dir.join(ROTATE_DIR).join(MANIFEST_FILE), dir.join(MANIFEST_FILE)).unwrap();
        let (id, first_profile) = record_files(&dir.join(ROTATE_DIR).join("entities")).unwrap().remove(0);
        fs::rename(&first_profile, dir.join(record_rel_path(Kind::Profile, &id))).unwrap();
        drop(ws);

        let ws = open_workspace(root.path(), "workspace_personal", "new password").unwrap();
        assert!(!dir.join(ROTATE_DIR).exists());
        assert_eq!((ws.profiles.len(), ws.posts.len()), (2, 1));
        assert!(matches!(open_workspace(root.path(), "workspace_personal", "old password"), Err(Error::BadPassword)));
    }

    #[test]
    fn articles_and_albums() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let png = |n: u8| [&b"\x89PNG\r\n\x1a\n"[..], &[n; 100]].concat();
        let kinded = |kind, title: &str, content: &str, media_ids: Vec<String>| PostInput { kind, title: title.into(), ..post(&owner, content, media_ids) };

        // Validation.
        assert!(ws.save_post(kinded(PostKind::Article, "", "body", vec![])).is_err(), "article needs a title");
        assert!(ws.save_post(kinded(PostKind::Article, "Title", "", vec![])).is_err(), "article needs text");
        assert!(ws.save_post(kinded(PostKind::Album, "Trip", "", vec![])).is_err(), "album needs media");
        let status = ws.save_post(kinded(PostKind::Status, "ignored", "hello", vec![])).unwrap();
        assert_eq!(status.title, "", "statuses have no title");

        let article = ws.save_post(kinded(PostKind::Article, "  On Kayaking  ", "Long *form* text about paddles", vec![])).unwrap();
        assert_eq!(article.title, "On Kayaking");

        // An album with captions, larger than a normal post allows.
        let ids: Vec<String> = (0..25).map(|i| ws.stage_media(&format!("{i}.png"), png(i)).unwrap().id).collect();
        let mut input = kinded(PostKind::Album, "Lake weekend", "Two days by the water", ids.clone());
        input.captions.insert(ids[0].clone(), "  Sunrise over the dock ".into());
        let album = ws.save_post(input).unwrap();
        assert_eq!(album.media.len(), 25);
        assert_eq!(album.media[0].caption, "Sunrise over the dock");
        assert!(ws.save_post(kinded(PostKind::Status, "", "too many", ids.clone())).is_err(), "statuses keep the 20 limit");

        // Captions survive edits that don't mention them, and change when sent.
        let mut reorder = PostInput { id: Some(album.id.clone()), ..kinded(PostKind::Album, "Lake weekend", "", vec![ids[1].clone(), ids[0].clone()]) };
        reorder.captions.insert(ids[1].clone(), "New cover".into());
        let album = ws.save_post(reorder).unwrap();
        assert_eq!((album.media[0].id.as_str(), album.media[0].caption.as_str()), (ids[1].as_str(), "New cover"));
        assert_eq!(album.media[1].caption, "Sunrise over the dock");
        assert_eq!(files_in(&root.path().join("workspace_personal/media")), 2, "dropped photos deleted");

        // Persisted, filterable and searchable.
        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.posts[&album.id].media[1].caption, "Sunrise over the dock");
        let albums = ws.query_posts(&PostFilter { kind: Some(PostKind::Album), ..Default::default() });
        assert_eq!(albums.iter().map(|p| &p.id).collect::<Vec<_>>(), vec![&album.id]);
        assert_eq!(ws.search("kayaking", 10).posts[0].post.id, article.id, "title is indexed");
        let by_caption = ws.search("sunrise dock", 10);
        assert_eq!(by_caption.posts[0].post.id, album.id, "captions are indexed");
        assert!(by_caption.posts[0].snippet.contains("Sunrise"), "{}", by_caption.posts[0].snippet);
    }

    #[test]
    fn tags_feelings_and_milestones() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let sarah = ws.save_profile(person("Sarah Jenkins", ProfileKind::Person)).unwrap();
        let dev = ws.save_profile(person("Dev Patel", ProfileKind::Person)).unwrap();
        let lake = ws.save_profile(person("Lake Minnetonka", ProfileKind::Place)).unwrap();

        let base = || post(&owner, "Paddling", vec![]);
        assert!(ws.save_post(PostInput { place_id: Some(sarah.id.clone()), ..base() }).is_err(), "check in at a person");
        assert!(ws.save_post(PostInput { with_ids: vec!["missing".into()], ..base() }).is_err());
        assert!(ws.save_post(PostInput { kind: PostKind::Milestone, title: "New job".into(), ..base() }).is_err(), "needs a type");

        let p = ws
            .save_post(PostInput {
                with_ids: vec![sarah.id.clone(), sarah.id.clone()],
                place_id: Some(lake.id.clone()),
                feeling: Some(Feeling { emoji: "😊".into(), text: " feeling happy ".into() }),
                ..base()
            })
            .unwrap();
        assert_eq!(p.with_ids, vec![sarah.id.clone()], "deduplicated");
        assert_eq!(p.feeling.as_ref().unwrap().text, "feeling happy");
        assert_eq!(ws.snapshot().stats[&lake.id].mentions, 1, "check-ins count as mentions");
        assert_eq!(ws.query_posts(&PostFilter { profile_id: Some(sarah.id.clone()), ..Default::default() }).len(), 1);
        assert_eq!(ws.search("sarah", 10).totals.posts, 1, "tagged names are searchable");
        assert_eq!(ws.search("happy", 10).totals.posts, 1, "feelings are searchable");

        // Several activities on one post, cleaned and searchable.
        let act = |verb: &str, object: &str| Activity { emoji: "✨".into(), verb: verb.into(), object: object.into(), ..Default::default() };
        let busy = ws
            .save_post(PostInput {
                activities: vec![act("working as", " a nurse "), act("attending", "an office party"), act("wearing", "a saree"), act("eating", "")],
                ..base()
            })
            .unwrap();
        assert_eq!(busy.activities.len(), 3, "empty objects are dropped");
        assert_eq!(busy.activities[0].object, "a nurse");
        assert_eq!(ws.search("saree", 10).totals.posts, 1, "activities are searchable");
        let many = ws.save_post(PostInput { activities: (0..20).map(|i| act("doing", &format!("thing {i}"))).collect(), ..base() }).unwrap();
        assert_eq!(many.activities.len(), 12);

        // A clause can tag its own people and add text; a life event clause has no verb.
        let party = Activity { with_ids: vec![sarah.id.clone(), sarah.id.clone()], detail: " for the first time ".into(), ..act("attending", "an office party") };
        let graduated = Activity { thing: "event:education.earned@bsc".into(), ..act("", "earned a BSc") };
        let story = ws.save_post(PostInput { activities: vec![party.clone(), graduated], ..base() }).unwrap();
        assert_eq!(story.activities[0].with_ids, vec![sarah.id.clone()]);
        assert_eq!(story.activities[0].detail, "for the first time");
        let styled = ws
            .save_post(PostInput { activities: vec![Activity { adjectives: " gorgeous red ".into(), adverb: "proudly".into(), ..act("wearing", "a saree") }], ..base() })
            .unwrap();
        assert_eq!((styled.activities[0].adjectives.as_str(), styled.activities[0].adverb.as_str()), ("gorgeous red", "proudly"));
        assert_eq!(ws.search("gorgeous", 10).totals.posts, 1, "descriptions are searchable");
        assert_eq!(story.activities[1].verb, "");
        let was = ws.save_post(PostInput { activities: vec![Activity { tense: "was".into(), ..act("feeling", "festive") }, Activity { tense: "will be".into(), ..act("feeling", "tired") }], ..base() }).unwrap();
        assert_eq!((was.activities[0].tense.as_str(), was.activities[1].tense.as_str()), ("was", ""), "only is/was");
        assert!(involved(&story).contains(&sarah.id.as_str()), "clause tags count as involvement");
        let ghost = Activity { with_ids: vec!["missing".into()], ..party };
        assert!(ws.save_post(PostInput { activities: vec![ghost], ..base() }).is_err());

        // Photo tags.
        let img = ws.stage_media("p.png", [&b"\x89PNG\r\n\x1a\n"[..], &[1u8; 50]].concat()).unwrap();
        let photo = ws.save_post(post(&owner, "", vec![img.id.clone()])).unwrap();
        let tag = |id: &str, x: f32| PhotoTag { profile_id: id.into(), x, y: 0.5, ..Default::default() };
        let tagged = ws.set_photo_tags(&photo.id, &img.id, vec![tag(&dev.id, 0.2), tag(&dev.id, 1.7)]).unwrap();
        assert_eq!(tagged.media[0].tags, vec![tag(&dev.id, 1.0)], "one tag per person, clamped");
        assert!(ws.set_photo_tags(&photo.id, &img.id, vec![tag("nobody", 0.1)]).is_err());
        assert_eq!(ws.query_posts(&PostFilter { profile_id: Some(dev.id.clone()), ..Default::default() }).len(), 1);
        // Editing the post keeps its photo tags.
        let edited = ws.save_post(PostInput { id: Some(photo.id.clone()), ..post(&owner, "Caption", vec![img.id.clone()]) }).unwrap();
        assert_eq!(edited.media[0].tags.len(), 1);

        let milestone = ws
            .save_post(PostInput { kind: PostKind::Milestone, title: "Started at the Bean".into(), event_type: "work".into(), ..base() })
            .unwrap();
        assert_eq!(milestone.event_type, "work");
        let status = ws.save_post(PostInput { event_type: "work".into(), ..base() }).unwrap();
        assert_eq!(status.event_type, "", "only milestones keep a type");

        // Combined life events: deduplicated, without the main one, at most four more.
        let also = ["education.graduated", "work", "relationship.got_engaged", "relationship.got_engaged", "a", "b", "c"];
        let combined = ws
            .save_post(PostInput {
                kind: PostKind::Milestone,
                title: "Graduated and got engaged".into(),
                event_type: "work".into(),
                also_event_types: also.iter().map(|s| s.to_string()).collect(),
                ..base()
            })
            .unwrap();
        assert_eq!(combined.also_event_types, ["education.graduated", "relationship.got_engaged", "a", "b"]);

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.posts[&p.id].place_id.as_deref(), Some(lake.id.as_str()));
        assert_eq!(ws.posts[&photo.id].media[0].tags.len(), 1);
    }

    #[test]
    fn relationships() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let sarah = ws.save_profile(person("Sarah", ProfileKind::Person)).unwrap();
        let shop = ws.save_profile(person("Bean", ProfileKind::Shop)).unwrap();
        let rel = |to: &str, kind: &str| RelationInput {
            id: None,
            to_id: to.into(),
            kind: kind.into(),
            label: String::new(),
            inverse_label: String::new(),
            since: "2019".into(),
        };

        assert!(ws.save_relation(&owner, rel(&owner, "friend")).is_err(), "not with yourself");
        assert!(ws.save_relation(&owner, rel(&sarah.id, "frenemy")).is_err(), "unknown kind");
        assert!(ws.save_relation(&owner, rel(&sarah.id, "custom")).is_err(), "custom needs a label");
        let me = ws.save_relation(&owner, rel(&sarah.id, "sibling")).unwrap();
        assert_eq!(me.relations.len(), 1);
        assert!(ws.save_relation(&owner, rel(&sarah.id, "sibling")).is_err(), "duplicate");
        assert!(ws.save_relation(&sarah.id, rel(&owner, "sibling")).is_err(), "inverse duplicate");
        ws.save_relation(&owner, rel(&shop.id, "workplace")).unwrap();

        // Editing a profile keeps its relationships.
        let me = ws.save_profile(ProfileInput { id: Some(owner.clone()), ..person("Alex M", ProfileKind::Me) }).unwrap();
        assert_eq!(me.relations.len(), 2);

        // Deleting a profile forever removes relationships pointing at it.
        ws.delete_profile(&shop.id).unwrap();
        assert_eq!(ws.profiles[&owner].relations.len(), 2, "kept while it's in the Trash");
        ws.purge("profile", &shop.id).unwrap();
        assert_eq!(ws.profiles[&owner].relations.len(), 1);
        let id = ws.profiles[&owner].relations[0].id.clone();
        ws.delete_relation(&owner, &id).unwrap();
        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert!(ws.profiles[&owner].relations.is_empty());
    }

    #[test]
    fn relation_catalog_is_consistent() {
        let kinds = relation_kinds();
        assert!(kinds.len() > 50);
        for (kind, inverse) in kinds {
            assert_eq!(inverse_relation(inverse), Some(kind.as_str()), "{kind} ↔ {inverse}");
        }
        // Modern kinds are accepted by the backend.
        for kind in ["queerplatonic_partner", "metamour", "co_parent", "chosen_family", "pibling"] {
            assert!(kinds.contains_key(kind), "{kind}");
        }
    }

    #[test]
    fn gender_and_identity_fields() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let mut input = person("Robin", ProfileKind::Person);
        input.genders = vec![" Non-binary ".into(), "non-binary".into(), "".into(), "Two-Spirit".into()];
        input.pronouns = "they/them".into();
        input.terms = "robot".into();
        input.relationship_status = "In a queerplatonic relationship".into();
        let robin = ws.save_profile(input).unwrap();
        assert_eq!(robin.genders, ["Non-binary", "Two-Spirit"], "trimmed and deduplicated");
        assert_eq!(robin.terms, "neutral", "unknown terms fall back");
        assert_eq!(robin.pronouns, "they/them");

        let many: Vec<String> = (0..20).map(|i| format!("gender {i}")).collect();
        let lots = ws.save_profile(ProfileInput { genders: many, ..person("Kai", ProfileKind::Person) }).unwrap();
        assert_eq!(lots.genders.len(), 10);

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.profiles[&robin.id].relationship_status, "In a queerplatonic relationship");
    }

    #[test]
    fn profile_and_cover_photos() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let media_dir = root.path().join("workspace_personal/media");
        let png = |n: u8| [&b"\x89PNG\r\n\x1a\n"[..], &[n; 64]].concat();

        let video = ws.stage_media("v.mp4", b"\0\0\0\x18ftypisom0000".to_vec()).unwrap();
        assert!(ws.set_profile_photo(&owner, PhotoSlot::Avatar, Some(video.id)).is_err(), "photos only");

        let a = ws.stage_media("me.png", png(1)).unwrap();
        let me = ws.set_profile_photo(&owner, PhotoSlot::Avatar, Some(a.id.clone())).unwrap();
        assert_eq!(me.avatar.as_ref().unwrap().id, a.id);
        assert!(matches!(ws.media_lookup(&a.id).unwrap().1, MediaSource::Ready(_)), "served by the protocol");

        // Pick a photo from a post as the cover: it becomes an independent copy.
        let in_post = ws.stage_media("lake.png", png(2)).unwrap();
        let p = ws.save_post(post(&owner, "", vec![in_post.id.clone()])).unwrap();
        let copy = ws.stage_media_copy(&in_post.id).unwrap();
        assert_ne!(copy.id, in_post.id);
        ws.set_profile_photo(&owner, PhotoSlot::Cover, Some(copy.id.clone())).unwrap();
        ws.set_cover_position(&owner, 250).unwrap();
        ws.delete_post(&p.id).unwrap();
        assert_eq!(decrypt_saved(&mut ws, &copy.id), png(2), "cover survives deleting the post");

        // Replacing the avatar deletes the old file; edits keep photos.
        let b = ws.stage_media("me2.png", png(3)).unwrap();
        ws.set_profile_photo(&owner, PhotoSlot::Avatar, Some(b.id.clone())).unwrap();
        assert!(!media_dir.join(shard_of(&a.id)).join(format!("{}.enc", a.id)).exists());
        let me = ws.save_profile(ProfileInput { id: Some(owner.clone()), ..person("Alex", ProfileKind::Me) }).unwrap();
        assert_eq!((me.avatar.unwrap().id, me.cover.unwrap().id, me.cover_position), (b.id.clone(), copy.id.clone(), 100));

        let ws2 = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws2.profiles[&owner].avatar.as_ref().unwrap().id, b.id);
        ws.set_profile_photo(&owner, PhotoSlot::Avatar, None).unwrap();
        assert!(!media_dir.join(shard_of(&b.id)).join(format!("{}.enc", b.id)).exists(), "removing deletes the file");
    }

    /// Writes a workspace exactly as Phase 1 (format 1) did.
    fn write_phase1_workspace(root: &Path) -> (String, String) {
        let dir = root.join("workspace_old");
        for d in ["entities", "posts", "items"] {
            fs::create_dir_all(dir.join(d)).unwrap();
        }
        let salt = [9u8; 16];
        let kek = crypto::derive_key(b"correct horse", &salt, FAST.memory_kib, FAST.iterations, FAST.parallelism).unwrap();
        let key = crypto::random_key();
        let config = json!({
            "formatVersion": 1,
            "name": "Old Plaintext Name",
            "kdf": { "algorithm": "argon2id", "memoryKib": FAST.memory_kib, "iterations": FAST.iterations,
                     "parallelism": FAST.parallelism, "salt": B64.encode(salt) },
            "wrappedKey": B64.encode(crypto::seal(&kek, "keywrap", key.as_ref()).unwrap()),
        });
        fs::write(dir.join(CONFIG_FILE), serde_json::to_vec_pretty(&config).unwrap()).unwrap();

        let me = Uuid::new_v4().to_string();
        let sarah = Uuid::new_v4().to_string();
        let post = Uuid::new_v4().to_string();
        let seal = |aad: &str, v: Value| crypto::seal(&key, aad, &serde_json::to_vec(&v).unwrap()).unwrap();
        let manifest = json!({"formatVersion": 1, "name": "Old Plaintext Name", "ownerProfileId": me, "createdAt": 1});
        fs::write(dir.join(MANIFEST_FILE), seal("manifest", manifest)).unwrap();
        for (id, kind, name) in [(&me, "me", "Alex"), (&sarah, "person", "Sarah")] {
            let p = json!({"id": id, "kind": kind, "name": name, "createdAt": 1, "updatedAt": 1});
            fs::write(dir.join("entities").join(format!("{id}.enc")), seal(&format!("profile:{id}"), p)).unwrap();
        }
        let p = json!({"id": post, "authorId": me, "content": format!("Tea with @[profile:{sarah}] #tea"),
                       "occurredAt": 5, "createdAt": 5, "updatedAt": 5});
        fs::write(dir.join("posts").join(format!("{post}.enc")), seal(&format!("post:{post}"), p)).unwrap();
        (post, sarah)
    }

    #[test]
    fn storage_usage_counts_every_file() {
        let root = tempfile::tempdir().unwrap();
        let (ws, _, _) = populated(root.path());
        let usage = ws.storage_usage().unwrap();
        let part = |k: &str| usage.parts.iter().find(|p| p.key == k).unwrap().clone();
        assert_eq!(part("entities").files, ws.profiles.len());
        assert_eq!(part("posts").files, ws.posts.len());
        assert_eq!(part("other").files, 2);
        let on_disk: u64 = walk(&root.path().join("workspace_personal")).iter().map(|p| fs::metadata(p).unwrap().len()).sum();
        assert_eq!(usage.total_bytes, on_disk);
    }

    #[test]
    fn flat_folders_move_into_subfolders() {
        let root = tempfile::tempdir().unwrap();
        let (ws, _, _) = populated(root.path());
        let (profiles, posts) = (ws.profiles.len(), ws.posts.len());
        drop(ws);
        // Lay the files out as older versions did: directly in each folder.
        let dir = root.path().join("workspace_personal");
        let flat = |dir: &Path| -> usize {
            FOLDER_KINDS.iter().map(|k| fs::read_dir(dir.join(k.dir())).map(|d| d.flatten().filter(|e| e.path().is_file()).count()).unwrap_or(0)).sum()
        };
        for kind in FOLDER_KINDS {
            for (id, path) in record_files(&dir.join(kind.dir())).unwrap() {
                fs::rename(&path, dir.join(kind.dir()).join(format!("{id}.enc"))).unwrap();
                fs::remove_dir(path.parent().unwrap()).ok();
            }
        }
        let total = flat(&dir);
        assert!(total > 3);

        // A wrong password moves nothing; unlocking moves everything.
        assert!(open_workspace(root.path(), "workspace_personal", "wrong password").is_err());
        assert_eq!(flat(&dir), total);
        let ws = open_workspace(root.path(), "workspace_personal", "old password").unwrap();
        assert_eq!(flat(&dir), 0);
        assert_eq!((ws.profiles.len(), ws.posts.len()), (profiles, posts));
        let moved: usize = FOLDER_KINDS.iter().map(|k| files_in(&dir.join(k.dir()))).sum();
        assert_eq!(moved, total);
        for (id, path) in record_files(&dir.join("posts")).unwrap() {
            assert_eq!(path, dir.join(record_rel_path(Kind::Post, &id)));
        }
    }

    #[test]
    fn migrates_phase1_workspace() {
        let root = tempfile::tempdir().unwrap();
        let (post_id, sarah) = write_phase1_workspace(root.path());

        let mut ws = open_workspace(root.path(), "workspace_old", "correct horse").unwrap();
        let status = ws.migration_status();
        assert_eq!(status.disk_schema, 1);
        assert_eq!(status.stale_files, 5, "config + manifest + 2 profiles + 1 post");
        assert_eq!(status.pending.len(), 1);
        // Readable before migrating, and nothing has been touched on disk yet.
        assert_eq!(ws.manifest.name, "Old Plaintext Name");
        assert_eq!(ws.snapshot().stats[&sarah].mentions, 1);
        assert!(fs::read_to_string(root.path().join("workspace_old").join(CONFIG_FILE)).unwrap().contains("Old Plaintext Name"));

        // Editing one record before migrating writes it in the new format.
        let p = ws.posts[&post_id].clone();
        ws.save_post(PostInput { kind: Default::default(), title: String::new(), captions: Default::default(), id: Some(p.id.clone()), author_id: p.author_id, content: p.content, occurred_at: None, media_ids: vec![], ..Default::default() }).unwrap();
        assert_eq!(ws.migration_status().stale_files, 4);

        assert_eq!(ws.run_migration().unwrap(), 4);
        assert!(ws.migration_status().pending.is_empty());
        assert_no_plaintext(root.path(), &["Old Plaintext Name", "Alex", "Sarah", "Tea"]);
        for path in walk(root.path()).into_iter().filter(|p| p.extension().is_some_and(|e| e == "enc")) {
            assert_eq!(&fs::read(&path).unwrap()[..4], record::RECORD_MAGIC, "{}", path.display());
        }

        let ws = open_workspace(root.path(), "workspace_old", "correct horse").unwrap();
        assert_eq!(ws.migration_status().stale_files, 0);
        assert_eq!(ws.manifest.name, "Old Plaintext Name");
        assert_eq!(ws.profiles.len(), 2);
        assert_eq!(ws.posts[&post_id].occurred_at, 5);
        assert_eq!(ws.posts[&post_id].kind, PostKind::Status, "old posts load as statuses");
    }

    #[test]
    fn product_photos_and_tags() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let shop = ws.save_profile(person("Saree House", ProfileKind::Shop)).unwrap();
        let png = |n: u8| [&b"\x89PNG\r\n\x1a\n"[..], &[n; 64]].concat();
        let media_dir = root.path().join("workspace_personal/media");
        let count = |dir: &Path| files_in(dir);

        // A product with a gallery.
        let front = ws.stage_media("front.png", png(1)).unwrap();
        let back = ws.stage_media("back.png", png(2)).unwrap();
        let input = |media_ids: Vec<String>, id: Option<String>| ItemInput {
            source_url: String::new(),
            media_ids,
            id,
            shop_id: shop.id.clone(),
            name: "Kandyan silk saree".into(),
            description: String::new(),
            price_cents: Some(25_000),
            currency: "LKR".into(),
            status: ItemStatus::Available,
        };
        let item = ws.save_item(input(vec![front.id.clone(), back.id.clone()], None)).unwrap();
        assert_eq!(item.media.len(), 2);
        assert_eq!(count(&media_dir), 2, "sealed to disk");
        assert!(matches!(ws.media_lookup(&front.id).unwrap().1, MediaSource::Ready(_)));
        assert_no_plaintext(&media_dir, &["Kandyan", "front.png"]);

        // Dropping a photo deletes its file.
        let item = ws.save_item(input(vec![back.id.clone()], Some(item.id.clone()))).unwrap();
        assert_eq!(item.media.len(), 1);
        assert_eq!(count(&media_dir), 1);

        // Tag it on a look.
        let look = ws.stage_media("look.png", png(3)).unwrap();
        let p = ws.save_post(PostInput { kind: PostKind::Album, title: "Avurudu look".into(), ..post(&owner, "", vec![look.id.clone()]) }).unwrap();
        let product = PhotoTag { item_id: item.id.clone(), x: 0.4, y: 0.6, ..Default::default() };
        let both = PhotoTag { profile_id: owner.clone(), ..product.clone() };
        assert!(ws.set_photo_tags(&p.id, &look.id, vec![both]).is_err(), "a person or a product, not both");
        assert!(ws.set_photo_tags(&p.id, &look.id, vec![PhotoTag { x: 0.1, y: 0.1, ..Default::default() }]).is_err());
        let me = PhotoTag { profile_id: owner.clone(), x: 0.5, y: 0.2, ..Default::default() };
        let tagged = ws.set_photo_tags(&p.id, &look.id, vec![product.clone(), me, product]).unwrap();
        assert_eq!(tagged.media[0].tags.len(), 2, "one tag per product");
        assert_eq!(ws.search("kandyan", 10).totals.posts, 1, "tagged products find the look");

        // Deleting the product forever removes its tags and photos.
        ws.delete_item(&item.id).unwrap();
        assert_eq!(ws.posts[&p.id].media[0].tags.len(), 2, "kept while it's in the Trash");
        ws.purge("item", &item.id).unwrap();
        assert_eq!(ws.posts[&p.id].media[0].tags.len(), 1);
        assert_eq!(count(&media_dir), 1, "only the look's photo is left");
        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert!(ws.posts[&p.id].media[0].tags.iter().all(|t| t.item_id.is_empty()));
    }

    #[test]
    fn series_overlap_and_cleanup() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let new = |title: &str| SeriesInput { id: None, title: title.into(), description: String::new(), color: "teal".into() };
        assert!(ws.save_series(new("  ")).is_err(), "needs a title");
        let trip = ws.save_series(new("Japan trip")).unwrap();
        let wedding = ws.save_series(new("Wedding planning")).unwrap();

        // One post in both: the series overlap.
        let both = ws.save_post(PostInput { series_ids: vec![trip.id.clone(), wedding.id.clone(), trip.id.clone()], ..post(&owner, "Booked the venue from Kyoto", vec![]) }).unwrap();
        assert_eq!(both.series_ids, vec![trip.id.clone(), wedding.id.clone()], "deduplicated");
        assert!(ws.save_post(PostInput { series_ids: vec!["missing".into()], ..post(&owner, "x", vec![]) }).is_err());
        assert_eq!(ws.search("japan", 10).totals.posts, 1, "series titles find their posts");

        // Renaming reindexes; the series is encrypted and survives a reopen.
        ws.save_series(SeriesInput { id: Some(trip.id.clone()), ..new("Kyoto trip") }).unwrap();
        assert_eq!(ws.search("kyoto trip", 10).totals.posts, 1);
        assert_no_plaintext(&root.path().join("workspace_personal/series"), &["Kyoto"]);
        let mut ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.series[&trip.id].title, "Kyoto trip");

        // Deleting a series keeps its posts.
        ws.delete_series(&wedding.id).unwrap();
        assert_eq!(ws.posts[&both.id].series_ids, vec![trip.id.clone()]);
        let later = ws.save_post(PostInput { series_ids: vec![trip.id.clone()], occurred_at: Some(both.occurred_at + 1000), ..post(&owner, "Back home", vec![]) }).unwrap();
        let summary = ws.series_summaries().into_iter().find(|x| x.series.id == trip.id).unwrap();
        assert_eq!(summary.post_ids, vec![both.id.clone(), later.id.clone()], "parts in date order");
        assert_eq!((summary.from, summary.to), (Some(both.occurred_at), Some(later.occurred_at)));
        let filter = PostFilter { series_id: Some(trip.id.clone()), ..Default::default() };
        assert_eq!(ws.query_posts(&filter).len(), 2);
        assert!(ws.snapshot().series.iter().all(|s| s.series.id != wedding.id));

        // Series are re-encrypted by a key rotation.
        ws.change_password("correct horse", "battery staple", true, FAST).unwrap();
        let ws = open_workspace(root.path(), "workspace_personal", "battery staple").unwrap();
        assert_eq!(ws.series.len(), 1);
    }

    #[test]
    fn trash_restore_and_purge() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();
        let png = |n: u8| [&b"\x89PNG\r\n\x1a\n"[..], &[n; 64]].concat();
        let media_dir = root.path().join("workspace_personal/media");
        let files = |dir: &Path| files_in(dir);

        let shop = ws.save_profile(person("Saree House", ProfileKind::Shop)).unwrap();
        let photo = ws.stage_media("p.png", png(1)).unwrap();
        let item = ws
            .save_item(ItemInput {
                id: None,
                shop_id: shop.id.clone(),
                name: "Silk saree".into(),
                description: String::new(),
                price_cents: None,
                currency: String::new(),
                status: ItemStatus::Available,
                media_ids: vec![photo.id.clone()],
                source_url: "https://example.com/saree".into(),
            })
            .unwrap();
        let by_shop = ws.save_post(post(&shop.id, "New arrivals #silk", vec![])).unwrap();
        let mine = ws.save_post(post(&owner, "Bought one from the shop", vec![])).unwrap();

        // A post on its own.
        ws.delete_post(&mine.id).unwrap();
        assert!(!ws.posts.contains_key(&mine.id) && ws.trash.posts.contains_key(&mine.id));
        assert_eq!(ws.search("bought", 10).totals.posts, 0, "out of search");
        ws.restore("post", &mine.id).unwrap();
        assert_eq!(ws.search("bought", 10).totals.posts, 1);

        // A shop goes with its posts and products, and comes back with them.
        ws.delete_profile(&shop.id).unwrap();
        assert!(ws.items.is_empty() && !ws.posts.contains_key(&by_shop.id));
        let trash = ws.list_trash();
        assert_eq!(trash.len(), 1, "one entry for the shop");
        assert_eq!((trash[0].kind.as_str(), trash[0].with_count), ("profile", 2));
        assert!(ws.restore("post", &by_shop.id).is_err(), "its author is in the Trash");
        assert!(ws.media_lookup(&photo.id).is_err(), "trashed photos aren't served");

        // The Trash survives a reopen, encrypted like everything else.
        assert_no_plaintext(&root.path().join("workspace_personal"), &["Saree House", "New arrivals"]);
        let mut ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.list_trash().len(), 1);
        assert!(!ws.snapshot().profiles.iter().any(|p| p.id == shop.id));
        ws.restore("profile", &shop.id).unwrap();
        assert_eq!(ws.items[&item.id].source_url, "https://example.com/saree");
        assert!(ws.posts.contains_key(&by_shop.id));
        assert!(ws.media_lookup(&photo.id).is_ok());

        // Deleting forever removes records and media; emptying clears the rest.
        ws.delete_profile(&shop.id).unwrap();
        ws.delete_post(&mine.id).unwrap();
        assert_eq!(ws.empty_trash().unwrap(), 2);
        assert!(ws.list_trash().is_empty() && ws.trash.posts.is_empty() && ws.trash.items.is_empty());
        assert_eq!(files(&media_dir), 0);
        assert_eq!(files(&root.path().join("workspace_personal/items")), 0);
        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.posts.len(), 0);
    }
}
