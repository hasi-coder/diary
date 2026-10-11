// The life-event catalog as a searchable browser, by category, sub-group, life
// stage and tone. Picking one adds it to a post's story (StoryPicker).
import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { KINDS, VOCAB } from "../lib/vocab";
import {
  CATEGORIES,
  CATEGORY_COUNTS,
  categoryOf,
  displayLabel,
  groupsOf,
  LIFE_EVENT_COUNT,
  searchLifeEvents,
  STAGES,
  TONES,
  type LifeEventTemplate,
  type Stage,
  type Tone,
} from "../lib/lifeEvents";

const RESULT_LIMIT = 200;

export function LifeEventBrowser({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  // Sub-group within the category; for "Roles & careers" this is the chosen role.
  const [group, setGroup] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const chooseCategory = (id: string | null) => (setCategory(id), setGroup(null));

  const results = useMemo(
    () =>
      query.trim() || category || stage || tone
        ? searchLifeEvents(query, { category: category ?? undefined, group: group ?? undefined, stage: stage ?? undefined, tone: tone ?? undefined })
        : [],
    [query, category, group, stage, tone],
  );
  // Shared work/school moments show inside each role, not as a role of their own.
  const groups = useMemo(() => (category ? groupsOf(category).filter((g) => !g.shared) : []), [category]);
  const browsing = !query.trim() && !category && !stage && !tone;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="border-b border-slate-100 p-3">
        <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500/30">
          <MagnifyingGlassIcon className="text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${LIFE_EVENT_COUNT.toLocaleString()} life events — "first steps", "graduated", "Japan", "HRT"…`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1">
          <StageChip active={!stage} onClick={() => setStage(null)}>
            All ages
          </StageChip>
          {STAGES.map((s) => (
            <StageChip key={s.id} active={stage === s.id} onClick={() => setStage(stage === s.id ? null : s.id)}>
              {s.label} <span className="opacity-60">{s.ages}</span>
            </StageChip>
          ))}
          <span className="mx-1 w-px self-stretch bg-slate-200" />
          {TONES.map((t) => (
            <StageChip key={t.id} active={tone === t.id} onClick={() => setTone(tone === t.id ? null : t.id)}>
              {t.label}
            </StageChip>
          ))}
        </div>
      </div>

      <div className="flex h-[min(62vh,40rem)]">
        <nav className="thin-scroll w-60 shrink-0 overflow-y-auto border-r border-slate-100 py-1">
          <CategoryButton active={!category} onClick={() => chooseCategory(null)} emoji="✨" label="All categories" count={LIFE_EVENT_COUNT} />
          {CATEGORIES.map((c) => (
            <CategoryButton
              key={c.id}
              active={category === c.id}
              onClick={() => chooseCategory(c.id)}
              emoji={c.emoji}
              label={c.label}
              count={CATEGORY_COUNTS.get(c.id) ?? 0}
            />
          ))}
        </nav>
        <div className="thin-scroll min-w-0 flex-1 overflow-y-auto p-3">
          {browsing ? (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => chooseCategory(c.id)}
                  className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-sm font-semibold text-slate-800">{c.label}</span>
                  <span className="text-xs text-slate-400">{CATEGORY_COUNTS.get(c.id)} events</span>
                </button>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              Nothing matches.{" "}
              <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => onPick(category ?? "other")}>
                Add a custom life event
              </button>
            </div>
          ) : (
            <>
              {category && groups.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  <StageChip active={!group} onClick={() => setGroup(null)}>
                    All
                  </StageChip>
                  {groups.map((g) => (
                    <StageChip key={g.name} active={group === g.name} onClick={() => setGroup(group === g.name ? null : g.name)}>
                      {g.emoji} {g.name}
                    </StageChip>
                  ))}
                </div>
              )}
              <ResultList results={results} grouped={!query.trim()} onPick={onPick} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultList({ results, grouped, onPick }: { results: LifeEventTemplate[]; grouped: boolean; onPick: (id: string) => void }) {
  const shown = results.slice(0, RESULT_LIMIT);
  const sections = useMemo(() => {
    if (!grouped) return [{ title: "", items: shown }];
    const map = new Map<string, LifeEventTemplate[]>();
    for (const t of shown) {
      const tone = TONES.find((x) => x.id === t.tone);
      const key = `${categoryOf(t.category).label} › ${t.group}${tone ? ` · ${tone.label}` : ""}`;
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return [...map].map(([title, items]) => ({ title, items }));
  }, [shown, grouped]);

  return (
    <>
      {sections.map((s) => (
        <section key={s.title} className="mb-3">
          {s.title && <h4 className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.title}</h4>}
          <div className="grid grid-cols-1 gap-0.5 lg:grid-cols-2">
            {s.items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onPick(t.id)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="w-7 shrink-0 text-center text-xl">{t.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-800">{displayLabel(t)}</span>
                  {t.vocab && !t.bound && (
                    <span className="block truncate text-[11px] text-brand-600">
                      any of {VOCAB[t.vocab].length} {KINDS[t.vocab].plural}
                    </span>
                  )}
                  {!grouped && (
                    <span className="block truncate text-[11px] text-slate-400">
                      {categoryOf(t.category).label} · {t.group}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {results.length > RESULT_LIMIT && (
        <p className="py-2 text-center text-xs text-slate-400">
          Showing {RESULT_LIMIT} of {results.length.toLocaleString()} — type to narrow down.
        </p>
      )}
    </>
  );
}

function StageChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        props.active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {props.children}
    </button>
  );
}

function CategoryButton(props: { active: boolean; onClick: () => void; emoji: string; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
        props.active ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span className="w-5 text-center">{props.emoji}</span>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <span className="text-[11px] text-slate-400">{props.count}</span>
    </button>
  );
}
