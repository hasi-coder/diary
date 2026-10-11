import {
  FlagIcon,
  MapPinIcon,
  StorefrontIcon,
  UserCircleIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { ItemStatus, Profile, ProfileKind } from "./api";

export const KINDS: Record<ProfileKind, { label: string; plural: string; icon: Icon }> = {
  me: { label: "Journal owner", plural: "You", icon: UserCircleIcon },
  person: { label: "Person", plural: "People", icon: UserIcon },
  page: { label: "Page", plural: "Pages", icon: FlagIcon },
  shop: { label: "Shop", plural: "Shops", icon: StorefrontIcon },
  place: { label: "Place", plural: "Places", icon: MapPinIcon },
};

// Full class strings so Tailwind can see them at build time.
export const COLORS: Record<string, { avatar: string; cover: string; swatch: string }> = {
  teal: { avatar: "bg-teal-100 text-teal-700", cover: "from-teal-300 via-teal-200 to-emerald-100", swatch: "bg-teal-400" },
  pink: { avatar: "bg-pink-100 text-pink-700", cover: "from-pink-300 via-pink-200 to-rose-100", swatch: "bg-pink-400" },
  amber: { avatar: "bg-amber-100 text-amber-700", cover: "from-amber-300 via-amber-200 to-yellow-100", swatch: "bg-amber-400" },
  sky: { avatar: "bg-sky-100 text-sky-700", cover: "from-sky-300 via-sky-200 to-cyan-100", swatch: "bg-sky-400" },
  violet: { avatar: "bg-violet-100 text-violet-700", cover: "from-violet-300 via-violet-200 to-fuchsia-100", swatch: "bg-violet-400" },
  indigo: { avatar: "bg-indigo-100 text-indigo-700", cover: "from-indigo-300 via-indigo-200 to-blue-100", swatch: "bg-indigo-400" },
  emerald: { avatar: "bg-emerald-100 text-emerald-700", cover: "from-emerald-300 via-emerald-200 to-lime-100", swatch: "bg-emerald-400" },
  orange: { avatar: "bg-orange-100 text-orange-700", cover: "from-orange-300 via-orange-200 to-amber-100", swatch: "bg-orange-400" },
  slate: { avatar: "bg-slate-200 text-slate-700", cover: "from-slate-300 via-slate-200 to-slate-100", swatch: "bg-slate-400" },
};

export const colorOf = (p: Pick<Profile, "color"> | undefined) => COLORS[p?.color ?? ""] ?? COLORS.slate;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** A short descriptor for a profile, e.g. "Sister" or "Coffee shop". */
export function subtitle(p: Profile): string {
  if (p.kind === "person" && p.relationship) return p.relationship;
  if (p.kind !== "person" && p.kind !== "me" && p.category) return p.category;
  return KINDS[p.kind].label;
}

export const canSell = (p: Profile) => p.kind === "shop" || (p.kind === "page" && p.hasShop);

export function formatPostDate(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} • ${time}`;
}

export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): number | undefined {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" }),
);

/** [from, to) in local time for a year, or a month of that year (0-based). */
export function periodRange(year: number, month?: number): { from: number; to: number } {
  return month === undefined
    ? { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() }
    : { from: new Date(year, month, 1).getTime(), to: new Date(year, month + 1, 1).getTime() };
}

export function formatPrice(cents: number | null, currency: string): string {
  if (cents === null) return "Price on request";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export const STATUS: Record<ItemStatus, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  reserved: { label: "Reserved", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  sold: { label: "Sold", className: "bg-slate-100 text-slate-500 ring-slate-200" },
};
