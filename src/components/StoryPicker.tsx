// Add a clause to a post's story: a feeling, something being done, a life
// event (grouped by category), or a role ("as a nurse" / "a nurse").
import { useMemo, useState } from "react";
import { ArrowLeftIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import type { Activity } from "../lib/api";
import { ACTIVITY_VERBS, FEELINGS, type ActivityVerb } from "../lib/catalog";
import { displayLabel, lifeEvent, type LifeEventTemplate } from "../lib/lifeEvents";
import { eventClause, roleClause } from "../lib/story";
import { KINDS, searchThings, VOCAB, type Thing } from "../lib/vocab";
import { LifeEventBrowser } from "./LifeEventPicker";
import { Modal } from "./ui";

type Tab = "feeling" | "doing" | "events" | "as";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "feeling", label: "😊 Feeling", hint: "is / was feeling …" },
  { id: "doing", label: "🎬 Doing", hint: "working as, attending, wearing …" },
  { id: "events", label: "🏁 Life events", hint: "got promoted, visited Japan …" },
  { id: "as", label: "🧑‍⚕️ As", hint: "as a nurse, a student …" },
];

export function StoryPicker(props: { onAdd: (clause: Activity) => void; onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? "feeling");
  const add = (c: Activity) => (props.onAdd(c), props.onClose());

  return (
    <Modal title="Add to the story" onClose={props.onClose} huge>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-xl border px-3 py-2 text-left transition-colors ${tab === t.id ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
          >
            <span className={`block text-sm font-semibold ${tab === t.id ? "text-brand-700" : "text-slate-700"}`}>{t.label}</span>
            <span className="block truncate text-[11px] text-slate-400">{t.hint}</span>
          </button>
        ))}
      </div>
      {tab === "feeling" && <Feelings onAdd={add} />}
      {tab === "doing" && <Doing onAdd={add} />}
      {tab === "events" && <LifeEvents onAdd={add} />}
      {tab === "as" && <Roles onAdd={add} />}
    </Modal>
  );
}

function Feelings({ onAdd }: { onAdd: (c: Activity) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      {FEELINGS.map((f) => {
        const word = f.text.replace(/^feeling /, "");
        return (
          <button
            key={f.text}
            type="button"
            onClick={() => onAdd({ emoji: f.emoji, verb: "feeling", object: word, thing: `feeling:${word}` })}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
          >
            <span className="text-xl">{f.emoji}</span> {word}
          </button>
        );
      })}
    </div>
  );
}

/** A verb, then a thing from its vocabularies or your own words. */
function Doing({ onAdd }: { onAdd: (c: Activity) => void }) {
  const [verb, setVerb] = useState<ActivityVerb | null>(null);
  if (!verb)
    return (
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {ACTIVITY_VERBS.map((a) => (
          <button key={a.label ?? a.verb} type="button" onClick={() => setVerb(a)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50">
            <span className="text-xl">{a.emoji}</span> <span className="first-letter:uppercase">{a.label ?? `${a.verb}…`}</span>
          </button>
        ))}
      </div>
    );
  return (
    <ThingChooser
      title={`${verb.emoji} ${verb.label ?? `${verb.verb}…`}`}
      placeholder={verb.prompt}
      things={(q) => searchThings(verb.kinds, q, 120)}
      showKind={verb.kinds.length > 1}
      onBack={() => setVerb(null)}
      onThing={(t) => onAdd({ emoji: t.emoji, verb: verb.verb, object: t.phrase, thing: `${t.kind}:${t.id}` })}
      onText={(text) => onAdd({ emoji: verb.emoji, verb: verb.verb, object: text })}
    />
  );
}

/** The life-event catalog, by category; a typed one ("Visited …") then asks which thing. */
function LifeEvents({ onAdd }: { onAdd: (c: Activity) => void }) {
  const [typed, setTyped] = useState<LifeEventTemplate | null>(null);
  if (typed?.vocab) {
    const kind = typed.vocab;
    return (
      <ThingChooser
        title={`${typed.emoji} ${displayLabel(typed)}`}
        placeholder={`Which ${KINDS[kind].label.toLowerCase()}?`}
        things={(q) => searchThings([kind], q, 200)}
        onBack={() => setTyped(null)}
        onThing={(t) => onAdd(eventClause(lifeEvent(`${typed.id}@${t.id}`)))}
        onText={(text) => onAdd({ ...eventClause(typed), object: displayLabel(typed).replace("…", text).replace(/^\w/, (c) => c.toLowerCase()) })}
      />
    );
  }
  return (
    <LifeEventBrowser
      onPick={(id) => {
        const t = lifeEvent(id);
        if (t.vocab && !t.bound) setTyped(t);
        else onAdd(eventClause(t));
      }}
    />
  );
}

/** Roles as part of the story: "as a nurse" joins the clause before it; "a nurse" says who you are or were. */
function Roles({ onAdd }: { onAdd: (c: Activity) => void }) {
  const [attached, setAttached] = useState(true);
  return (
    <>
      <div className="mb-3 flex gap-2">
        {[
          { value: true, label: "as a …", example: "attending the ward party as a nurse" },
          { value: false, label: "is / was a …", example: "Sarah was a nurse" },
        ].map((o) => (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => setAttached(o.value)}
            className={`flex-1 rounded-xl border px-3 py-2 text-left ${attached === o.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
          >
            <span className={`block text-sm font-semibold ${attached === o.value ? "text-brand-700" : "text-slate-700"}`}>{o.label}</span>
            <span className="block text-[11px] text-slate-400">{o.example}</span>
          </button>
        ))}
      </div>
      <ThingChooser
        placeholder={`Search ${VOCAB.role.length} roles — nurse, student, secretary…`}
        things={(q) => searchThings(["role"], q, 300)}
        onThing={(t) => onAdd(roleClause(t, attached))}
        onText={(text) => onAdd({ emoji: "🧑", verb: attached ? "as" : "", object: text })}
      />
    </>
  );
}

function ThingChooser(props: {
  title?: string;
  placeholder: string;
  things: (query: string) => Thing[];
  showKind?: boolean;
  onBack?: () => void;
  onThing: (t: Thing) => void;
  onText: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const things = useMemo(() => props.things(query), [props, query]);
  const text = query.trim();
  const exact = things.some((t) => t.label.toLowerCase() === text.toLowerCase());
  return (
    <div>
      {(props.title || props.onBack) && (
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          {props.onBack && (
            <button type="button" onClick={props.onBack} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              <ArrowLeftIcon /> Back
            </button>
          )}
          <span className="font-medium">{props.title}</span>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text && things[0] && exact) props.onThing(things[0]);
          else if (text) props.onText(text);
        }}
      >
        <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500/30">
          <MagnifyingGlassIcon className="text-slate-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={props.placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
      </form>
      <ul className="thin-scroll mt-2 grid max-h-[50vh] grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-3">
        {text && !exact && (
          <li>
            <button type="button" onClick={() => props.onText(text)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              <span className="w-6 text-center">✍️</span> Use “{text}”
            </button>
          </li>
        )}
        {things.map((t) => (
          <li key={`${t.kind}:${t.id}`}>
            <button type="button" onClick={() => props.onThing(t)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              <span className="w-6 text-center">{t.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
              {props.showKind && <span className="text-[10px] uppercase tracking-wide text-slate-400">{KINDS[t.kind].label}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
