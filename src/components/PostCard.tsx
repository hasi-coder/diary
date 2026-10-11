// A post in a feed. Statuses show inline; articles and albums show a teaser
// that opens their own page (PostView).
import { useState } from "react";
import { ArrowRightIcon, DotsThreeIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Activity, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { formatPostDate, readingMinutes, subtitle } from "../lib/format";
import { excerpt } from "../lib/mentions";
import { Composer } from "./Composer";
import { MediaGrid, MediaPreview } from "./Media";
import { PostContent } from "./PostContent";
import { PostHeadline } from "./PostExtras";
import { categoryOf } from "../lib/lifeEvents";
import { lifeEventsIn, storyOf } from "../lib/story";
import { Avatar, ConfirmDialog } from "./ui";

export function PostCard({ post, onTag }: { post: Post; onTag?: (tag: string) => void }) {
  const { profiles, navigate } = useJournal();
  const author = profiles.get(post.authorId);
  const [editing, setEditing] = useState(false);
  const edited = post.updatedAt - post.createdAt > 60_000;
  const count = post.media.length;
  const action =
    post.kind === "album"
      ? `added ${count} ${count === 1 ? "item" : "items"} to an album`
      : post.kind === "article"
        ? "wrote an article"
        : null;
  const story = storyOf(post);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3 text-left">
          <button onClick={() => author && navigate({ view: "profile", id: author.id })} aria-label={author?.name}>
            <Avatar profile={author} />
          </button>
          <div>
            <div>
              <PostHeadline post={post} action={action} />
              {!action && story.length === 0 && !post.withIds.length && !post.placeId && author && author.kind !== "me" && (
                <span className="ml-1.5 text-sm text-slate-400">· {subtitle(author)}</span>
              )}
            </div>
            <div className="text-xs text-slate-400">
              {formatPostDate(post.occurredAt)}
              {edited && " · edited"}
            </div>
          </div>
        </div>
        <PostMenu post={post} onEdit={() => setEditing(true)} />
      </div>

      {editing && (post.kind === "status" || post.kind === "milestone") ? (
        <Composer editing={post} onDone={() => setEditing(false)} />
      ) : post.kind === "article" ? (
        <ArticleTeaser post={post} />
      ) : post.kind === "album" ? (
        <AlbumTeaser post={post} onTag={onTag} />
      ) : (
        <>
          <LifeEventBanner clauses={story} />
          {post.content && <PostContent content={post.content} onTag={onTag} />}
          <MediaGrid post={post} />
        </>
      )}
      {/* Articles and albums edit in the full-screen composer. */}
      {editing && (post.kind === "article" || post.kind === "album") && <Composer editing={post} onDone={() => setEditing(false)} />}
    </article>
  );
}

/** The life events in a story, shown big: "📈 Got promoted · Work & career". */
export function LifeEventBanner({ clauses }: { clauses: Activity[] }) {
  const events = lifeEventsIn(clauses);
  if (events.length === 0) return null;
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const categories = [...new Set(events.flatMap((e) => (e.template ? [categoryOf(e.template.category).label] : [])))];
  return (
    <div className="mb-3 rounded-xl bg-gradient-to-b from-brand-50 to-white px-6 py-6 text-center">
      <div className="flex justify-center -space-x-3">
        {events.map(({ clause }, i) => (
          <div key={i} className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl shadow-sm ring-1 ring-brand-100">
            {clause.emoji}
          </div>
        ))}
      </div>
      <h3 className="mt-3 text-lg font-bold text-slate-900">{events.map(({ clause }) => capital(clause.object)).join(" · ")}</h3>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider text-brand-700">
        Life event{events.length > 1 ? "s" : ""}
        {categories.length > 0 && ` · ${categories.join(" · ")}`}
      </p>
    </div>
  );
}

function ArticleTeaser({ post }: { post: Post }) {
  const { profiles, navigate } = useJournal();
  const cover = post.media[0];
  return (
    <button
      onClick={() => navigate({ view: "post", id: post.id })}
      className="group block w-full overflow-hidden rounded-xl border border-slate-200 text-left transition-colors hover:bg-slate-50"
    >
      {cover && (
        <div className="h-56 overflow-hidden bg-slate-100">
          <MediaPreview media={cover} className="transition-transform duration-500 group-hover:scale-105" />
        </div>
      )}
      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Article · {readingMinutes(post.content)} min read</div>
        <h3 className="mt-1 text-xl font-bold leading-snug text-slate-900">{post.title}</h3>
        <p className="mt-1.5 line-clamp-3 text-sm text-slate-500">{excerpt(post.content, profiles)}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
          Read article <ArrowRightIcon />
        </span>
      </div>
    </button>
  );
}

function AlbumTeaser({ post, onTag }: { post: Post; onTag?: (tag: string) => void }) {
  const { navigate } = useJournal();
  const open = () => navigate({ view: "post", id: post.id });
  return (
    <>
      <button onClick={open} className="text-left text-lg font-bold text-slate-900 hover:underline">
        {post.title}
      </button>
      {post.content && (
        <div className="mt-1">
          <PostContent content={post.content} onTag={onTag} />
        </div>
      )}
      <MediaGrid post={post} />
      <button onClick={open} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        View album · {post.media.length} {post.media.length === 1 ? "item" : "items"} <ArrowRightIcon />
      </button>
    </>
  );
}

/** "…" menu with edit and delete. */
export function PostMenu({ post, onEdit, onDeleted }: { post: Post; onEdit: () => void; onDeleted?: () => void }) {
  const { refresh } = useJournal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const noun = post.kind === "status" || post.kind === "milestone" ? "post" : post.kind;
  const files = post.media.length;

  return (
    <div className="relative">
      <button className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={() => setMenuOpen((o) => !o)} aria-label="Post options">
        <DotsThreeIcon size={22} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
            <MenuItem onClick={() => (onEdit(), setMenuOpen(false))}>
              <PencilSimpleIcon /> Edit {noun}
            </MenuItem>
            <MenuItem danger onClick={() => (setConfirming(true), setMenuOpen(false))}>
              <TrashIcon /> Delete {noun}
            </MenuItem>
          </div>
        </>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Delete ${noun}?`}
          message={`This permanently removes the encrypted ${noun}${files ? ` and its ${files} photo${files > 1 ? "s and videos" : " or video"}` : ""} from the workspace.`}
          onConfirm={async () => {
            await api.deletePost(post.id);
            onDeleted?.();
            await refresh();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function MenuItem(props: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${props.danger ? "text-rose-600" : "text-slate-700"}`}
    >
      {props.children}
    </button>
  );
}
