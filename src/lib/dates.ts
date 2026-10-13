// Birthdays and anniversaries: "YYYY-MM-DD", or "MM-DD" when the year isn't known.

export interface PartialDate {
  year?: number;
  /** 1–12 */
  month: number;
  day: number;
}

export function parsePartialDate(value: string): PartialDate | null {
  const parts = value.split("-").map(Number);
  if (!value || parts.some((n) => !Number.isInteger(n))) return null;
  if (parts.length === 3) return { year: parts[0], month: parts[1], day: parts[2] };
  if (parts.length === 2) return { month: parts[0], day: parts[1] };
  return null;
}

export function formatPartialDate(value: string): string {
  const p = parsePartialDate(value);
  if (!p) return "";
  const d = new Date(p.year ?? 2000, p.month - 1, p.day);
  return d.toLocaleDateString(undefined, p.year ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "long" });
}

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The date's occurrence in `year`; 29 February falls back to the 28th. */
function occurrenceIn(p: PartialDate, year: number): Date {
  const d = new Date(year, p.month - 1, p.day);
  if (d.getMonth() !== p.month - 1) d.setDate(0);
  return d;
}

/** The next time this date comes round (today counts), and how many years it will have been. */
export function nextOccurrence(value: string, today = new Date()): { date: Date; daysAway: number; years?: number } | null {
  const p = parsePartialDate(value);
  if (!p) return null;
  const start = startOfDay(today);
  let date = occurrenceIn(p, start.getFullYear());
  if (date < start) date = occurrenceIn(p, start.getFullYear() + 1);
  const daysAway = Math.round((date.getTime() - start.getTime()) / DAY);
  const years = p.year !== undefined ? date.getFullYear() - p.year : undefined;
  return { date, daysAway, years: years !== undefined && years > 0 ? years : undefined };
}

/** "today", "tomorrow", "on Friday", or the date further out. */
export function inDays(daysAway: number, date: Date): string {
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  if (daysAway < 7) return `on ${date.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `on ${date.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`;
}

/** Earlier years with posts on today's month and day, newest first, as local [from, to) ranges. */
export function sameDayInEarlierYears(postDates: number[], today = new Date()): { year: number; from: number; to: number }[] {
  const years = new Set<number>();
  for (const ms of postDates) {
    const d = new Date(ms);
    if (d.getFullYear() < today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) years.add(d.getFullYear());
  }
  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const from = new Date(year, today.getMonth(), today.getDate()).getTime();
      return { year, from, to: new Date(year, today.getMonth(), today.getDate() + 1).getTime() };
    });
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
