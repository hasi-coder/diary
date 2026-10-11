// Displaying attachments: post grid, the Facebook-style photo viewer ("theater"),
// album tiles, and a gallery of all media.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  ImagesIcon,
  ImagesSquareIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PlayIcon,
  XIcon,
} from "@phosphor-icons/react";
import { mediaUrl, type MediaRef, type Post } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { formatBytes, formatPostDate } from "../lib/format";
import { Avatar, EmptyState } from "./ui";

/** The image, or a video's first frame with a play badge. Not interactive. */
export function MediaPreview({ media, className = "" }: { media: MediaRef; className?: string }) {
  if (media.kind === "image") {
    return <img src={mediaUrl(media.id)} alt={media.caption || media.name} loading="lazy" draggable={false} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <span className="relative block h-full w-full">
      {/* #t= nudges WebKit into rendering the first frame as a poster. */}
      <video src={`${mediaUrl(media.id)}#t=0.1`} preload="metadata" muted playsInline className={`h-full w-full object-cover ${className}`} />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
          <PlayIcon size={18} weight="fill" />
        </span>
      </span>
    </span>
  );
}

/** A clickable tile. */
export function MediaTile(props: { media: MediaRef; onClick?: () => void; className?: string; overlay?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`group relative block overflow-hidden bg-slate-100 ${props.className ?? ""}`}
      title={props.media.caption || props.media.name}
    >
      <MediaPreview media={props.media} className="transition-transform duration-500 group-hover:scale-105" />
      <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
      {props.overlay}
    </button>
  );
}

/** Facebook-style layout for a post's attachments (up to four tiles, then "+N"). */
export function MediaGrid({ post, media = post.media }: { post: Post; media?: MediaRef[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (media.length === 0) return null;

  const single = media.length === 1;
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;

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
          {shown.map((m, i) => (
            <MediaTile
              key={m.id}
              media={m}
              onClick={() => setOpen(i)}
              className={
                single
                  ? "max-h-[28rem] aspect-video"
                  : shown.length === 3
                    ? `h-full ${i === 0 ? "row-span-2" : ""}`
                    : shown.length === 2
                      ? "aspect-square"
                      : "aspect-[4/3]"
              }
              overlay={
                i === 3 && extra > 0 ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{extra}</span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
      {open !== null && <Theater items={media.map((m) => ({ media: m, post }))} index={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export interface TheaterItem {
  media: MediaRef;
  /** The post the photo belongs to, for the side panel. */
  post?: Post;
}

/**
 * Full-screen photo/video viewer: the photo on the left with arrows and a
 * filmstrip; author, album and caption in a side panel. Keys: ← → Home End,
 * Esc (unzoom, then close). Click a photo to zoom to full size.
 */
export function Theater(props: { items: TheaterItem[]; index: number; onClose: () => void }) {
  const { items, onClose } = props;
  const { profiles, navigate } = useJournal();
  const [index, setIndex] = useState(Math.min(props.index, items.length - 1));
  const [zoom, setZoom] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const count = items.length;

  const go = (to: number) => {
    setZoom(false);
    setIndex(((to % count) + count) % count);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") zoom ? setZoom(false) : onClose();
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(count - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    strip.current?.children[index]?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  const current = items[index];
  if (!current) return null;
  const { media, post } = current;
  const author = post ? profiles.get(post.authorId) : undefined;
  const open = (route: Parameters<typeof navigate>[0]) => {
    onClose();
    navigate(route);
  };
  const neighbours = [items[(index + 1) % count], items[(index - 1 + count) % count]].filter((x) => x && x.media.kind === "image");
  const nav = "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/25";

  return (
    <div className="fixed inset-0 z-50 flex bg-black" role="dialog" aria-label="Photo viewer">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-sm text-white/70">
          <span>{count > 1 ? `${index + 1} of ${count}` : ""}</span>
          <div className="flex items-center gap-1">
            {media.kind === "image" && (
              <button onClick={() => setZoom((z) => !z)} className="rounded-full p-2 hover:bg-white/10" aria-label={zoom ? "Fit to screen" : "Actual size"}>
                {zoom ? <MagnifyingGlassMinusIcon size={20} /> : <MagnifyingGlassPlusIcon size={20} />}
              </button>
            )}
            <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
              <XIcon size={22} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            className={`absolute inset-0 flex px-16 pb-2 ${zoom ? "thin-scroll overflow-auto" : "items-center justify-center"}`}
            onClick={(e) => e.target === e.currentTarget && !zoom && onClose()}
          >
            {media.kind === "image" ? (
              <img
                key={media.id}
                src={mediaUrl(media.id)}
                alt={media.caption || media.name}
                onClick={() => setZoom((z) => !z)}
                className={zoom ? "m-auto max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}
              />
            ) : (
              <video key={media.id} src={mediaUrl(media.id)} controls autoPlay playsInline className="max-h-full max-w-full" />
            )}
          </div>
          {count > 1 && (
            <>
              <button className={`${nav} left-3`} onClick={() => go(index - 1)} aria-label="Previous">
                <CaretLeftIcon size={24} />
              </button>
              <button className={`${nav} right-3`} onClick={() => go(index + 1)} aria-label="Next">
                <CaretRightIcon size={24} />
              </button>
            </>
          )}
        </div>

        {count > 1 && (
          <div ref={strip} className="thin-scroll flex shrink-0 gap-1.5 overflow-x-auto px-4 py-3">
            {items.map((item, i) => (
              <button
                key={item.media.id}
                onClick={() => go(i)}
                aria-label={`Show ${i + 1}`}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md ring-2 transition ${
                  i === index ? "ring-white" : "opacity-50 ring-transparent hover:opacity-90"
                }`}
              >
                <MediaPreview media={item.media} />
              </button>
            ))}
          </div>
        )}
        {/* Warm the cache for the next and previous photos. */}
        <div className="hidden">
          {neighbours.map((n) => (
            <img key={n.media.id} src={mediaUrl(n.media.id)} alt="" />
          ))}
        </div>
      </div>

      <aside className="thin-scroll hidden w-80 shrink-0 flex-col overflow-y-auto bg-white md:flex">
        {post && (
          <div className="border-b border-slate-100 p-4">
            <button className="flex items-center gap-3 text-left" onClick={() => author && open({ view: "profile", id: author.id })}>
              <Avatar profile={author} />
              <span>
                <span className="block text-sm font-semibold text-slate-800 hover:underline">{author?.name ?? "Unknown"}</span>
                <span className="block text-xs text-slate-400">{formatPostDate(post.occurredAt)}</span>
              </span>
            </button>
            {post.title && (
              <button onClick={() => open({ view: "post", id: post.id })} className="mt-3 block text-left text-sm text-slate-500 hover:text-slate-800">
                {post.kind === "album" ? "Album" : "Article"}: <span className="font-semibold text-slate-800 hover:underline">{post.title}</span>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 p-4">
          {media.caption ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{media.caption}</p>
          ) : (
            <p className="text-sm text-slate-400">No caption.</p>
          )}
        </div>
        <div className="space-y-1 border-t border-slate-100 p-4 text-xs text-slate-400">
          <div className="truncate" title={media.name}>
            {media.name}
          </div>
          <div>
            {media.kind === "image" ? "Photo" : "Video"} · {formatBytes(media.size)}
          </div>
          {post && (
            <button onClick={() => open({ view: "post", id: post.id })} className="mt-2 font-medium text-brand-600 hover:underline">
              Open {post.kind === "album" ? "album" : post.kind === "article" ? "article" : "post"} →
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Cover + title card for an album. */
export function AlbumTile({ album }: { album: Post }) {
  const { navigate } = useJournal();
  const cover = album.media[0];
  return (
    <button onClick={() => navigate({ view: "post", id: album.id })} className="group text-left">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
        {cover && <MediaPreview media={cover} className="transition-transform duration-500 group-hover:scale-105" />}
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
          <ImagesSquareIcon /> {album.media.length}
        </span>
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-slate-800 group-hover:underline">{album.title}</div>
      <div className="text-xs text-slate-400">{new Date(album.occurredAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
    </button>
  );
}

type Filter = "all" | "image" | "video" | "albums";

/** Every attachment in the workspace (or for one profile), newest first, plus albums. */
export function MediaGallery({ profileId }: { profileId?: string }) {
  const { posts } = usePosts(profileId ? { profileId } : {});
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const entries: TheaterItem[] = useMemo(
    () =>
      filter === "albums"
        ? []
        : (posts ?? []).flatMap((post) => post.media.filter((m) => filter === "all" || m.kind === filter).map((media) => ({ media, post }))),
    [posts, filter],
  );
  const albums = useMemo(() => (posts ?? []).filter((p) => p.kind === "album"), [posts]);

  const labels: Record<Filter, string> = { all: "All", image: "Photos", video: "Videos", albums: `Albums${albums.length ? ` · ${albums.length}` : ""}` };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {labels[f]}
          </button>
        ))}
      </div>

      {filter === "albums" ? (
        albums.length === 0 ? (
          <EmptyState icon={<ImagesSquareIcon />} title="No albums yet">
            Choose “Album” in the composer to collect photos under a title, with captions.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {albums.map((a) => (
              <AlbumTile key={a.id} album={a} />
            ))}
          </div>
        )
      ) : posts && entries.length === 0 ? (
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
      {open !== null && <Theater items={entries} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
