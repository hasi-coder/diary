// Facebook-style post extras: tag people and check in, plus the headline that
// reads a post's story as a sentence ("Sarah was 🥳 feeling festive … with … at …").
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import type { Post, Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import { arrange, clauseText, storyOf } from "../lib/story";
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
      <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-2xl bg-white shadow-md">
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

type Story = Pick<Post, "authorId" | "kind" | "title" | "feeling" | "activities" | "eventType" | "alsoEventTypes" | "withIds" | "placeId">;

/**
 * "Sarah Jenkins was 🥳 feeling festive, 🎄 attending the ward Christmas party as a
 * nurse with Dev Patel and 🥻 wearing a saree for the first time at work."
 * Clauses keep the author's order; see story.ts for how they join.
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

  const pieces = arrange(storyOf(post));
  const place = post.placeId ? profiles.get(post.placeId) : undefined;
  const parts: ReactNode[] = pieces.map(({ clause: c, before, aux }, i) => (
    <Fragment key={i}>
      {i === 0 && action && before === " " ? " — " : before}
      {aux}
      <span className="text-slate-600">
        {c.emoji} {clauseText(c)}
      </span>
      {people(c.withIds ?? [], `c${i}`)}
      {c.detail && ` ${c.detail}`}
    </Fragment>
  ));
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
          {parts.length === 0 && (action ? " —" : " is")}
          {parts}
          {tail}.
        </>
      )}
    </span>
  );
}
