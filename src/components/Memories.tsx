// Facebook's Memories ("On this day") and the birthday/anniversary reminders on Home.
import { useMemo, useState } from "react";
import { CaretDownIcon, ClockCounterClockwiseIcon, GiftIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { inDays, nextOccurrence, ordinal, sameDayInEarlierYears } from "../lib/dates";
import { PostCard } from "./PostCard";
import { Avatar } from "./ui";

/** Posts from this day in earlier years, newest year first. */
export function OnThisDay() {
  const { snapshot } = useJournal();
  const years = useMemo(() => sameDayInEarlierYears(snapshot.postDates), [snapshot.postDates]);
  const [all, setAll] = useState(false);
  if (years.length === 0) return null;
  const shown = all ? years : years.slice(0, 1);
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long" });

  return (
    <section className="rounded-lg bg-white shadow-sm">
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <ClockCounterClockwiseIcon size={22} weight="bold" />
        </span>
        <div>
          <h2 className="text-[17px] font-bold text-slate-800">Memories</h2>
          <p className="text-[13px] text-slate-500">On this day, {today}</p>
        </div>
      </header>
      <div className="space-y-4 bg-slate-50 px-3 py-3">
        {shown.map((y) => (
          <MemoryYear key={y.year} {...y} />
        ))}
      </div>
      {years.length > 1 && (
        <button
          onClick={() => setAll((a) => !a)}
          className="flex w-full items-center justify-center gap-1.5 rounded-b-lg py-2.5 text-[15px] font-semibold text-slate-500 hover:bg-slate-50"
        >
          <CaretDownIcon className={all ? "rotate-180" : ""} />
          {all ? "Show fewer" : `See ${years.length - 1} more ${years.length === 2 ? "year" : "years"}`}
        </button>
      )}
    </section>
  );
}

function MemoryYear({ year, from, to }: { year: number; from: number; to: number }) {
  const { posts } = usePosts({ from, to });
  const ago = new Date().getFullYear() - year;
  return (
    <div>
      <h3 className="mb-2 px-1 text-[15px] font-semibold text-slate-800">
        {ago} {ago === 1 ? "year" : "years"} ago <span className="font-normal text-slate-500">· {year}</span>
      </h3>
      <div className="space-y-3">{posts?.map((p) => <PostCard key={p.id} post={p} />)}</div>
    </div>
  );
}

interface Celebration {
  profile: Profile;
  what: "birthday" | "anniversary";
  daysAway: number;
  date: Date;
  years?: number;
}

/** Birthdays and anniversaries in the next two weeks. */
export function useCelebrations(withinDays = 14): Celebration[] {
  const { snapshot } = useJournal();
  return useMemo(() => {
    const out: Celebration[] = [];
    for (const profile of snapshot.profiles) {
      for (const what of ["birthday", "anniversary"] as const) {
        const next = profile[what] ? nextOccurrence(profile[what]) : null;
        if (next && next.daysAway <= withinDays) out.push({ profile, what, ...next });
      }
    }
    return out.sort((a, b) => a.daysAway - b.daysAway || a.profile.name.localeCompare(b.profile.name));
  }, [snapshot.profiles, withinDays]);
}

function describe(c: Celebration): string {
  const me = c.profile.kind === "me";
  const whose = me ? "Your" : `${c.profile.name}'s`;
  const when = inDays(c.daysAway, c.date);
  if (c.what === "birthday") {
    if (c.years) return me ? `You turn ${c.years} ${when}` : `${c.profile.name} turns ${c.years} ${when}`;
    return `${whose} birthday is ${when}`;
  }
  const person = me || c.profile.kind === "person";
  const label = person ? "anniversary" : c.profile.kind === "place" ? "anniversary" : "founding anniversary";
  return c.years ? `${whose} ${ordinal(c.years)} ${label} is ${when}` : `${whose} ${label} is ${when}`;
}

/** The right column's "Birthdays" box, as on Facebook. */
export function Celebrations() {
  const { navigate } = useJournal();
  const list = useCelebrations();
  if (list.length === 0) return null;
  return (
    <section className="mb-6">
      <h3 className="mb-2 px-2 text-[17px] font-semibold text-slate-500">Celebrations</h3>
      {list.map((c) => (
        <button
          key={`${c.profile.id}-${c.what}`}
          onClick={() => navigate({ view: "profile", id: c.profile.id })}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
        >
          {c.daysAway === 0 ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[26px]">{c.what === "birthday" ? "🎂" : "🎉"}</span>
          ) : (
            <span className="relative shrink-0">
              <Avatar profile={c.profile} size="sm" />
              <GiftIcon size={14} weight="fill" className="absolute -right-1 -bottom-1 rounded-full bg-white p-px text-rose-500" />
            </span>
          )}
          <span className={`text-[15px] ${c.daysAway === 0 ? "font-semibold text-slate-800" : "text-slate-700"}`}>{describe(c)}.</span>
        </button>
      ))}
    </section>
  );
}
