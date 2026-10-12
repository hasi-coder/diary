// The story of a post, clause by clause: feelings, activities, life events and
// roles in the order the author wants. Each clause can be reworded (verb too),
// described (adjectives, an adverb), told as "is" or "was", tag its own people
// and carry extra words; a preview shows the sentence as the feed will.
import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, DotsSixVerticalIcon, PlusIcon, SparkleIcon, UserPlusIcon, XIcon } from "@phosphor-icons/react";
import { ADJECTIVES, ADVERBS } from "../lib/catalog";
import type { Activity } from "../lib/api";
import { useJournal } from "../lib/journal";
import { kindOf } from "../lib/story";
import { PostHeadline, TagPeoplePicker } from "./PostExtras";

export function StoryEditor(props: {
  clauses: Activity[];
  onChange: (clauses: Activity[]) => void;
  authorId: string;
  withIds: string[];
  placeId: string | null;
  /** How the story is told: "is" (now) or "was" (then); sets every state clause. */
  tense: "is" | "was";
  onTense: (tense: "is" | "was") => void;
  onAdd: () => void;
}) {
  const { profiles } = useJournal();
  const { clauses, onChange } = props;
  const [tagging, setTagging] = useState<number | null>(null);
  const [describing, setDescribing] = useState<number | null>(null);
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
            className={`group rounded-lg bg-white px-1.5 py-1 text-sm shadow-sm ring-1 ring-slate-200 ${dragging === i ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-1.5">
            <DotsSixVerticalIcon className="shrink-0 cursor-grab text-slate-300" aria-hidden />
            {kindOf(c) === "state" ? (
              <button
                type="button"
                title="Is it happening, or was it?"
                onClick={() => update(i, { tense: c.tense === "was" ? undefined : "was" })}
                className="w-9 shrink-0 rounded-full bg-slate-100 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-brand-50 hover:text-brand-700"
              >
                {c.tense === "was" ? "was" : "is"}
              </button>
            ) : (
              <span className="w-9 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-300">{kindOf(c) === "as" ? "as" : "did"}</span>
            )}
            <span className="w-6 shrink-0 text-center">{c.emoji}</span>
            {c.verb && c.verb !== "as" && <span className="shrink-0 font-medium text-slate-700">{c.verb}</span>}
            {c.adjectives && <span className="shrink-0 italic text-brand-700">{c.adjectives}</span>}
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
              <IconButton title="Describe it: adjectives, how, wording" onClick={() => setDescribing(describing === i ? null : i)}>
                <SparkleIcon />
              </IconButton>
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
            </div>
            {(describing === i || c.adjectives || c.adverb) && (
              // Any words go: it's their journal. Suggestions are only a start.
              <div className="mt-1 flex flex-wrap items-center gap-2 pl-[4.75rem] text-xs text-slate-500">
                <label className="flex items-center gap-1">
                  verb
                  <input value={c.verb} onChange={(e) => update(i, { verb: e.target.value })} placeholder="(none)" className={smallInput} style={{ width: "9ch" }} />
                </label>
                <label className="flex items-center gap-1">
                  describe it
                  <input
                    list="story-adjectives"
                    value={c.adjectives ?? ""}
                    onChange={(e) => update(i, { adjectives: e.target.value })}
                    placeholder="gorgeous red, wild…"
                    className={smallInput}
                    style={{ width: "16ch" }}
                  />
                </label>
                <label className="flex items-center gap-1">
                  how
                  <input
                    list="story-adverbs"
                    value={c.adverb ?? ""}
                    onChange={(e) => update(i, { adverb: e.target.value })}
                    placeholder="quietly, passionately…"
                    className={smallInput}
                    style={{ width: "16ch" }}
                  />
                </label>
              </div>
            )}
          </li>
        ))}
      </ol>
      <datalist id="story-adjectives">
        {ADJECTIVES.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <datalist id="story-adverbs">
        {ADVERBS.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
        <button type="button" onClick={props.onAdd} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
          <PlusIcon /> Add to the story
        </button>
        <span className="ml-auto text-[11px] text-slate-400">Tell it as</span>
        {(["is", "was"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => props.onTense(t)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${props.tense === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
          >
            {t === "is" ? "is · now" : "was · then"}
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 leading-relaxed">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Reads as</span>
        <PostHeadline
          preview
          post={{ authorId: props.authorId, kind: "status", title: "", feeling: null, activities: clauses, eventType: "", withIds: props.withIds, placeId: props.placeId }}
        />
      </p>
    </div>
  );
}

const smallInput = "rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 outline-none focus:border-brand-500";

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
