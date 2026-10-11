import { useMemo, useState } from "react";
import { LockKeyOpenIcon, MagnifyingGlassIcon, NotebookIcon, XIcon } from "@phosphor-icons/react";
import { useJournal, usePosts } from "../lib/journal";
import { KINDS, MONTHS, periodRange } from "../lib/format";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { Page } from "../components/Shell";
import { EmptyState, ErrorText } from "../components/ui";

type Period = { year: number; month?: number };

export function TimelineView() {
  const { snapshot, profiles } = useJournal();
  const [profileId, setProfileId] = useState<string>();
  const [period, setPeriod] = useState<Period>();
  const [search, setSearch] = useState("");

  const { posts, error } = usePosts({
    profileId,
    ...(period ? periodRange(period.year, period.month) : {}),
    search: search.trim() || undefined,
  });

  const filtered = !!(profileId || period || search.trim());
  const filterProfile = profileId ? profiles.get(profileId) : undefined;

  return (
    <Page
      title={
        <>
          <LockKeyOpenIcon className="text-brand-500" /> Decrypted Timeline
        </>
      }
      actions={
        <div className="relative hidden sm:block">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts"
            className="w-48 rounded-full bg-slate-100 py-1.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30 focus:outline-none lg:w-64"
          />
        </div>
      }
      rail={<TimelineRail period={period} onPeriod={setPeriod} profileId={profileId} onProfile={setProfileId} />}
    >
      <div className="space-y-6">
        <Composer defaultAuthorId={undefined} />

        {filtered && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Showing</span>
            {filterProfile && <Chip onClear={() => setProfileId(undefined)}>@{filterProfile.name}</Chip>}
            {period && (
              <Chip onClear={() => setPeriod(undefined)}>
                {period.month !== undefined ? `${MONTHS[period.month]} ` : ""}
                {period.year}
              </Chip>
            )}
            {search.trim() && <Chip onClear={() => setSearch("")}>“{search.trim()}”</Chip>}
            <span className="text-slate-400">· {posts?.length ?? "…"} posts</span>
          </div>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        {posts?.map((post) => <PostCard key={post.id} post={post} onTag={setSearch} />)}
        {posts?.length === 0 && (
          <EmptyState icon={<NotebookIcon />} title={filtered ? "No posts match" : "Your journal is empty"}>
            {filtered ? "Try clearing a filter." : "Write your first entry above. Mention people and places with @."}
          </EmptyState>
        )}
        {snapshot.postDates.length > 0 && posts && posts.length > 0 && (
          <p className="pb-4 text-center text-xs text-slate-400">That's everything{filtered ? " for this filter" : ""}.</p>
        )}
      </div>
    </Page>
  );
}

function Chip(props: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-3 pr-1 font-medium text-brand-700">
      {props.children}
      <button onClick={props.onClear} className="rounded-full p-0.5 hover:bg-brand-100" aria-label="Clear filter">
        <XIcon size={12} />
      </button>
    </span>
  );
}

function TimelineRail(props: {
  period?: Period;
  onPeriod: (p?: Period) => void;
  profileId?: string;
  onProfile: (id?: string) => void;
}) {
  const { snapshot } = useJournal();

  // year -> month -> count, in local time.
  const years = useMemo(() => {
    const byYear = new Map<number, number[]>();
    for (const ms of snapshot.postDates) {
      const d = new Date(ms);
      const months = byYear.get(d.getFullYear()) ?? Array(12).fill(0);
      months[d.getMonth()]++;
      byYear.set(d.getFullYear(), months);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [snapshot.postDates]);

  const expandedYear = props.period?.year ?? years[0]?.[0];
  const entities = useMemo(
    () =>
      snapshot.profiles
        .filter((p) => p.kind !== "me")
        .map((p) => ({ p, count: snapshot.stats[p.id]?.mentions ?? 0 }))
        .filter((e) => e.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    [snapshot],
  );

  return (
    <>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Timeline Scrubber</h3>
      <div className="mb-8 space-y-1">
        {years.length === 0 && <p className="text-sm text-slate-400">No entries yet.</p>}
        {years.map(([year, months]) => {
          const total = months.reduce((a, b) => a + b, 0);
          const yearActive = props.period?.year === year && props.period.month === undefined;
          return (
            <div key={year}>
              <button
                onClick={() => props.onPeriod(yearActive ? undefined : { year })}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  yearActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {year}
                <span className={`rounded-full px-2 py-0.5 text-xs ${yearActive ? "bg-brand-100" : "bg-slate-100 text-slate-500"}`}>{total}</span>
              </button>
              {year === expandedYear && (
                <div className="my-1 ml-3 space-y-0.5 border-l-2 border-slate-100 pl-4">
                  {months
                    .map((count, month) => ({ count, month }))
                    .filter((m) => m.count > 0)
                    .reverse()
                    .map(({ count, month }) => {
                      const active = props.period?.year === year && props.period.month === month;
                      return (
                        <button
                          key={month}
                          onClick={() => props.onPeriod(active ? undefined : { year, month })}
                          className={`flex w-full justify-between rounded-lg px-3 py-1.5 text-left text-sm ${
                            active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {MONTHS[month]} <span className="text-xs text-slate-400">{count}</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Active Entities</h3>
      <div className="flex flex-wrap gap-2">
        {entities.length === 0 && <p className="text-sm text-slate-400">Mention someone with @ to see them here.</p>}
        {entities.map(({ p, count }) => {
          const Icon = KINDS[p.kind].icon;
          const active = props.profileId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => props.onProfile(active ? undefined : p.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
                active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-600"
              }`}
            >
              <Icon /> {p.name}
              <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto border-t border-slate-100 pt-6">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Memory Cache</span>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Unlocked
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {snapshot.postDates.length} posts and {snapshot.profiles.length} profiles decrypted in memory only. Wiped when you lock.
          </p>
        </div>
      </div>
    </>
  );
}
