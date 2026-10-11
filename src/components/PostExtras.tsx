// Facebook-style post extras: tag people, check in, and the story clauses (a feeling,
// activities, life events), plus the "is feeling … with … at …" headline.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { Activity, Feeling, Post, Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import { ACTIVITY_VERBS, FEELINGS, type ActivityVerb } from "../lib/catalog";
import { KINDS, searchThings, type Thing } from "../lib/vocab";
import { categoryOf, displayLabel, searchLifeEvents } from "../lib/lifeEvents";
import { subtitle } from "../lib/format";
import { Avatar } from "./ui";

function useFiltered(candidates: Profile[], query: string) {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [candidates, query]);
}

function Popover(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={props.onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-800">{props.title}</span>
          <button onClick={props.onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>
        {props.children}
      </div>
    </>
  );
}

const searchClass =
  "m-3 mb-1 w-[calc(100%-1.5rem)] rounded-full bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/30";

/** Multi-select of people and pages to tag "with". */
export function TagPeoplePicker(props: { selected: string[]; exclude: string; onChange: (ids: string[]) => void; onClose: () => void }) {
  const { snapshot } = useJournal();
  const [query, setQuery] = useState("");
  const candidates = useMemo(
    () => snapshot.profiles.filter((p) => p.id !== props.exclude && (p.kind === "person" || p.kind === "me" || p.kind === "page")),
    [snapshot.profiles, props.exclude],
  );
  const shown = useFiltered(candidates, query);
  const toggle = (id: string) =>
    props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);

  return (
    <Popover title="Tag people" onClose={props.onClose}>
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for people" className={searchClass} />
      <ul className="thin-scroll max-h-72 overflow-y-auto py-1">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => toggle(p.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
              <Avatar profile={p} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                <span className="block text-xs text-slate-400">{subtitle(p)}</span>
              </span>
              {props.selected.includes(p.id) && <CheckIcon size={18} className="text-brand-600" weight="bold" />}
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">No matches.</li>}
      </ul>
    </Popover>
  );
}

/** Single-select of places, shops and pages to check in at. */
export function CheckInPicker(props: { onPick: (id: string) => void; onClose: () => void }) {
  const { snapshot } = useJournal();
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => snapshot.profiles.filter((p) => p.kind === "place" || p.kind === "shop" || p.kind === "page"), [snapshot.profiles]);
  const shown = useFiltered(candidates, query);
  return (
    <Popover title="Check in" onClose={props.onClose}>
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Where are you?" className={searchClass} />
      <ul className="thin-scroll max-h-72 overflow-y-auto py-1">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => (props.onPick(p.id), props.onClose())}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50"
            >
              <Avatar profile={p} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                <span className="block text-xs text-slate-400">{p.location || subtitle(p)}</span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">No places yet. Create a Place profile first.</li>}
      </ul>
    </Popover>
  );
}

/**
 * One feeling, plus any number of activities: pick a verb, then a thing from
 * its vocabularies ("attending" → "an office party") or type your own.
 */
export function FeelingPicker(props: { onPick: (f: Feeling) => void; onAddActivity: (a: Activity) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"feelings" | "activities" | "life events">("feelings");
  const [verb, setVerb] = useState<ActivityVerb | null>(null);
  const [object, setObject] = useState("");
  const things = useMemo(() => (verb ? searchThings(verb.kinds, object, 80) : []), [verb, object]);
  const pick = (f: Feeling) => (props.onPick(f), props.onClose());
  const add = (a: Activity) => (props.onAddActivity(a), props.onClose());
  const addThing = (t: Thing) => verb && add({ emoji: t.emoji, verb: verb.verb, object: t.phrase, thing: `${t.kind}:${t.id}` });
  const addText = () => verb && object.trim() && add({ emoji: verb.emoji, verb: verb.verb, object: object.trim() });

  return (
    <Popover title="How are you feeling? What are you doing?" onClose={props.onClose}>
      <div className="flex gap-1 px-3 pt-3">
        {(["feelings", "activities", "life events"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => (setTab(t), setVerb(null), setObject(""))}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${tab === t ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "feelings" ? (
        <div className="thin-scroll grid max-h-72 grid-cols-2 gap-1 overflow-y-auto p-3">
          {FEELINGS.map((f) => (
            <button key={f.text} type="button" onClick={() => pick(f)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              <span className="text-lg">{f.emoji}</span> {f.text.replace("feeling ", "")}
            </button>
          ))}
        </div>
      ) : tab === "life events" ? (
        <LifeEventClausePicker onAdd={add} />
      ) : verb ? (
        <form
          className="p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (things.length > 0 && object.trim()) addThing(things[0]);
            else addText();
          }}
        >
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>
              {verb.emoji} {verb.verb}…
            </span>
            <button type="button" onClick={() => (setVerb(null), setObject(""))} className="text-xs text-slate-500 hover:underline">
              Back
            </button>
          </div>
          <input
            autoFocus
            value={object}
            onChange={(e) => setObject(e.target.value)}
            placeholder={verb.prompt}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <ul className="thin-scroll mt-2 max-h-56 overflow-y-auto">
            {object.trim() && !things.some((t) => t.label.toLowerCase() === object.trim().toLowerCase()) && (
              <li>
                <button type="button" onClick={addText} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className="w-6 text-center">{verb.emoji}</span>
                  <span>
                    {verb.verb} <b>{object.trim()}</b>
                  </span>
                </button>
              </li>
            )}
            {things.map((t) => (
              <li key={`${t.kind}:${t.id}`}>
                <button type="button" onClick={() => addThing(t)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className="w-6 text-center">{t.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  {verb.kinds.length > 1 && <span className="text-[10px] uppercase tracking-wide text-slate-400">{KINDS[t.kind].label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </form>
      ) : (
        <div className="thin-scroll grid max-h-72 grid-cols-2 gap-0.5 overflow-y-auto p-2">
          {ACTIVITY_VERBS.map((a) => (
            <button key={a.verb} type="button" onClick={() => setVerb(a)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              <span className="text-lg">{a.emoji}</span> <span className="capitalize">{a.verb}…</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Any life event as a clause of the story: "🎓 earned a BSc", "🇯🇵 visited Japan". */
function LifeEventClausePicker({ onAdd }: { onAdd: (a: Activity) => void }) {
  const [query, setQuery] = useState("");
  // Unbound typed templates ("Visited …") need their thing: search expands them ("japan").
  const results = useMemo(() => searchLifeEvents(query).filter((t) => !t.vocab || t.bound).slice(0, 60), [query]);
  const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  return (
    <div className="p-3">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Graduated, visited Japan, first kiss…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
      <ul className="thin-scroll mt-2 max-h-56 overflow-y-auto">
        {results.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onAdd({ emoji: t.emoji, verb: "", object: lower(displayLabel(t)), thing: `event:${t.id}` })}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="w-6 text-center">{t.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{displayLabel(t)}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{categoryOf(t.category).label.split(" ")[0]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Removable chips for the post-level people and place chosen in the composer. */
export function ExtrasChips(props: {
  withIds: string[];
  placeId: string | null;
  onRemoveWith: (id: string) => void;
  onRemovePlace: () => void;
}) {
  const { profiles } = useJournal();
  if (!props.placeId && props.withIds.length === 0) return null;
  const chip = (key: string, content: ReactNode, onRemove: () => void) => (
    <span key={key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
      {content}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-slate-200" aria-label="Remove">
        <XIcon size={11} />
      </button>
    </span>
  );
  const place = props.placeId ? profiles.get(props.placeId) : undefined;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {props.withIds.map((id) => chip(id, <>with {profiles.get(id)?.name ?? "deleted profile"}</>, () => props.onRemoveWith(id)))}
      {place && chip("place", <>📍 at {place.name}</>, props.onRemovePlace)}
    </div>
  );
}

/** The clauses to show for a post: its activities, after a feeling saved the old way. */
export function clausesOf(post: Pick<Post, "feeling" | "activities">): Activity[] {
  const list = post.activities ?? [];
  if (!post.feeling || list.some((a) => a.verb === "feeling")) return list;
  const [, word] = /^feeling (.+)$/.exec(post.feeling.text) ?? [];
  return [word ? { emoji: post.feeling.emoji, verb: "feeling", object: word } : { emoji: post.feeling.emoji, verb: "", object: post.feeling.text }, ...list];
}

/** Happening now ("feeling …", "wearing …") rather than done ("earned a BSc"): those follow "is". */
const isNow = (a: Activity) => a.verb !== "" || /^\w+ing\b/.test(a.object);

type Story = Pick<Post, "authorId" | "feeling" | "activities" | "withIds" | "placeId">;

/**
 * "Sarah Jenkins is 🥳 feeling festive, 💼 working as a nurse, 🎄 attending the ward
 * Christmas party with Dev Patel and 🥻 wearing a saree for the first time at work."
 * Clauses keep the author's order; done things ("🎓 earned a BSc") read without "is".
 */
export function PostHeadline({ post, action, preview }: { post: Story; action?: string | null; preview?: boolean }) {
  const { profiles, navigate } = useJournal();
  const author = profiles.get(post.authorId);
  const [showAll, setShowAll] = useState(false);
  const link = (p: Profile, key?: string) =>
    preview ? (
      <span key={key ?? p.id} className="font-semibold text-slate-800">
        {p.name}
      </span>
    ) : (
      <button key={key ?? p.id} onClick={(e) => (e.stopPropagation(), navigate({ view: "profile", id: p.id }))} className="font-semibold text-slate-800 hover:underline">
        {p.name}
      </button>
    );
  const people = (ids: string[], key: string, collapse = false): ReactNode => {
    const list = ids.map((id) => profiles.get(id)).filter((p): p is Profile => !!p);
    const visible = collapse && list.length > 3 && !showAll ? list.slice(0, 1) : list;
    const nodes: ReactNode[] = [];
    visible.forEach((p, i) => {
      if (i > 0) nodes.push(i === visible.length - 1 && visible.length === list.length ? " and " : ", ");
      nodes.push(link(p, `${key}-${p.id}`));
    });
    if (visible.length < list.length)
      nodes.push(
        " and ",
        <button key={`${key}-more`} onClick={(e) => (e.stopPropagation(), setShowAll(true))} className="font-semibold text-slate-800 hover:underline">
          {list.length - 1} others
        </button>,
      );
    return nodes.length ? <> with {nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</> : null;
  };

  const clauses = clausesOf(post);
  const place = post.placeId ? profiles.get(post.placeId) : undefined;
  const parts: ReactNode[] = clauses.map((c, i) => {
    // "got promoted, and is feeling proud": a change of tense starts a new part of the sentence.
    const switches = i > 0 && isNow(c) !== isNow(clauses[i - 1]);
    const sep = i === 0 ? "" : switches ? ", and " : i === clauses.length - 1 ? " and " : ", ";
    const is = !action && isNow(c) && (i === 0 || !isNow(clauses[i - 1])) ? "is " : "";
    return (
      <Fragment key={i}>
        {sep}
        {is}
        <span className="text-slate-600">
          {c.emoji} {c.verb && `${c.verb} `}
          {c.object}
        </span>
        {people(c.withIds ?? [], `c${i}`)}
        {c.detail && ` ${c.detail}`}
      </Fragment>
    );
  });
  const withs = people(post.withIds, "post", true);
  const tail = (
    <>
      {withs}
      {place && <> at {link(place)}</>}
    </>
  );
  const hasStory = parts.length > 0 || withs || place;

  return (
    <span className="text-sm text-slate-500">
      {author ? link(author) : <span className="font-semibold text-slate-800">Unknown</span>}
      {action && ` ${action}`}
      {hasStory && (
        <>
          {action ? " — " : parts.length ? " " : " is"}
          {parts}
          {tail}.
        </>
      )}
    </span>
  );
}
