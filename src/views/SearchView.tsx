import { useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useJournal } from "../lib/journal";
import { useResultRows, useSearch } from "../components/Search";
import { Page } from "../components/Shell";
import { EmptyState, ErrorText } from "../components/ui";

/** Full search results page. */
export function SearchView({ initial }: { initial: string }) {
  const { navigate } = useJournal();
  const [query, setQuery] = useState(initial);
  const { results, error } = useSearch(query, 200);
  const groups = useResultRows(results);

  return (
    <Page
      title={
        <>
          <MagnifyingGlassIcon className="text-brand-500" /> Search
        </>
      }
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search posts, people, pages, shops and items…"
        className="mb-6 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      />
      {error && <ErrorText>{error}</ErrorText>}
      {results && groups.length === 0 && (
        <EmptyState icon={<MagnifyingGlassIcon />} title="No matches">
          Every word has to match. Try fewer words or a shorter prefix.
        </EmptyState>
      )}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.group}</h2>
            <div className="divide-y divide-slate-100">
              {g.rows.map((row) => (
                <button key={row.key} onClick={() => navigate(row.route)} className="block w-full px-5 py-3 text-left hover:bg-slate-50">
                  {row.node}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
