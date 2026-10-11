import { useState } from "react";
import { PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import type { ProfileKind } from "../lib/api";
import { useJournal } from "../lib/journal";
import { colorOf, KINDS, subtitle } from "../lib/format";
import { ProfileForm } from "../components/forms";
import { Page } from "../components/Shell";
import { Avatar, Button, EmptyState } from "../components/ui";

const FILTERS: (ProfileKind | "all")[] = ["all", "person", "page", "shop", "place"];

export function ProfilesView() {
  const { snapshot, navigate } = useJournal();
  const [filter, setFilter] = useState<ProfileKind | "all">("all");
  const [creating, setCreating] = useState(false);

  const shown = snapshot.profiles
    .filter((p) => filter === "all" || p.kind === filter)
    .sort((a, b) => Number(b.kind === "me") - Number(a.kind === "me"));

  return (
    <Page
      wide
      title={
        <>
          <UsersThreeIcon className="text-brand-500" /> Profiles & Entities
        </>
      }
      actions={
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> New profile
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f === "all" ? snapshot.profiles.length : snapshot.profiles.filter((p) => p.kind === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === f ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f === "all" ? "All" : KINDS[f].plural} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<UsersThreeIcon />} title={`No ${filter === "all" ? "profiles" : KINDS[filter].plural.toLowerCase()} yet`}>
          Create profiles for the people, pages, shops and places in your story.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const stats = snapshot.stats[p.id] ?? { posts: 0, mentions: 0 };
            return (
              <button
                key={p.id}
                onClick={() => navigate({ view: "profile", id: p.id })}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className={`h-16 bg-gradient-to-r ${colorOf(p).cover}`} />
                <div className="px-4 pb-4">
                  <div className="-mt-7 mb-2 inline-block rounded-full bg-white p-0.5">
                    <Avatar profile={p} size="lg" />
                  </div>
                  <div className="truncate font-bold text-slate-800">{p.name}</div>
                  <div className="text-xs font-medium text-brand-600">{p.kind === "me" ? "You · journal owner" : subtitle(p)}</div>
                  <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">{p.tagline || p.bio || " "}</p>
                  <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>
                      <b className="text-slate-800">{stats.mentions}</b> mentions
                    </span>
                    <span>
                      <b className="text-slate-800">{stats.posts}</b> posts
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && <ProfileForm initialKind={filter === "all" ? undefined : filter} onClose={() => setCreating(false)} />}
    </Page>
  );
}
