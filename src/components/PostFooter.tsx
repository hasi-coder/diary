// Under a post, as on Facebook: the reaction summary, Like and Comment
// buttons, and the comments. Reactions and comments can be given as any
// person (you by default), so a diary can record "Sarah loved this".
import { useRef, useState } from "react";
import { ChatCircleIcon, DotsThreeIcon, PaperPlaneRightIcon, ThumbsUpIcon } from "@phosphor-icons/react";
import { api, errorMessage, REACTIONS, type Comment, type Post, type Profile, type ReactionKind } from "../lib/api";
import { useJournal } from "../lib/journal";
import { formatPostDate } from "../lib/format";
import { PostContent } from "./PostContent";
import { Avatar } from "./ui";

export function PostFooter({ post, flush }: { post: Post; flush?: boolean }) {
  const { owner, refresh } = useJournal();
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const comments = post.comments ?? [];
  const reactions = post.reactions ?? [];
  const mine = reactions.find((r) => r.profileId === owner.id)?.kind;

  const react = async (kind: ReactionKind | null) => {
    setError(null);
    try {
      await api.setReaction(post.id, owner.id, kind);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className={flush ? "" : "-mx-4 -mb-3 mt-3"}>
      {(reactions.length > 0 || comments.length > 0) && (
        <div className="flex items-center justify-between px-4 py-2.5 text-[15px] text-slate-500">
          <ReactionSummary post={post} />
          {comments.length > 0 && (
            <button className="hover:underline" onClick={() => setCommenting(true)}>
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </button>
          )}
        </div>
      )}
      <div className="mx-4 flex border-t border-slate-300 py-1">
        <LikeButton current={mine} onReact={react} />
        <button
          onClick={() => setCommenting(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-slate-500 hover:bg-slate-50"
        >
          <ChatCircleIcon size={20} /> Comment
        </button>
      </div>
      {error && <p className="px-4 pb-2 text-[13px] text-rose-600">{error}</p>}
      {(commenting || comments.length > 0) && (
        <div className="space-y-2 border-t border-slate-300 px-4 py-2">
          {comments.map((c) => (
            <CommentRow key={c.id} post={post} comment={c} />
          ))}
          <CommentBox post={post} autoFocus={commenting} />
        </div>
      )}
    </div>
  );
}

function ReactionSummary({ post }: { post: Post }) {
  const { profiles, owner } = useJournal();
  const reactions = post.reactions ?? [];
  if (reactions.length === 0) return <span />;
  const kinds = [...new Set(reactions.map((r) => r.kind))].slice(0, 3);
  const names = reactions.map((r) => (r.profileId === owner.id ? "You" : (profiles.get(r.profileId)?.name ?? "Someone")));
  const label = names.length <= 2 ? names.join(" and ") : `${names[0]} and ${names.length - 1} others`;
  return (
    <span className="flex items-center gap-1.5" title={reactions.map((r, i) => `${names[i]}: ${REACTIONS[r.kind].label}`).join("\n")}>
      <span className="flex -space-x-1">
        {kinds.map((k) => (
          <span key={k} className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[13px] leading-none ring-2 ring-white">
            {REACTIONS[k].emoji}
          </span>
        ))}
      </span>
      {label}
    </span>
  );
}

/** Click to Like (or undo); hover to pick another reaction, as on Facebook. */
function LikeButton({ current, onReact }: { current?: ReactionKind; onReact: (kind: ReactionKind | null) => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 400);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 300);
  };
  const r = current ? REACTIONS[current] : null;
  return (
    <div className="relative flex flex-1" onMouseEnter={show} onMouseLeave={hide}>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full bg-white px-2 py-1.5 shadow-md" role="menu">
          {(Object.keys(REACTIONS) as ReactionKind[]).map((k) => (
            <button
              key={k}
              title={REACTIONS[k].label}
              onClick={() => (setOpen(false), onReact(current === k ? null : k))}
              className="text-[28px] leading-none transition-transform hover:-translate-y-1 hover:scale-125"
            >
              {REACTIONS[k].emoji}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => onReact(current ? null : "like")}
        className={`flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold hover:bg-slate-50 ${r ? r.color : "text-slate-500"}`}
      >
        {r && current !== "like" ? <span className="text-[18px] leading-none">{r.emoji}</span> : <ThumbsUpIcon size={20} weight={r ? "fill" : "regular"} />}
        {r ? r.label : "Like"}
      </button>
    </div>
  );
}

function CommentRow({ post, comment }: { post: Post; comment: Comment }) {
  const { profiles, navigate, refresh } = useJournal();
  const author = profiles.get(comment.authorId);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [text, setText] = useState(comment.content);

  const save = async () => {
    if (!text.trim()) return;
    await api.editComment(post.id, comment.id, text);
    setEditing(false);
    await refresh();
  };

  return (
    <div className="group flex gap-2">
      <button onClick={() => author && navigate({ view: "profile", id: author.id })} aria-label={author?.name}>
        <Avatar profile={author} size="sm" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {editing ? (
            <textarea
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), void save());
                if (e.key === "Escape") (setEditing(false), setText(comment.content));
              }}
              className="w-full resize-none rounded-2xl bg-slate-50 px-3 py-2 text-[15px] text-slate-800 outline-none"
              rows={Math.min(6, text.split("\n").length)}
            />
          ) : (
            <div className="inline-block max-w-full rounded-2xl bg-slate-50 px-3 py-2">
              <button
                className="block text-[13px] font-semibold text-slate-800 hover:underline"
                onClick={() => author && navigate({ view: "profile", id: author.id })}
              >
                {author?.name ?? "Unknown"}
              </button>
              <PostContent content={comment.content} />
            </div>
          )}
          {!editing && (
            <div className="relative opacity-0 group-hover:opacity-100">
              <button onClick={() => setMenu((m) => !m)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Comment options">
                <DotsThreeIcon size={18} weight="bold" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute left-0 z-20 mt-1 w-32 overflow-hidden rounded-lg bg-white p-1 text-[15px] shadow-md">
                    <button className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-slate-50" onClick={() => (setEditing(true), setMenu(false))}>
                      Edit
                    </button>
                    <button
                      className="block w-full rounded-md px-2 py-1.5 text-left text-rose-600 hover:bg-slate-50"
                      onClick={async () => {
                        setMenu(false);
                        await api.deleteComment(post.id, comment.id);
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="px-3 pt-0.5 text-[12px] text-slate-500">
          {editing ? "Enter to save · Esc to cancel" : formatPostDate(comment.createdAt)}
          {!editing && comment.updatedAt - comment.createdAt > 60_000 && " · edited"}
        </div>
      </div>
    </div>
  );
}

/** Who you're acting as (commenting, voting): your avatar, or one of your people's. Click to change. */
export function ActAsPicker({ value, onChange, label }: { value: Profile; onChange: (id: string) => void; label: string }) {
  const { snapshot } = useJournal();
  const [picking, setPicking] = useState(false);
  const people = snapshot.profiles.filter((p) => p.kind === "me" || p.kind === "person");
  return (
    <div className="relative">
      <button type="button" onClick={() => setPicking((p) => !p)} title={`${label} ${value.name}. Click to change.`} aria-label={label}>
        <Avatar profile={value} size="sm" />
      </button>
      {picking && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setPicking(false)} />
          <div className="thin-scroll absolute bottom-full left-0 z-20 mb-1 max-h-64 w-56 overflow-y-auto rounded-lg bg-white p-1 shadow-md">
            <div className="px-2 py-1 text-[12px] font-semibold text-slate-500">{label}</div>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => (onChange(p.id), setPicking(false))}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] hover:bg-slate-50 ${p.id === value.id ? "font-semibold" : ""}`}
              >
                <Avatar profile={p} size="sm" /> <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** "Write a comment…", as you or as one of your people. */
function CommentBox({ post, autoFocus }: { post: Post; autoFocus?: boolean }) {
  const { owner, profiles, refresh } = useJournal();
  const [authorId, setAuthorId] = useState(owner.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const author = profiles.get(authorId) ?? owner;

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.addComment(post.id, author.id, text);
      setText("");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <ActAsPicker value={author} onChange={setAuthorId} label="Comment as" />
      <div className="min-w-0 flex-1">
        <div className="flex items-end rounded-2xl bg-slate-50 pr-1">
          <textarea
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), void send());
            }}
            placeholder={author.id === owner.id ? "Write a comment…" : `Comment as ${author.name}…`}
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            className="min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] text-slate-800 placeholder-slate-500 outline-none"
          />
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            className="mb-1 rounded-full p-1.5 text-brand-600 hover:bg-slate-100 disabled:text-slate-300"
            aria-label="Post comment"
          >
            <PaperPlaneRightIcon size={18} weight="fill" />
          </button>
        </div>
        {error && <p className="px-3 pt-1 text-[12px] text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
