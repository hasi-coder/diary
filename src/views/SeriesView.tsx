// Series: every series on one timeline (bars show how they overlap), and a
// page per series with its posts in order, part by part.
import { useMemo, useState } from "react";
import { ArrowLeftIcon, BooksIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type SeriesSummary } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { PostCard } from "../components/PostCard";
import { SeriesDialog, seriesSwatch } from "../components/SeriesParts";
import { Page } from "../components/Shell";
import { Button, ConfirmDialog, EmptyState } from "../components/ui";

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
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

function SeriesPage({ series }: { series: SeriesSummary }) {
  const { snapshot, navigate, refresh } = useJournal();
  const { posts } = usePosts({ seriesId: series.id });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Part order: by date, oldest first.
  const parts = useMemo(() => [...(posts ?? [])].sort((a, b) => series.postIds.indexOf(a.id) - series.postIds.indexOf(b.id)), [posts, series.postIds]);
  const alongside = snapshot.series.filter((o) => o.id !== series.id && overlaps(series, o));

  return (
    <Page
      title={
        <button onClick={() => navigate({ view: "series" })} className="flex items-center gap-2 hover:text-brand-600">
          <ArrowLeftIcon /> Series
        </button>
      }
    >
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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

      {parts.length === 0 ? (
        <EmptyState icon={<BooksIcon />} title="No parts yet">
          Add posts, articles or albums to this series from the composer (📚).
        </EmptyState>
      ) : (
        <ol className="space-y-6">
          {parts.map((p, i) => (
            <li key={p.id}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Part {i + 1}</div>
              <PostCard post={p} />
            </li>
          ))}
        </ol>
      )}
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
