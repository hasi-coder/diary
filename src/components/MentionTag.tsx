// An inline @mention with a profile hover card.
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useJournal } from "../lib/journal";
import { subtitle } from "../lib/format";
import { Avatar, CoverImage, KindBadge } from "./ui";
import type { Profile } from "../lib/api";

const CARD_WIDTH = 272;

export function MentionTag({ id }: { id: string }) {
  const { profiles, navigate } = useJournal();
  const profile = profiles.get(id);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const hideTimer = useRef<number>();

  if (!profile) {
    return <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-400 line-through">@deleted profile</span>;
  }

  const show = (el: HTMLElement) => {
    window.clearTimeout(hideTimer.current);
    setAnchor(el.getBoundingClientRect());
  };
  const hide = () => {
    hideTimer.current = window.setTimeout(() => setAnchor(null), 150);
  };

  return (
    <>
      <button
        type="button"
        className="entity-tag"
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onClick={() => navigate({ view: "profile", id })}
      >
        @{profile.name}
      </button>
      {anchor &&
        createPortal(
          <div onMouseEnter={() => window.clearTimeout(hideTimer.current)} onMouseLeave={hide}>
            <ProfileHoverCard profile={profile} anchor={anchor} />
          </div>,
          document.body,
        )}
    </>
  );
}

function ProfileHoverCard({ profile, anchor }: { profile: Profile; anchor: DOMRect }) {
  const { snapshot, navigate } = useJournal();
  const stats = snapshot.stats[profile.id] ?? { posts: 0, mentions: 0 };
  const items = snapshot.items.filter((i) => i.shopId === profile.id && i.status !== "sold").length;

  // Prefer below the tag; flip above if it would run off the bottom.
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - CARD_WIDTH / 2), window.innerWidth - CARD_WIDTH - 8);
  const below = anchor.bottom + 230 < window.innerHeight;
  const style = below ? { top: anchor.bottom + 8, left } : { bottom: window.innerHeight - anchor.top + 8, left };

  return (
    <div
      className="fixed z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      style={{ ...style, width: CARD_WIDTH }}
    >
      <CoverImage profile={profile} className="h-16" />
      <div className="relative px-4 pb-4">
        <div className="absolute -top-7 left-4 rounded-full bg-white p-0.5">
          <Avatar profile={profile} size="lg" />
        </div>
        <div className="pt-9">
          <button className="text-left font-bold leading-tight text-slate-800 hover:underline" onClick={() => navigate({ view: "profile", id: profile.id })}>
            {profile.name}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brand-600">
            <KindBadge profile={profile} />
            {subtitle(profile) !== "" && profile.kind !== "me" && <span className="font-medium">{subtitle(profile)}</span>}
          </div>
          {(profile.tagline || profile.bio) && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{profile.tagline || profile.bio}</p>}
          {profile.location && <p className="mt-1 text-xs text-slate-400">📍 {profile.location}</p>}
          <div className="mt-3 flex gap-5 border-t border-slate-100 pt-3">
            <Stat value={stats.mentions} label="Mentions" />
            <Stat value={stats.posts} label="Posts" />
            {items > 0 && <Stat value={items} label="For sale" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-semibold text-slate-800">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
