// Series: every series on one timeline (bars show how they overlap), and a
// page per series with its posts part by part along a timeline, read oldest or
// latest first, with a side rail of the parts. Parts go by date unless put in
// order by hand (rough dates: "diary entry 1, 2").
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowsDownUpIcon,
  ArrowUpIcon,
  BooksIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusCircleIcon,
  ClockCounterClockwiseIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api, errorMessage, type Post, type SeriesSummary } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { excerpt } from "../lib/mentions";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { SeriesDialog, seriesSwatch } from "../components/SeriesParts";
import { Page } from "../components/Shell";
import { Button, ConfirmDialog, EmptyState, ErrorText, inputClass, Modal } from "../components/ui";

const monthYear = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
const span = (s: SeriesSummary) => (s.from === null ? "No posts yet" : s.from === s.to || monthYear(s.from) === monthYear(s.to!) ? monthYear(s.from) : `${monthYear(s.from)} – ${monthYear(s.to!)}`);
const overlaps = (a: SeriesSummary, b: SeriesSummary) => a.from !== null && b.from !== null && a.from <= b.to! && b.from <= a.to!;

export function SeriesView({ id }: { id?: string }) {
  const { snapshot } = useJournal();
  const series = id ? snapshot.series.find((s) => s.id === id) : undefined;
  return id && series ? <SeriesPage series={series} /> : <SeriesList />;
}

function SeriesList() {
  const { snapshot, navigate } = useJournal();
  const [creating, setCreating] = useState(false);
  const dated = snapshot.series.filter((s) => s.from !== null);
  const start = Math.min(...dated.map((s) => s.from!));
  const end = Math.max(...dated.map((s) => s.to!));
  const range = Math.max(end - start, 1);
  const years = useMemo(() => {
    if (dated.length === 0) return [];
    const out: number[] = [];
    for (let y = new Date(start).getFullYear(); y <= new Date(end).getFullYear(); y++) out.push(y);
    return out;
  }, [dated.length, start, end]);
  const at = (t: number) => ((t - start) / range) * 100;

  return (
    <Page
      wide
      title={
        <span className="flex items-center gap-2">
          <BooksIcon className="text-brand-500" /> Series
        </span>
      }
      actions={
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> New series
        </Button>
      }
    >
      {snapshot.series.length === 0 ? (
        <EmptyState icon={<BooksIcon />} title="No series yet">
          Group posts, articles and albums into a series — a trip, a project, a year. A post can be in several, so series can overlap. Start one here or from the composer.
        </EmptyState>
      ) : (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 font-bold text-slate-800">Timeline</h2>
          <p className="mb-4 text-sm text-slate-500">Each bar runs from a series' first post to its last; bars that line up overlap in time.</p>
          {years.length > 0 && (
            <div className="relative mb-2 ml-56 h-5 text-[11px] text-slate-400">
              {years.map((y) => {
                const x = at(new Date(y, 0, 1).getTime());
                return x >= 0 && x <= 100 ? (
                  <span key={y} className="absolute -translate-x-1/2" style={{ left: `${x}%` }}>
                    {y}
                  </span>
                ) : null;
              })}
            </div>
          )}
          <ul className="space-y-2">
            {snapshot.series.map((s) => {
              const others = snapshot.series.filter((o) => o.id !== s.id && overlaps(s, o)).length;
              return (
                <li key={s.id} className="flex items-center gap-4">
                  <button onClick={() => navigate({ view: "series", id: s.id })} className="w-52 shrink-0 text-left">
                    <span className="block truncate text-sm font-semibold text-slate-800 hover:underline">{s.title}</span>
                    <span className="block text-xs text-slate-400">
                      {s.postIds.length} part{s.postIds.length === 1 ? "" : "s"} · {span(s)}
                      {others > 0 && ` · overlaps ${others}`}
                    </span>
                  </button>
                  <div className="relative h-7 flex-1 rounded-full bg-slate-50">
                    {years.map((y) => {
                      const x = at(new Date(y, 0, 1).getTime());
                      return x > 0 && x < 100 ? <span key={y} className="absolute inset-y-0 w-px bg-slate-200" style={{ left: `${x}%` }} /> : null;
                    })}
                    {s.from !== null && (
                      <button
                        onClick={() => navigate({ view: "series", id: s.id })}
                        title={`${s.title} · ${span(s)}`}
                        className={`absolute top-1 h-5 min-w-[1.25rem] rounded-full opacity-90 hover:opacity-100 ${seriesSwatch(s)}`}
                        style={{ left: `${Math.min(at(s.from), 98)}%`, width: `${at(s.to!) - at(s.from)}%` }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {creating && <SeriesDialog onClose={() => setCreating(false)} onSaved={(id) => navigate({ view: "series", id })} />}
    </Page>
  );
}

const dayMonth = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const year = (t: number) => new Date(t).getFullYear();

/** "3 weeks later", "2 days earlier", "Same day": the step from one part to the next. */
function between(from: number, to: number): string {
  const days = Math.round(Math.abs(to - from) / 86_400_000);
  if (days === 0) return "Same day";
  const [n, unit] = days < 14 ? [days, "day"] : days < 60 ? [Math.round(days / 7), "week"] : days < 730 ? [Math.round(days / 30.44), "month"] : [Math.round(days / 365.25), "year"];
  return `${n} ${unit}${n === 1 ? "" : "s"} ${to >= from ? "later" : "earlier"}`;
}

/** A line naming a part in the rail: its title, text, or what it holds. */
function partLabel(post: Post, profiles: Parameters<typeof excerpt>[1]): string {
  if (post.title) return post.title;
  const text = excerpt(post.content, profiles, 80);
  if (text) return text;
  const n = post.media.length;
  return n ? `${n} ${n === 1 ? "photo" : "photos"}` : "Post";
}

function SeriesPage({ series }: { series: SeriesSummary }) {
  const { snapshot, profiles, navigate, refresh } = useJournal();
  const { posts } = usePosts({ seriesId: series.id });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [adding, setAdding] = useState<"new" | "existing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Saved choices, shown at once while they save.
  const [newestFirst, setNewestFirst] = useState(!!series.newestFirst);
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => (setNewestFirst(!!series.newestFirst), setOrder(null)), [series]);
  const handOrdered = (series.partOrder?.length ?? 0) > 0;

  // Part order (part 1 first): by date, or by hand.
  const partIds = order ?? series.postIds;
  const parts = useMemo(() => {
    const byId = new Map((posts ?? []).map((p) => [p.id, p]));
    return partIds.flatMap((id) => byId.get(id) ?? []);
  }, [posts, partIds]);
  // Reading order: the parts, or the parts backwards.
  const shown = newestFirst ? [...parts].reverse() : parts;
  const partNo = new Map(parts.map((p, i) => [p.id, i + 1]));
  const alongside = snapshot.series.filter((o) => o.id !== series.id && overlaps(series, o));

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
      setOrder(null);
      setNewestFirst(!!series.newestFirst);
    }
  };

  const readOrder = (latest: boolean) => {
    setNewestFirst(latest);
    void run(() => api.saveSeries({ id: series.id, title: series.title, description: series.description, color: series.color, newestFirst: latest }));
  };

  /** Moves a part one place up or down the page (in reading order). */
  const move = (id: string, to: "up" | "down") => {
    const list = shown.map((p) => p.id);
    const from = list.indexOf(id);
    const at = to === "up" ? from - 1 : from + 1;
    if (from < 0 || at < 0 || at >= list.length) return;
    list.splice(from, 1);
    list.splice(at, 0, id);
    const next = newestFirst ? list.reverse() : list;
    setOrder(next);
    void run(() => api.setSeriesOrder(series.id, next));
  };

  const removePart = (id: string) => void run(() => api.setInSeries(id, series.id, false));

  const resetOrder = () => {
    setOrder(null);
    void run(() => api.setSeriesOrder(series.id, []));
  };

  const goTo = (id: string) => document.getElementById(`part-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const active = useActivePart(shown.map((p) => p.id));

  const segmented = (on: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
    </button>
  );

  return (
    <Page
      title={
        <button onClick={() => navigate({ view: "series" })} className="flex items-center gap-2 hover:text-brand-600">
          <ArrowLeftIcon /> Series
        </button>
      }
      rail={
        shown.length > 0 && (
          <SeriesRail series={series} shown={shown} partNo={partNo} active={active} arranging={arranging} onGo={goTo} onMove={move} profiles={profiles} />
        )
      }
    >
      <section className="mb-4 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className={`h-2 ${seriesSwatch(series)}`} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600">
                <BooksIcon /> Series · {series.postIds.length} part{series.postIds.length === 1 ? "" : "s"} · {span(series)}
              </div>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">{series.title}</h1>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <PencilSimpleIcon /> Edit
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                <TrashIcon /> Delete
              </Button>
            </div>
          </div>
          {series.description && <p className="mt-3 whitespace-pre-wrap text-slate-600">{series.description}</p>}
          {alongside.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              At the same time:
              {alongside.map((o) => (
                <button key={o.id} onClick={() => navigate({ view: "series", id: o.id })} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 hover:bg-slate-200">
                  <span className={`h-2 w-2 rounded-full ${seriesSwatch(o)}`} /> {o.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button onClick={() => setAdding("new")} title="Write an article, album or post as the next part">
            <PlusIcon /> New part
          </Button>
          <Button variant="ghost" onClick={() => setAdding("existing")} title="Add posts, articles or albums you've already written">
            <PlusCircleIcon /> Add existing
          </Button>
        </div>
        {parts.length > 1 && (
          <div className="flex items-center gap-1">
            {handOrdered && !arranging && <span className="mr-1 text-xs text-slate-400">In your order</span>}
            {arranging && handOrdered && (
              <Button variant="ghost" onClick={resetOrder} title="Order the parts by their dates again">
                <ClockCounterClockwiseIcon /> By date
              </Button>
            )}
            <Button variant={arranging ? "primary" : "ghost"} onClick={() => setArranging((a) => !a)}>
              {arranging ? (
                <>
                  <CheckIcon /> Done
                </>
              ) : (
                <>
                  <ArrowsDownUpIcon /> Reorder
                </>
              )}
            </Button>
          </div>
        )}
      </div>
      {parts.length > 1 && (
        <div className="mb-4 flex rounded-full bg-slate-100 p-0.5 w-fit" role="group" aria-label="Reading order">
          {segmented(!newestFirst, "Oldest first", () => readOrder(false))}
          {segmented(newestFirst, "Latest first", () => readOrder(true))}
        </div>
      )}
      {arranging && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Move parts up or down to put them in story order, for entries with rough dates. Parts added later go in by date. × takes a part out of the series (the post stays in your journal).
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}

      {shown.length === 0 ? (
        <EmptyState icon={<BooksIcon />} title="No parts yet">
          Write a <b>New part</b>, or <b>Add existing</b> posts, articles and albums. You can also add a post to a series from the composer (📚).
        </EmptyState>
      ) : (
        <ol>
          {shown.map((p, i) => {
            const prev = shown[i - 1];
            const newPeriod = !prev || monthYear(prev.occurredAt) !== monthYear(p.occurredAt);
            return (
              <li key={p.id}>
                {newPeriod && (
                  <div className="grid grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] gap-x-2">
                    <span />
                    <span className="relative flex justify-center">
                      <span className={`absolute inset-x-0 mx-auto w-0.5 bg-slate-200 ${i === 0 ? "top-1/2 bottom-0" : "inset-y-0"}`} />
                    </span>
                    <span className="py-2">
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {new Date(p.occurredAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                      </span>
                    </span>
                  </div>
                )}
                <div id={`part-${p.id}`} className="grid scroll-mt-4 grid-cols-[4.5rem_1.5rem_minmax(0,1fr)] gap-x-2">
                  <div className="pt-3 text-right">
                    <div className="text-sm font-semibold text-slate-700">{dayMonth(p.occurredAt)}</div>
                    <div className="text-[11px] text-slate-400">{year(p.occurredAt)}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Part {partNo.get(p.id)}</div>
                    {prev && <div className="mt-1 text-[11px] leading-tight text-slate-400">{between(prev.occurredAt, p.occurredAt)}</div>}
                    {arranging && (
                      <div className="mt-2 flex flex-col items-end gap-1">
                        <MoveButton title="Move up" disabled={i === 0} onClick={() => move(p.id, "up")}>
                          <ArrowUpIcon size={14} />
                        </MoveButton>
                        <MoveButton title="Move down" disabled={i === shown.length - 1} onClick={() => move(p.id, "down")}>
                          <ArrowDownIcon size={14} />
                        </MoveButton>
                        <MoveButton title="Take out of the series" onClick={() => removePart(p.id)}>
                          <XIcon size={14} />
                        </MoveButton>
                      </div>
                    )}
                  </div>
                  <div className="relative flex justify-center">
                    <span className={`absolute inset-x-0 mx-auto w-0.5 bg-slate-200 ${i === shown.length - 1 ? "top-0 h-5" : "inset-y-0"}`} />
                    <span className={`relative mt-4 h-3.5 w-3.5 rounded-full ring-4 ring-slate-50 ${seriesSwatch(series)} ${active === p.id ? "scale-125" : ""} transition-transform`} />
                  </div>
                  <div className="min-w-0 pb-6">
                    <PostCard post={p} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {adding === "new" && (
        <Composer defaultKind="article" defaultSeriesIds={[series.id]} onCancel={() => setAdding(null)} onDone={() => setAdding(null)} />
      )}
      {adding === "existing" && <AddPartsDialog series={series} onClose={() => setAdding(null)} />}
      {editing && <SeriesDialog series={series} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete series?"
          message={<>Delete <b>{series.title}</b>? Its {series.postIds.length} posts stay in your journal; they just won't be part of the series.</>}
          onConfirm={async () => {
            await api.deleteSeries(series.id);
            await refresh();
            navigate({ view: "series" });
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </Page>
  );
}

/** The part nearest the top of the page, as it scrolls. */
function useActivePart(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const root = document.getElementById("main-scroll");
    if (!root || ids.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.slice("part-".length);
          if (e.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      // A band across the upper part of the page.
      { root, rootMargin: "-15% 0px -60% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(`part-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return active;
}

/** The parts down the side: date, part and a line of each; click to go to it. */
function SeriesRail(props: {
  series: SeriesSummary;
  shown: Post[];
  partNo: Map<string, number>;
  active: string | null;
  arranging: boolean;
  onGo: (id: string) => void;
  onMove: (id: string, to: "up" | "down") => void;
  profiles: Parameters<typeof excerpt>[1];
}) {
  const { series, shown, active } = props;
  return (
    <div className="sticky top-0 rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className={`h-2.5 w-2.5 rounded-full ${seriesSwatch(series)}`} /> Timeline
      </h2>
      <ol className="relative">
        <span className="absolute bottom-2 left-[5px] top-2 w-0.5 bg-slate-200" />
        {shown.map((p, i) => (
          <li key={p.id} className="group relative flex items-start gap-3">
            <span
              className={`relative mt-2 h-3 w-3 shrink-0 rounded-full ring-2 ring-white ${active === p.id ? seriesSwatch(series) : "bg-slate-300"}`}
            />
            <button
              onClick={() => props.onGo(p.id)}
              className={`min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-slate-50 ${active === p.id ? "bg-slate-50" : ""}`}
            >
              <span className="block text-[11px] text-slate-400">
                Part {props.partNo.get(p.id)} · {dayMonth(p.occurredAt)} {year(p.occurredAt)}
              </span>
              <span className={`block truncate text-sm ${active === p.id ? "font-semibold text-slate-800" : "text-slate-600"}`}>{partLabel(p, props.profiles)}</span>
            </button>
            {props.arranging && (
              <span className="flex shrink-0 flex-col gap-0.5 pt-1">
                <MoveButton title="Move up" disabled={i === 0} onClick={() => props.onMove(p.id, "up")}>
                  <ArrowUpIcon size={12} />
                </MoveButton>
                <MoveButton title="Move down" disabled={i === shown.length - 1} onClick={() => props.onMove(p.id, "down")}>
                  <ArrowDownIcon size={12} />
                </MoveButton>
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function MoveButton(props: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}

const KIND_NAMES: Record<Post["kind"], string> = { status: "Post", article: "Article", album: "Album", milestone: "Life event" };

/** Pick posts, articles and albums already written to add to a series. */
function AddPartsDialog({ series, onClose }: { series: SeriesSummary; onClose: () => void }) {
  const { profiles, refresh } = useJournal();
  const { posts } = usePosts({});
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Post["kind"] | "all">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const candidates = (posts ?? [])
    .filter((p) => !series.postIds.includes(p.id))
    .filter((p) => kind === "all" || p.kind === kind || (kind === "status" && p.kind === "milestone"))
    .filter((p) => !q || `${p.title} ${excerpt(p.content, profiles, 400)}`.toLowerCase().includes(q))
    .slice(0, 200);
  const toggle = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const id of picked) await api.setInSeries(id, series.id, true);
      await refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Add to ${series.title}`} onClose={onClose} wide>
      <div className="flex min-h-0 flex-col gap-3 p-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your posts, articles and albums" className={`${inputClass} pl-9`} />
        </div>
        <div className="flex gap-1">
          {(["all", "article", "album", "status"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === k ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {k === "all" ? "All" : `${KIND_NAMES[k]}s`}
            </button>
          ))}
        </div>
        <ul className="thin-scroll -mx-1 max-h-[50vh] overflow-y-auto">
          {posts === null ? (
            <li className="px-2 py-3 text-sm text-slate-400">Loading…</li>
          ) : candidates.length === 0 ? (
            <li className="px-2 py-3 text-sm text-slate-400">{q || kind !== "all" ? "No matches." : "Everything is already in this series."}</li>
          ) : (
            candidates.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800">{partLabel(p, profiles)}</span>
                    <span className="block text-xs text-slate-400">
                      {KIND_NAMES[p.kind]} · {dayMonth(p.occurredAt)} {year(p.occurredAt)}
                    </span>
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">They go in by date{series.partOrder?.length ? ", among the parts you've ordered" : ""}.</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy || picked.length === 0}>
              Add {picked.length || ""} {picked.length === 1 ? "part" : "parts"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
