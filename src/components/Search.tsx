// Search UI: highlighted snippets, the ⌘K quick-search palette, and result rows.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { MagnifyingGlassIcon, NotebookIcon, ShoppingBagIcon } from "@phosphor-icons/react";
import { api, errorMessage, type SearchResults } from "../lib/api";
import { useJournal, type Route } from "../lib/journal";
import { formatPostDate, formatPrice, subtitle } from "../lib/format";
import { Avatar } from "./ui";

/** Same folding as the Rust index (search.rs): lower-case, Latin accents removed. */
export const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").normalize("NFC").toLowerCase();

const WORD = /[\p{L}\p{M}\p{N}_#]+/gu;

/** Wraps words that start with any search term in <mark>. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const word = fold(m[0]).replace(/^#/, "");
    if (!terms.some((t) => word.startsWith(t.replace(/^#/, "")))) continue;
    parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={m.index} className="rounded bg-amber-100 px-0.5 text-slate-900">
        {m[0]}
      </mark>,
    );
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

/** Debounced search against the backend index. */
export function useSearch(query: string, limit: number) {
  const { version } = useJournal();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .search(query, limit)
        .then((r) => !cancelled && (setResults(r), setError(null)))
        .catch((e) => !cancelled && setError(errorMessage(e)));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, limit, version]);
  return { results, error };
}

export interface ResultRow {
  key: string;
  route: Route;
  node: ReactNode;
}

/** Flattens results into navigable rows, grouped profiles → posts → items. */
export function useResultRows(results: SearchResults | null): { group: string; rows: ResultRow[] }[] {
  const { profiles, snapshot } = useJournal();
  return useMemo(() => {
    if (!results) return [];
    const itemsById = new Map(snapshot.items.map((i) => [i.id, i]));
    const t = results.terms;
    const groups: { group: string; rows: ResultRow[] }[] = [];
    const people = results.profiles.flatMap((hit) => {
      const p = profiles.get(hit.id);
      if (!p) return [];
      return [
        {
          key: `profile:${p.id}`,
          route: { view: "profile", id: p.id } as Route,
          node: (
            <div className="flex items-center gap-3">
              <Avatar profile={p} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  <Highlight text={p.name} terms={t} /> <span className="font-normal text-slate-400">· {subtitle(p)}</span>
                </div>
                {hit.snippet && hit.snippet !== subtitle(p) && (
                  <div className="truncate text-xs text-slate-500">
                    <Highlight text={hit.snippet} terms={t} />
                  </div>
                )}
              </div>
            </div>
          ),
        },
      ];
    });
    if (people.length) groups.push({ group: `Profiles · ${results.totals.profiles}`, rows: people });

    const posts = results.posts.map(({ post, snippet }) => {
      const author = profiles.get(post.authorId);
      return {
        key: `post:${post.id}`,
        route: { view: "post", id: post.id } as Route,
        node: (
          <div className="flex items-start gap-3">
            <Avatar profile={author} size="sm" />
            <div className="min-w-0">
              <div className="text-xs text-slate-400">
                <span className="font-medium text-slate-600">{author?.name ?? "Unknown"}</span> · {formatPostDate(post.occurredAt)}
                {post.media.length > 0 && ` · ${post.media.length} attachment${post.media.length > 1 ? "s" : ""}`}
              </div>
              <div className="line-clamp-2 text-sm text-slate-700">
                {snippet ? <Highlight text={snippet} terms={t} /> : <span className="text-slate-400">(no text)</span>}
              </div>
            </div>
          </div>
        ),
      };
    });
    if (posts.length) groups.push({ group: `Posts · ${results.totals.posts}`, rows: posts });

    const items = results.items.flatMap((hit) => {
      const item = itemsById.get(hit.id);
      if (!item) return [];
      const shop = profiles.get(item.shopId);
      return [
        {
          key: `item:${item.id}`,
          route: { view: "profile", id: item.shopId, tab: "shop" } as Route,
          node: (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <ShoppingBagIcon />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">
                  <Highlight text={item.name} terms={t} />{" "}
                  <span className="font-normal text-slate-400">
                    · {formatPrice(item.priceCents, item.currency)} at {shop?.name}
                  </span>
                </div>
                {hit.snippet && (
                  <div className="truncate text-xs text-slate-500">
                    <Highlight text={hit.snippet} terms={t} />
                  </div>
                )}
              </div>
            </div>
          ),
        },
      ];
    });
    if (items.length) groups.push({ group: `Shop items · ${results.totals.items}`, rows: items });
    return groups;
  }, [results, profiles, snapshot.items]);
}

/** ⌘K / Ctrl+K quick search. */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { navigate } = useJournal();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const { results, error } = useSearch(query, 6);
  const groups = useResultRows(results);
  const rows = groups.flatMap((g) => g.rows);
  const total = results ? results.totals.posts + results.totals.profiles + results.totals.items : 0;

  useEffect(() => setIndex(0), [results]);

  const open = (route: Route) => {
    onClose();
    navigate(route);
  };
  const showAll = () => open({ view: "search", query });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <MagnifyingGlassIcon size={20} className="text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = rows.length + (total > 0 ? 1 : 0);
                if (n) setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (index < rows.length) open(rows[index].route);
                else if (total > 0) showAll();
              }
            }}
            placeholder="Search posts, people, pages, shops and items…  (#tag works too)"
            className="h-14 flex-1 bg-transparent text-base text-slate-800 placeholder-slate-400 outline-none"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">esc</kbd>
        </div>

        <div className="thin-scroll max-h-[60vh] overflow-y-auto">
          {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
          {!query.trim() && (
            <p className="p-6 text-center text-sm text-slate-400">
              Searches the encrypted workspace in memory. Words match as prefixes; every word must match.
            </p>
          )}
          {results && total === 0 && <p className="p-6 text-center text-sm text-slate-400">No matches for “{query.trim()}”.</p>}
          {(() => {
            let i = -1;
            return groups.map((g) => (
              <div key={g.group} className="py-1">
                <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>
                {g.rows.map((row) => {
                  i += 1;
                  const mine = i;
                  return (
                    <button
                      key={row.key}
                      onMouseEnter={() => setIndex(mine)}
                      onClick={() => open(row.route)}
                      className={`block w-full px-4 py-2 text-left ${index === mine ? "bg-brand-50" : ""}`}
                    >
                      {row.node}
                    </button>
                  );
                })}
              </div>
            ));
          })()}
          {total > 0 && (
            <button
              onMouseEnter={() => setIndex(rows.length)}
              onClick={showAll}
              className={`flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-brand-700 ${
                index === rows.length ? "bg-brand-50" : ""
              }`}
            >
              <NotebookIcon /> Show all {total} results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
