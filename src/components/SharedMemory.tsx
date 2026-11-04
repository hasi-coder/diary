// A memory shared as a new post: the earlier post (status, article or album)
// embedded as a card under an "N years ago" banner, as on Facebook.
import { useEffect, useState } from "react";
import { ArticleIcon, ClockCounterClockwiseIcon, ImagesSquareIcon, XIcon } from "@phosphor-icons/react";
import { api, type MediaRef, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { formatPostDate } from "../lib/format";
import { excerpt } from "../lib/mentions";
import { MediaPreview } from "./Media";
import { Avatar } from "./ui";

/** Loads the shared post by id; it may have gone to the Trash since. */
export function SharedMemory({ id, asOf, compact }: { id: string; asOf: number; compact?: boolean }) {
  const { version } = useJournal();
  const [post, setPost] = useState<Post | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getPost(id)
      .then((p) => !cancelled && setPost(p))
      .catch(() => !cancelled && setPost(null));
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (post === undefined) return <div className={`mt-3 animate-pulse rounded-xl bg-slate-100 ${compact ? "h-20" : "h-40"}`} />;
  if (post === null)
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        This memory is no longer available.
      </div>
    );
  return <MemoryEmbed post={post} asOf={asOf} compact={compact} />;
}

/**
 * The card itself. `compact` is one short row with a thumbnail, leaving the
 * composer room to write; `onRemove` shows a close button.
 */
export function MemoryEmbed({ post, asOf, compact, onRemove }: { post: Post; asOf: number; compact?: boolean; onRemove?: () => void }) {
  const { profiles, navigate } = useJournal();
  const author = profiles.get(post.authorId);
  const then = new Date(post.occurredAt);
  const years = new Date(asOf).getFullYear() - then.getFullYear();
  const ago = years <= 0 ? "Earlier this year" : `${years} ${years === 1 ? "year" : "years"} ago`;
  const text = excerpt(post.content, profiles, 220);
  const open = () => navigate({ view: "post", id: post.id });
  const heading = post.kind === "status" ? "" : post.title;

  if (compact) {
    const cover = post.media[0];
    return (
      <div className="mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 pr-3">
        {cover ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
            <MediaPreview media={cover} />
            {post.media.length > 1 && (
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">+{post.media.length - 1}</span>
            )}
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ClockCounterClockwiseIcon size={24} weight="bold" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-brand-700">
            {ago} · {then.toLocaleDateString(undefined, { dateStyle: "medium" })}
          </div>
          <div className="truncate text-sm font-semibold text-slate-800">{heading || author?.name || "Deleted profile"}</div>
          {text && <div className="truncate text-xs text-slate-500">{text}</div>}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Don't share this memory" className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <XIcon size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 bg-gradient-to-r from-brand-50 to-white px-4 py-2.5">
        <ClockCounterClockwiseIcon size={18} weight="bold" className="text-brand-600" />
        <span className="text-[15px] font-semibold text-slate-800">{ago}</span>
        <span className="text-[13px] text-slate-500">· {then.toLocaleDateString(undefined, { dateStyle: "long" })}</span>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Don't share this memory"
          className="absolute right-2 top-1.5 z-10 rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
        >
          <XIcon size={16} />
        </button>
      )}
      <button type="button" onClick={onRemove ? undefined : open} className={`block w-full text-left ${onRemove ? "cursor-default" : "hover:bg-slate-50"}`}>
        {post.media.length > 0 && <Mosaic media={post.media} />}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Avatar profile={author} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">{author?.name ?? "Deleted profile"}</div>
              <div className="text-xs text-slate-500">{formatPostDate(post.occurredAt)}</div>
            </div>
          </div>
          {post.kind === "album" ? (
            <div className="mt-2 flex items-center gap-1.5 text-[15px] font-bold text-slate-900">
              <ImagesSquareIcon className="shrink-0 text-brand-600" />
              <span className="truncate">{post.title}</span>
              <span className="shrink-0 text-xs font-normal text-slate-500">
                · {post.media.length} {post.media.length === 1 ? "item" : "items"}
              </span>
            </div>
          ) : post.kind === "article" ? (
            <div className="mt-2 flex items-center gap-1.5 text-[15px] font-bold text-slate-900">
              <ArticleIcon className="shrink-0 text-brand-600" />
              <span className="truncate">{post.title}</span>
            </div>
          ) : (
            post.kind === "milestone" && post.title && <div className="mt-2 text-[15px] font-bold text-slate-900">{post.title}</div>
          )}
          {text && <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">{text}</p>}
        </div>
      </button>
    </div>
  );
}

/** Up to four thumbnails (videos show their first frame), "+N" on the last. */
function Mosaic({ media }: { media: MediaRef[] }) {
  const shown = media.slice(0, media.length > 4 ? 4 : media.length);
  const more = media.length - shown.length;
  const tile = (m: MediaRef, i: number, className = "") => (
    <div key={m.id} className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <MediaPreview media={m} />
      {more > 0 && i === shown.length - 1 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-semibold text-white">+{more}</span>
      )}
    </div>
  );
  if (shown.length === 1) return <div className="aspect-video">{tile(shown[0], 0, "h-full")}</div>;
  if (shown.length === 2) return <div className="grid aspect-[2/1] grid-cols-2 gap-0.5">{shown.map((m, i) => tile(m, i))}</div>;
  return (
    <div className="grid aspect-video grid-cols-3 grid-rows-[repeat(var(--rows),minmax(0,1fr))] gap-0.5" style={{ "--rows": shown.length - 1 } as React.CSSProperties}>
      {tile(shown[0], 0, "col-span-2 row-span-full")}
      {shown.slice(1).map((m, i) => tile(m, i + 1))}
    </div>
  );
}
