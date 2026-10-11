// The story of a post, clause by clause: a feeling, activities and life events
// in the order the author wants. Each clause can be reworded, tag its own people
// and carry extra words; a preview shows the sentence as the feed will.
import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, DotsSixVerticalIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react";
import type { Activity } from "../lib/api";
import { useJournal } from "../lib/journal";
import { PostHeadline, TagPeoplePicker } from "./PostExtras";

export function StoryEditor(props: {
  clauses: Activity[];
  onChange: (clauses: Activity[]) => void;
  authorId: string;
  withIds: string[];
  placeId: string | null;
}) {
  const { profiles } = useJournal();
  const { clauses, onChange } = props;
  const [tagging, setTagging] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  if (clauses.length === 0) return null;

  const update = (i: number, patch: Partial<Activity>) => onChange(clauses.map((c, x) => (x === i ? { ...c, ...patch } : c)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= clauses.length || from === to) return;
    const next = [...clauses];
    const [c] = next.splice(from, 1);
    next.splice(to, 0, c);
    onChange(next);
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
      <ol className="space-y-1">
        {clauses.map((c, i) => (
          <li
            key={i}
            draggable
            onDragStart={() => setDragging(i)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => (e.preventDefault(), dragging !== null && move(dragging, i), setDragging(null))}
            className={`group flex items-center gap-1.5 rounded-lg bg-white px-1.5 py-1 text-sm shadow-sm ring-1 ring-slate-200 ${dragging === i ? "opacity-50" : ""}`}
          >
            <DotsSixVerticalIcon className="shrink-0 cursor-grab text-slate-300" aria-hidden />
            <span className="w-6 shrink-0 text-center">{c.emoji}</span>
            {c.verb && <span className="shrink-0 font-medium text-slate-700">{c.verb}</span>}
            <input
              value={c.object}
              onChange={(e) => update(i, { object: e.target.value })}
              aria-label="What"
              className="min-w-[6rem] flex-1 rounded px-1 py-0.5 text-slate-800 outline-none hover:bg-slate-50 focus:bg-slate-50"
            />
            {(c.withIds ?? []).map((id) => (
              <span key={id} className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-50 py-0.5 pl-2 pr-1 text-xs text-brand-700">
                with {profiles.get(id)?.name ?? "deleted profile"}
                <button type="button" onClick={() => update(i, { withIds: c.withIds?.filter((x) => x !== id) })} aria-label="Untag" className="rounded-full p-0.5 hover:bg-brand-100">
                  <XIcon size={10} />
                </button>
              </span>
            ))}
            <input
              value={c.detail ?? ""}
              onChange={(e) => update(i, { detail: e.target.value })}
              placeholder="+ more words"
              aria-label="More words"
              style={{ width: `${Math.min(30, Math.max(10, (c.detail ?? "").length + 2))}ch` }}
              className="shrink rounded px-1 py-0.5 text-slate-600 placeholder-slate-300 outline-none hover:bg-slate-50 focus:bg-slate-50"
            />
            <div className="relative flex shrink-0 items-center">
              <IconButton title="Tag people in this part" onClick={() => setTagging(tagging === i ? null : i)}>
                <UserPlusIcon />
              </IconButton>
              {tagging === i && (
                <TagPeoplePicker selected={c.withIds ?? []} exclude={props.authorId} onChange={(ids) => update(i, { withIds: ids })} onClose={() => setTagging(null)} />
              )}
              <IconButton title="Move up" onClick={() => move(i, i - 1)} disabled={i === 0}>
                <ArrowUpIcon />
              </IconButton>
              <IconButton title="Move down" onClick={() => move(i, i + 1)} disabled={i === clauses.length - 1}>
                <ArrowDownIcon />
              </IconButton>
              <IconButton title="Remove" onClick={() => onChange(clauses.filter((_, x) => x !== i))}>
                <XIcon />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 px-1 leading-relaxed">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reads as</span>
        <PostHeadline preview post={{ authorId: props.authorId, feeling: null, activities: clauses, withIds: props.withIds, placeId: props.placeId }} />
      </p>
    </div>
  );
}

function IconButton(props: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}
