import { useState } from "react";
import { DotsThreeIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { formatPostDate, subtitle } from "../lib/format";
import { Composer } from "./Composer";
import { MediaGrid } from "./Media";
import { PostContent } from "./PostContent";
import { Avatar, ConfirmDialog } from "./ui";

export function PostCard({ post, onTag }: { post: Post; onTag?: (tag: string) => void }) {
  const { profiles, navigate, refresh } = useJournal();
  const author = profiles.get(post.authorId);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const edited = post.updatedAt - post.createdAt > 60_000;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <button className="flex items-center gap-3 text-left" onClick={() => author && navigate({ view: "profile", id: author.id })}>
          <Avatar profile={author} />
          <div>
            <div className="text-sm font-semibold text-slate-800 hover:underline">
              {author?.name ?? "Unknown"}
              {author && author.kind !== "me" && <span className="ml-1.5 font-normal text-slate-400">· {subtitle(author)}</span>}
            </div>
            <div className="text-xs text-slate-400">
              {formatPostDate(post.occurredAt)}
              {edited && " · edited"}
            </div>
          </div>
        </button>

        <div className="relative">
          <button className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={() => setMenuOpen((o) => !o)} aria-label="Post options">
            <DotsThreeIcon size={22} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <MenuItem onClick={() => (setEditing(true), setMenuOpen(false))}>
                  <PencilSimpleIcon /> Edit
                </MenuItem>
                <MenuItem danger onClick={() => (setConfirming(true), setMenuOpen(false))}>
                  <TrashIcon /> Delete
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <Composer editing={post} onDone={() => setEditing(false)} />
      ) : (
        <>
          {post.content && <PostContent content={post.content} onTag={onTag} />}
          <MediaGrid
            media={post.media}
            caption={
              <span>
                <span className="font-medium text-white">{author?.name ?? "Unknown"}</span> · {formatPostDate(post.occurredAt)}
              </span>
            }
          />
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete post?"
          message={`This permanently removes the encrypted post${post.media.length ? ` and its ${post.media.length} attachment${post.media.length > 1 ? "s" : ""}` : ""} from the workspace.`}
          onConfirm={async () => {
            await api.deletePost(post.id);
            await refresh();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </article>
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
