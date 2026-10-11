// Facebook-style post extras: tag people, check in, a feeling and activities, plus the "is feeling … with … at …" headline.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { Activity, Feeling, Post, Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import { ACTIVITY_VERBS, FEELINGS, joinAnd, type ActivityVerb } from "../lib/catalog";
import { KINDS, searchThings, type Thing } from "../lib/vocab";
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
  const [tab, setTab] = useState<"feelings" | "activities">("feelings");
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
        {(["feelings", "activities"] as const).map((t) => (
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

/** Removable chips for the extras chosen in the composer. */
export function ExtrasChips(props: {
  withIds: string[];
  placeId: string | null;
  feeling: Feeling | null;
  activities: Activity[];
  onRemoveWith: (id: string) => void;
  onRemovePlace: () => void;
  onRemoveFeeling: () => void;
  onRemoveActivity: (index: number) => void;
}) {
  const { profiles } = useJournal();
  if (!props.feeling && !props.placeId && props.withIds.length === 0 && props.activities.length === 0) return null;
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
      {props.feeling && chip("feeling", `${props.feeling.emoji} ${props.feeling.text}`, props.onRemoveFeeling)}
      {props.activities.map((a, i) => chip(`activity-${i}`, `${a.emoji} ${a.verb} ${a.object}`, () => props.onRemoveActivity(i)))}
      {props.withIds.map((id) => chip(id, <>with {profiles.get(id)?.name ?? "deleted profile"}</>, () => props.onRemoveWith(id)))}
      {place && chip("place", <>📍 at {place.name}</>, props.onRemovePlace)}
    </div>
  );
}

/** "Alex Morgan is 😊 feeling happy and 👗 wearing a saree with Sarah and 2 others at Lake Minnetonka." */
export function PostHeadline({ post, action }: { post: Post; action?: string | null }) {
  const { profiles, navigate } = useJournal();
  const author = profiles.get(post.authorId);
  const link = (p: Profile) => (
    <button
      key={p.id}
      onClick={(e) => (e.stopPropagation(), navigate({ view: "profile", id: p.id }))}
      className="font-semibold text-slate-800 hover:underline"
    >
      {p.name}
    </button>
  );
  const withs = post.withIds.map((id) => profiles.get(id)).filter((p): p is Profile => !!p);
  const place = post.placeId ? profiles.get(post.placeId) : undefined;
  const [showAll, setShowAll] = useState(false);

  const withPart: ReactNode[] = [];
  if (withs.length > 0) {
    const visible = withs.length <= 3 || showAll ? withs : withs.slice(0, 1);
    visible.forEach((p, i) => {
      if (i > 0) withPart.push(i === visible.length - 1 && visible.length === withs.length ? " and " : ", ");
      withPart.push(link(p));
    });
    if (visible.length < withs.length) {
      withPart.push(
        " and ",
        <button key="more" onClick={(e) => (e.stopPropagation(), setShowAll(true))} className="font-semibold text-slate-800 hover:underline">
          {withs.length - 1} others
        </button>,
      );
    }
  }

  const extras: ReactNode[] = [];
  // "😊 feeling happy, 💼 working as a nurse and 👗 wearing a saree"
  const doing = [...(post.feeling ? [`${post.feeling.emoji} ${post.feeling.text}`] : []), ...(post.activities ?? []).map((a) => `${a.emoji} ${a.verb} ${a.object}`)];
  if (doing.length > 0) extras.push(joinAnd(doing));
  if (withPart.length > 0) extras.push(<>with {withPart.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>);
  if (place) extras.push(<>at {link(place)}</>);

  return (
    <span className="text-sm text-slate-500">
      {author ? link(author) : <span className="font-semibold text-slate-800">Unknown</span>}
      {action && ` ${action}`}
      {extras.length > 0 && (
        <>
          {action ? " — " : " is "}
          {extras.map((x, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              {x}
            </Fragment>
          ))}
          .
        </>
      )}
    </span>
  );
}
