// Draft attachments for the composer: upload (stage), preview, remove, and
// discard anything left unsaved when the draft goes away.
import { useEffect, useRef, useState } from "react";
import { CircleNotchIcon, PlusIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { api, errorMessage, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, type MediaRef } from "../lib/api";
import { MediaTile } from "./Media";

export interface Attachment {
  key: string;
  name: string;
  caption: string;
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
    initial.map((m) => ({ key: m.id, name: m.name, caption: m.caption, status: "ready", media: m })),
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
      setItems((xs) => [...xs, { key, name: file.name, caption: "", status: problem ? "error" : "uploading", error: problem ?? undefined }]);
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

  const setCaption = (key: string, caption: string) => update(key, { caption });

  /** Moves an attachment by `delta` places, or to the front (the cover) with "first". */
  const move = (key: string, delta: number | "first") =>
    setItems((xs) => {
      const from = xs.findIndex((x) => x.key === key);
      if (from < 0) return xs;
      const to = delta === "first" ? 0 : Math.min(Math.max(from + delta, 0), xs.length - 1);
      const next = [...xs];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next;
    });

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
    setCaption,
    move,
    mediaIds: items.flatMap((x) => (x.status === "ready" && x.media ? [x.media.id] : [])),
    captions: Object.fromEntries(items.flatMap((x) => (x.status === "ready" && x.media ? [[x.media.id, x.caption]] : []))),
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

/** Album editor: large tiles with a caption field each, reordering and a cover marker. */
export function AlbumEditor(props: {
  items: Attachment[];
  onRemove: (key: string) => void;
  onCaption: (key: string, caption: string) => void;
  onMove: (key: string, delta: number | "first") => void;
  onAdd: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {props.items.map((a, i) => (
        <div key={a.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="relative aspect-square bg-slate-50">
            {a.status === "ready" && a.media && <MediaTile media={a.media} className="h-full w-full" />}
            {a.status === "uploading" && (
              <div className="flex h-full items-center justify-center">
                <CircleNotchIcon size={24} className="animate-spin text-brand-500" />
              </div>
            )}
            {a.status === "error" && (
              <div className="flex h-full flex-col items-center justify-center gap-1 bg-rose-50 p-2 text-center text-xs text-rose-600">
                <WarningIcon size={20} /> {a.error}
              </div>
            )}
            {i === 0 && a.status === "ready" && (
              <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">Cover</span>
            )}
            <div className="absolute right-1.5 top-1.5 flex gap-1">
              {i > 0 && <TileButton title="Make cover" onClick={() => props.onMove(a.key, "first")}>★</TileButton>}
              {i > 0 && <TileButton title="Move earlier" onClick={() => props.onMove(a.key, -1)}>←</TileButton>}
              {i < props.items.length - 1 && <TileButton title="Move later" onClick={() => props.onMove(a.key, 1)}>→</TileButton>}
              <TileButton title={`Remove ${a.name}`} onClick={() => props.onRemove(a.key)}>
                <XIcon size={12} />
              </TileButton>
            </div>
          </div>
          <textarea
            value={a.caption}
            onChange={(e) => props.onCaption(a.key, e.target.value)}
            placeholder="Write a caption…"
            rows={2}
            className="block w-full resize-none border-t border-slate-100 px-2.5 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:bg-brand-50/40"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={props.onAdd}
        className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
      >
        <PlusIcon size={28} /> Add photos or videos
        <span className="text-xs font-normal text-slate-400">or drop them here</span>
      </button>
    </div>
  );
}

function TileButton(props: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      className="flex h-6 min-w-6 items-center justify-center rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-black/80"
    >
      {props.children}
    </button>
  );
}
