// Displaying attachments: post grid, lightbox, and a gallery of all media.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CaretLeftIcon, CaretRightIcon, ImagesIcon, PlayIcon, XIcon } from "@phosphor-icons/react";
import { mediaUrl, type MediaRef, type Post } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { formatPostDate } from "../lib/format";
import { Avatar, EmptyState } from "./ui";

/** A square-ish tile. Videos show their first frame with a play badge. */
export function MediaTile(props: { media: MediaRef; onClick?: () => void; className?: string; overlay?: ReactNode }) {
  const { media } = props;
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`group relative block overflow-hidden bg-slate-100 ${props.className ?? ""}`}
      title={media.name}
    >
      {media.kind === "image" ? (
        <img src={mediaUrl(media.id)} alt={media.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <>
          {/* #t= nudges WebKit into rendering the first frame as a poster. */}
          <video src={`${mediaUrl(media.id)}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <PlayIcon size={22} weight="fill" />
            </span>
          </span>
        </>
      )}
      <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      {props.overlay}
    </button>
  );
}

/** Facebook-style layout for a post's attachments. */
export function MediaGrid({ media, caption }: { media: MediaRef[]; caption?: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  if (media.length === 0) return null;

  const single = media.length === 1;
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  const tile = (m: MediaRef, i: number, className: string) => (
    <MediaTile
      key={m.id}
      media={m}
      onClick={() => setOpen(i)}
      className={className}
      overlay={
        i === 3 && extra > 0 ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{extra}</span>
        ) : undefined
      }
    />
  );

  return (
    <>
      {single && media[0].kind === "video" ? (
        <video src={mediaUrl(media[0].id)} controls preload="metadata" playsInline className="mt-4 max-h-[28rem] w-full rounded-xl bg-black" />
      ) : (
        <div
          className={`mt-4 grid gap-1 overflow-hidden rounded-xl border border-slate-200 ${
            single ? "grid-cols-1" : shown.length === 3 ? "h-96 grid-cols-2 grid-rows-2" : "grid-cols-2"
          }`}
        >
          {shown.map((m, i) =>
            tile(
              m,
              i,
              single
                ? "max-h-[28rem] aspect-video"
                : shown.length === 3
                  ? `h-full ${i === 0 ? "row-span-2" : ""}`
                  : shown.length === 2
                    ? "aspect-square"
                    : "aspect-[4/3]",
            ),
          )}
        </div>
      )}
      {open !== null && <Lightbox items={media.map((m) => ({ media: m, caption }))} index={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function Lightbox(props: { items: { media: MediaRef; caption?: ReactNode }[]; index: number; onClose: () => void }) {
  const { items, onClose } = props;
  const [index, setIndex] = useState(props.index);
  const count = items.length;
  const current = items[Math.min(index, count - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  if (!current) return null;
  const { media } = current;
  const nav = "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-3 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 truncate">{current.caption}</div>
        <div className="flex shrink-0 items-center gap-4">
          {count > 1 && (
            <span>
              {index + 1} / {count}
            </span>
          )}
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close">
            <XIcon size={22} />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {media.kind === "image" ? (
          <img key={media.id} src={mediaUrl(media.id)} alt={media.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <video key={media.id} src={mediaUrl(media.id)} controls autoPlay playsInline className="max-h-full max-w-full" />
        )}
        {count > 1 && (
          <>
            <button className={`${nav} left-4`} onClick={() => setIndex((i) => (i - 1 + count) % count)} aria-label="Previous">
              <CaretLeftIcon size={24} />
            </button>
            <button className={`${nav} right-4`} onClick={() => setIndex((i) => (i + 1) % count)} aria-label="Next">
              <CaretRightIcon size={24} />
            </button>
          </>
        )}
      </div>
      <div className="pb-3 text-center text-xs text-white/50">{media.name}</div>
    </div>
  );
}

type Filter = "all" | "image" | "video";

/** Every attachment in the workspace (or for one profile), newest first. */
export function MediaGallery({ profileId }: { profileId?: string }) {
  const { profiles, navigate } = useJournal();
  const { posts } = usePosts(profileId ? { profileId } : {});
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const entries = useMemo(
    () =>
      (posts ?? []).flatMap((post: Post) =>
        post.media.filter((m) => filter === "all" || m.kind === filter).map((media) => ({ media, post })),
      ),
    [posts, filter],
  );

  const caption = (post: Post) => {
    const author = profiles.get(post.authorId);
    return (
      <button
        className="flex items-center gap-2 text-left hover:text-white"
        onClick={() => {
          setOpen(null);
          if (author) navigate({ view: "profile", id: author.id });
        }}
      >
        <Avatar profile={author} size="sm" />
        <span>
          <span className="font-medium text-white">{author?.name ?? "Unknown"}</span> · {formatPostDate(post.occurredAt)}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["all", "image", "video"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : f === "image" ? "Photos" : "Videos"}
          </button>
        ))}
      </div>
      {posts && entries.length === 0 ? (
        <EmptyState icon={<ImagesIcon />} title="No media yet">
          Attach photos or videos to a post with the image button, drag and drop, or paste.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {entries.map(({ media }, i) => (
            <MediaTile key={media.id} media={media} onClick={() => setOpen(i)} className="aspect-square rounded-lg" />
          ))}
        </div>
      )}
      {open !== null && (
        <Lightbox items={entries.map((e) => ({ media: e.media, caption: caption(e.post) }))} index={open} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
