// Photo uploads: optional conversion (to JPEG or PNG), resizing and clipboard
// paste. Conversion happens in the webview, before the bytes are encrypted, so
// a 12 MB PNG screenshot can be stored as a small JPEG. Re-encoding also drops
// EXIF metadata such as GPS location and camera details.
import { useEffect } from "react";

export type UploadFormat = "original" | "jpeg" | "png";

export interface UploadPrefs {
  format: UploadFormat;
  /** JPEG quality, 0.5–1. */
  quality: number;
  /** Longest side in pixels; 0 keeps the original size. */
  maxDimension: number;
  /** Keep the original when converting (without resizing) would make it bigger, e.g. a flat-colour PNG screenshot. */
  keepSmaller: boolean;
}

export const DEFAULT_PREFS: UploadPrefs = { format: "jpeg", quality: 0.88, maxDimension: 0, keepSmaller: true };
const KEY = "my-diary.upload-prefs";

// A per-device preference: it holds no journal content, so browser storage is fine.
export function loadPrefs(): UploadPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: UploadPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or blocked storage: the setting just won't stick.
  }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Some formats (e.g. HEIC in WebKit) decode through <img> but not createImageBitmap.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * The file to upload: converted to the chosen format and scaled down to
 * `maxDimension`, or the original when nothing needs doing. Videos, GIFs (to
 * keep animation) and SVGs are left alone, as is anything the webview can't decode.
 */
export async function prepareImage(file: File, prefs: UploadPrefs = loadPrefs()): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  // HEIC/AVIF/WebP and friends become JPEG even when "original" is chosen, if they need resizing.
  const target = prefs.format === "jpeg" ? "image/jpeg" : prefs.format === "png" ? "image/png" : file.type in EXT ? file.type : "image/jpeg";
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decode(file);
  } catch {
    return file;
  }
  const width = "naturalWidth" in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height = "naturalHeight" in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scale = prefs.maxDimension > 0 ? Math.min(1, prefs.maxDimension / Math.max(width, height)) : 1;
  // Nothing to change: don't re-encode (that would only lose quality).
  if (scale === 1 && (prefs.format === "original" || target === file.type)) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  if (target === "image/jpeg") {
    // JPEG has no transparency: flatten onto white rather than black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, target, prefs.quality));
  if (!blob) return file;
  // Our only reason to convert without resizing is a smaller file (and a consistent format).
  const acceptable = file.type in EXT || file.type === "image/webp";
  if (scale === 1 && prefs.keepSmaller && acceptable && blob.size >= file.size) return file;
  const base = (file.name || "image").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.${EXT[target]}`, { type: target, lastModified: file.lastModified });
}

/** A name for pasted images, which arrive as "image.png". */
const pastedName = (file: File, i: number) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new File([file], `pasted-${stamp}${i ? `-${i + 1}` : ""}.${file.type.split("/")[1] ?? "png"}`, { type: file.type });
};

/** Image/video files on the clipboard of a paste event (screenshots, copied photos or files). */
export function filesFromPaste(e: ClipboardEvent | React.ClipboardEvent): File[] {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
  return files.map((f, i) => (f.name === "image.png" || !f.name ? pastedName(f, i) : f));
}

/**
 * Reads images from the clipboard on request (a "Paste" button). Needs a user
 * gesture; throws a friendly message when the webview doesn't allow it.
 */
export async function readClipboardImages(): Promise<File[]> {
  if (!navigator.clipboard?.read) throw new Error("Press ⌘V / Ctrl+V to paste.");
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error("Couldn't read the clipboard here. Press ⌘V / Ctrl+V instead.");
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) files.push(pastedName(new File([await item.getType(type)], "image.png", { type }), files.length));
  }
  if (files.length === 0) throw new Error("There's no image on the clipboard.");
  return files;
}

/**
 * ⌘V anywhere while `enabled`: pasted images go to `onFiles`. Pastes into text
 * fields that already handled them (the rich editor) are left alone.
 */
export function usePasteImages(onFiles: (files: File[]) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const files = filesFromPaste(e);
      if (files.length === 0) return;
      e.preventDefault();
      onFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles, enabled]);
}
