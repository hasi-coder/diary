// Series: badges on posts ("Japan trip · Part 2 of 5"), previous/next links, the
// composer's picker, and the create/edit dialog.
import { useState } from "react";
import { BooksIcon, CaretLeftIcon, CaretRightIcon, CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Post, type SeriesSummary } from "../lib/api";
import { useJournal } from "../lib/journal";
import { COLORS } from "../lib/format";
import { Button, ErrorText, Field, inputClass, Modal } from "./ui";

export const seriesSwatch = (s: Pick<SeriesSummary, "color">) => (COLORS[s.color as keyof typeof COLORS] ?? COLORS.teal).swatch;

/** "Part 2 of 5" — the post's place in a series, by date. */
export function partOf(series: SeriesSummary, postId: string) {
  const i = series.postIds.indexOf(postId);
  return i < 0 ? null : { part: i + 1, of: series.postIds.length, prev: series.postIds[i - 1], next: series.postIds[i + 1] };
}

export function SeriesBadges({ post }: { post: Pick<Post, "id" | "seriesIds"> }) {
  const { snapshot, navigate } = useJournal();
  const list = (post.seriesIds ?? []).map((id) => snapshot.series.find((s) => s.id === id)).filter((s): s is SeriesSummary => !!s);
  if (list.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {list.map((s) => {
        const p = partOf(s, post.id);
        return (
          <button
            key={s.id}
            onClick={() => navigate({ view: "series", id: s.id })}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-1.5 pr-2.5 text-xs text-slate-600 hover:bg-slate-200"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${seriesSwatch(s)}`} />
            <BooksIcon className="text-slate-400" />
            <span className="font-semibold text-slate-700">{s.title}</span>
            {p && <span className="text-slate-400">· Part {p.part} of {p.of}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Previous / next part links for each series a post is in. */
export function SeriesNav({ post }: { post: Pick<Post, "id" | "seriesIds"> }) {
  const { snapshot, navigate } = useJournal();
  const list = (post.seriesIds ?? []).map((id) => snapshot.series.find((s) => s.id === id)).filter((s): s is SeriesSummary => !!s);
  if (list.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {list.map((s) => {
        const p = partOf(s, post.id);
        if (!p) return null;
        const link = (id: string | undefined, label: string, icon: React.ReactNode, right?: boolean) => (
          <button
            disabled={!id}
            onClick={() => id && navigate({ view: "post", id })}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-30 ${right ? "flex-row-reverse" : ""}`}
          >
            {icon} {label}
          </button>
        );
        return (
          <div key={s.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className={`h-3 w-3 rounded-full ${seriesSwatch(s)}`} />
            <button onClick={() => navigate({ view: "series", id: s.id })} className="min-w-0 flex-1 truncate text-left text-sm">
              <span className="font-semibold text-slate-800 hover:underline">{s.title}</span>
              <span className="text-slate-400"> · Part {p.part} of {p.of}</span>
            </button>
            {link(p.prev, "Previous", <CaretLeftIcon />)}
            {link(p.next, "Next", <CaretRightIcon />, true)}
          </div>
        );
      })}
    </div>
  );
}

/** Pick the series a post belongs to, or start a new one by typing its name. */
export function SeriesPicker(props: { selected: string[]; onChange: (ids: string[]) => void; onClose: () => void }) {
  const { snapshot, refresh } = useJournal();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = snapshot.series.filter((s) => !q || s.title.toLowerCase().includes(q));
  const toggle = (id: string) => props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);
  const create = async () => {
    try {
      const colors = Object.keys(COLORS);
      const s = await api.saveSeries({ title: query.trim(), description: "", color: colors[snapshot.series.length % colors.length] });
      await refresh();
      props.onChange([...props.selected, s.id]);
      setQuery("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={props.onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-800">Part of a series</span>
          <button onClick={props.onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <XIcon size={16} />
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), q && !shown.some((s) => s.title.toLowerCase() === q) && void create())}
          placeholder="Find or start a series…"
          className="m-3 mb-1 w-[calc(100%-1.5rem)] rounded-full bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <ul className="thin-scroll max-h-64 overflow-y-auto py-1">
          {q && !shown.some((s) => s.title.toLowerCase() === q) && (
            <li>
              <button type="button" onClick={() => void create()} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-brand-700 hover:bg-slate-50">
                <PlusIcon /> Start “{query.trim()}”
              </button>
            </li>
          )}
          {shown.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => toggle(s.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                <span className={`h-3 w-3 shrink-0 rounded-full ${seriesSwatch(s)}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{s.title}</span>
                  <span className="block text-xs text-slate-400">
                    {s.postIds.length} part{s.postIds.length === 1 ? "" : "s"}
                  </span>
                </span>
                {props.selected.includes(s.id) && <CheckIcon size={18} className="text-brand-600" weight="bold" />}
              </button>
            </li>
          ))}
          {snapshot.series.length === 0 && !q && <li className="px-4 py-3 text-sm text-slate-400">No series yet. Type a name to start one.</li>}
        </ul>
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </>
  );
}

export function SeriesDialog({ series, onClose, onSaved }: { series?: SeriesSummary; onClose: () => void; onSaved?: (id: string) => void }) {
  const { refresh, snapshot } = useJournal();
  const colors = Object.keys(COLORS);
  const [title, setTitle] = useState(series?.title ?? "");
  const [description, setDescription] = useState(series?.description ?? "");
  const [color, setColor] = useState(series?.color || colors[snapshot.series.length % colors.length]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api.saveSeries({ id: series?.id, title, description, color });
      await refresh();
      onSaved?.(saved.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal title={series ? "Edit series" : "New series"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required placeholder="Japan trip, Wedding planning, Year one…" />
        </Field>
        <Field label="Description">
          <textarea className={`${inputClass} min-h-[80px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Colour">
          <div className="flex flex-wrap gap-2">
            {colors.map((key) => (
              <button
                type="button"
                key={key}
                title={key}
                onClick={() => setColor(key)}
                className={`h-7 w-7 rounded-full ${COLORS[key as keyof typeof COLORS].swatch} ${color === key ? "ring-2 ring-slate-800 ring-offset-2" : ""}`}
              />
            ))}
          </div>
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {series ? "Save" : "Create series"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
