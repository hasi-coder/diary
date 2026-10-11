// Draft attachments for the composer: upload (stage), preview, remove, and
// discard anything left unsaved when the draft goes away.
import { useEffect, useRef, useState } from "react";
import { CircleNotchIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { api, errorMessage, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, type MediaRef } from "../lib/api";
import { MediaTile } from "./Media";

interface Attachment {
  key: string;
  name: string;
  status: "uploading" | "ready" | "error";
  media?: MediaRef;
  error?: string;
}

const MB = 1024 * 1024;

function precheck(file: File): string | null {
  const isVideo = file.type.startsWith("video/");
  if (file.type && !isVideo && !file.type.startsWith("image/")) return "Only photos and videos can be attached.";
  const max = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) return `${isVideo ? "Videos" : "Images"} can be at most ${max / MB} MB (this one is ${(file.size / MB).toFixed(1)} MB).`;
  return null;
}

export function useAttachments(initial: MediaRef[]) {
  const [items, setItems] = useState<Attachment[]>(() =>
    initial.map((m) => ({ key: m.id, name: m.name, status: "ready", media: m })),
  );
  // Uploads staged by this draft that haven't been saved into a post yet.
  const staged = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const pending = staged.current;
    return () => {
      mounted.current = false;
      if (pending.size > 0) void api.discardMedia([...pending]).catch(() => {});
      pending.clear();
    };
  }, []);

  const update = (key: string, patch: Partial<Attachment>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const add = (files: Iterable<File>) => {
    for (const file of files) {
      const key = crypto.randomUUID();
      const problem = precheck(file);
      setItems((xs) => [...xs, { key, name: file.name, status: problem ? "error" : "uploading", error: problem ?? undefined }]);
      if (problem) continue;
      api
        .stageMedia(file)
        .then((media) => {
          if (!mounted.current || removed.current.has(key)) {
            void api.discardMedia([media.id]);
            return;
          }
          staged.current.add(media.id);
          update(key, { status: "ready", media });
        })
        .catch((e) => mounted.current && update(key, { status: "error", error: errorMessage(e) }));
    }
  };

  const remove = (key: string) => {
    removed.current.add(key);
    const id = items.find((x) => x.key === key)?.media?.id;
    if (id && staged.current.delete(id)) void api.discardMedia([id]);
    setItems((xs) => xs.filter((x) => x.key !== key));
  };

  /** Call after the post was saved: the backend now owns the staged files. */
  const committed = () => {
    staged.current.clear();
    setItems([]);
  };

  return {
    items,
    add,
    remove,
    committed,
    mediaIds: items.flatMap((x) => (x.status === "ready" && x.media ? [x.media.id] : [])),
    uploading: items.some((x) => x.status === "uploading"),
    failed: items.some((x) => x.status === "error"),
  };
}

export function AttachmentStrip({ items, onRemove }: { items: Attachment[]; onRemove: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <div key={a.key} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50" title={a.error ?? a.name}>
          {a.status === "ready" && a.media && <MediaTile media={a.media} className="h-full w-full" />}
          {a.status === "uploading" && (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-[10px] text-slate-400">
              <CircleNotchIcon size={20} className="animate-spin text-brand-500" />
              <span className="w-full truncate text-center">{a.name}</span>
            </div>
          )}
          {a.status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-rose-50 p-1 text-[10px] text-rose-600">
              <WarningIcon size={20} />
              <span className="line-clamp-2 text-center leading-tight">{a.error}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(a.key)}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
            aria-label={`Remove ${a.name}`}
          >
            <XIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
