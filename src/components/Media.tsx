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
  TagIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api, errorMessage, mediaUrl, type MediaRef, type PhotoTag, type Post } from "../lib/api";
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
  /** The post the photo belongs to, for the side panel and tagging. */
  post?: Post;
}

const KIND_LABEL: Record<Post["kind"], string> = { status: "Post", article: "Article", album: "Album", milestone: "Life event" };

/**
 * Full-screen photo/video viewer: the photo on the left with arrows and a
 * filmstrip; author, album, caption and tagged people in a side panel.
 * Keys: ← → Home End, Esc (cancel tag / unzoom / close). Click a photo to
 * zoom, or in tag mode to tag someone at that spot.
 */
export function Theater(props: { items: TheaterItem[]; index: number; onClose: () => void }) {
  const { items, onClose } = props;
  const { profiles, navigate, refresh } = useJournal();
  const [index, setIndex] = useState(Math.min(props.index, items.length - 1));
  const [zoom, setZoom] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [tagOverrides, setTagOverrides] = useState<Record<string, PhotoTag[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const count = items.length;

  const current = items[index];
  const media = current?.media;
  const post = current?.post;
  const tags = media ? (tagOverrides[media.id] ?? media.tags) : [];
  const canTag = !!post && media?.kind === "image" && !zoom;

  const go = (to: number) => {
    setZoom(false);
    setPending(null);
    setIndex(((to % count) + count) % count);
  };

  // Track where the image is drawn so tags can be placed over it.
  const measure = () => {
    const img = image.current;
    const host = stage.current;
    if (!img || !host) return setBox(null);
    const a = img.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    setBox({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height });
  };
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(measure, [index, zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") pending ? setPending(null) : tagging ? setTagging(false) : zoom ? setZoom(false) : onClose();
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

  if (!current || !media) return null;
  const author = post ? profiles.get(post.authorId) : undefined;
  const open = (route: Parameters<typeof navigate>[0]) => {
    onClose();
    navigate(route);
  };

  const saveTags = async (next: PhotoTag[]) => {
    if (!post) return;
    setError(null);
    try {
      const saved = await api.setPhotoTags(post.id, media.id, next);
      setTagOverrides((o) => ({ ...o, [media.id]: saved.media.find((m) => m.id === media.id)?.tags ?? next }));
      void refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const onImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!tagging) return setZoom((z) => !z);
    const r = e.currentTarget.getBoundingClientRect();
    setPending({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  const neighbours = [
    ...new Map(
      [items[(index + 1) % count], items[(index - 1 + count) % count]]
        .filter((x) => x && x.media.kind === "image" && x.media.id !== media.id)
        .map((x) => [x.media.id, x]),
    ).values(),
  ];
  const nav = "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/25";

  return (
    <div className="fixed inset-0 z-50 flex bg-black" role="dialog" aria-label="Photo viewer">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-3 text-sm text-white/70">
          <span>{count > 1 ? `${index + 1} of ${count}` : ""}</span>
          <div className="flex items-center gap-1">
            {canTag && (
              <button
                onClick={() => (setTagging((t) => !t), setPending(null))}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${tagging ? "bg-white text-slate-900" : "hover:bg-white/10"}`}
              >
                <TagIcon size={18} /> {tagging ? "Done tagging" : "Tag people"}
              </button>
            )}
            {media.kind === "image" && !tagging && (
              <button onClick={() => setZoom((z) => !z)} className="rounded-full p-2 hover:bg-white/10" aria-label={zoom ? "Fit to screen" : "Actual size"}>
                {zoom ? <MagnifyingGlassMinusIcon size={20} /> : <MagnifyingGlassPlusIcon size={20} />}
              </button>
            )}
            <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
              <XIcon size={22} />
            </button>
          </div>
        </div>

        <div ref={stage} className="group relative min-h-0 flex-1">
          <div
            className={`absolute inset-0 flex px-16 pb-2 ${zoom ? "thin-scroll overflow-auto" : "items-center justify-center"}`}
            onClick={(e) => e.target === e.currentTarget && !zoom && !tagging && onClose()}
          >
            {media.kind === "image" ? (
              <img
                ref={image}
                key={media.id}
                src={mediaUrl(media.id)}
                alt={media.caption || media.name}
                onLoad={measure}
                onClick={onImageClick}
                className={
                  zoom
                    ? "m-auto max-w-none cursor-zoom-out"
                    : `max-h-full max-w-full object-contain ${tagging ? "cursor-crosshair" : "cursor-zoom-in"}`
                }
              />
            ) : (
              <video key={media.id} src={mediaUrl(media.id)} controls autoPlay playsInline className="max-h-full max-w-full" />
            )}
          </div>

          {/* Tag labels over the photo: on hover, always while tagging. */}
          {box && media.kind === "image" && !zoom && (
            <div className="pointer-events-none absolute" style={box}>
              {tags.map((t) => {
                const p = profiles.get(t.profileId);
                if (!p) return null;
                return (
                  <span
                    key={t.profileId}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-800 shadow transition-opacity ${
                      tagging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
                  >
                    {p.name}
                  </span>
                );
              })}
              {pending && (
                <div className="pointer-events-auto absolute" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}>
                  <span className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                  <TagChooser
                    exclude={tags.map((t) => t.profileId)}
                    onPick={(id) => {
                      void saveTags([...tags, { profileId: id, x: pending.x, y: pending.y }]);
                      setPending(null);
                    }}
                    onCancel={() => setPending(null)}
                  />
                </div>
              )}
            </div>
          )}
          {tagging && !pending && (
            <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-sm text-white/80">Click anywhere on the photo to tag someone</div>
          )}

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
                {KIND_LABEL[post.kind]}: <span className="font-semibold text-slate-800 hover:underline">{post.title}</span>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 space-y-4 p-4">
          {media.caption ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{media.caption}</p>
          ) : (
            <p className="text-sm text-slate-400">No caption.</p>
          )}
          {(tags.length > 0 || tagging) && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">In this photo</h4>
              {tags.length === 0 && <p className="text-sm text-slate-400">Nobody tagged yet.</p>}
              <ul className="space-y-1.5">
                {tags.map((t) => {
                  const p = profiles.get(t.profileId);
                  if (!p) return null;
                  return (
                    <li key={t.profileId} className="flex items-center gap-2">
                      <button onClick={() => open({ view: "profile", id: p.id })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <Avatar profile={p} size="sm" />
                        <span className="truncate text-sm font-medium text-slate-700 hover:underline">{p.name}</span>
                      </button>
                      <button
                        onClick={() => void saveTags(tags.filter((x) => x.profileId !== t.profileId))}
                        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                        aria-label={`Remove tag ${p.name}`}
                      >
                        <XIcon size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
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
              Open {KIND_LABEL[post.kind].toLowerCase()} →
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Search-and-pick list shown under a new tag on a photo. */
function TagChooser(props: { exclude: string[]; onPick: (id: string) => void; onCancel: () => void }) {
  const { snapshot } = useJournal();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = snapshot.profiles
    .filter((p) => (p.kind === "me" || p.kind === "person" || p.kind === "page") && !props.exclude.includes(p.id))
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .slice(0, 8);
  return (
    <div className="absolute left-1/2 top-10 w-60 -translate-x-1/2 overflow-hidden rounded-xl bg-white shadow-2xl">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onCancel();
          if (e.key === "Enter" && shown[0]) props.onPick(shown[0].id);
        }}
        placeholder="Who is this?"
        className="w-full border-b border-slate-100 px-3 py-2 text-sm text-slate-800 outline-none"
      />
      <ul className="max-h-60 overflow-y-auto py-1">
        {shown.map((p) => (
          <li key={p.id}>
            <button onClick={() => props.onPick(p.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
              <Avatar profile={p} size="sm" /> {p.name}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No matches.</li>}
      </ul>
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

/**
 * Whether a photo belongs on a profile's media tab: everything the profile
 * posted, photos it's tagged in, and posts it's tagged with or checked in at.
 */
function belongsTo(post: Post, media: MediaRef, profileId: string): boolean {
  if (post.authorId === profileId || post.withIds.includes(profileId) || post.placeId === profileId) return true;
  if (media.tags.some((t) => t.profileId === profileId)) return true;
  // Mentioned in the text only: show untagged photos, not ones clearly of other people.
  return post.content.includes(`@[profile:${profileId}]`) && media.tags.length === 0;
}

/** Every attachment in the workspace (or for one profile), newest first, plus albums. */
export function MediaGallery({ profileId }: { profileId?: string }) {
  const { posts } = usePosts(profileId ? { profileId } : {});
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const entries: TheaterItem[] = useMemo(
    () =>
      filter === "albums"
        ? []
        : (posts ?? []).flatMap((post) =>
            post.media
              .filter((m) => filter === "all" || m.kind === filter)
              .filter((m) => !profileId || belongsTo(post, m, profileId))
              .map((media) => ({ media, post })),
          ),
    [posts, filter, profileId],
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
