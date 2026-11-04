// A place's "Place" tab: its picture, Enter, who lives or works here, and the
// posts checked in here, each of which can open the place with its people.
import { useMemo, useState } from "react";
import { BuildingsIcon, PencilSimpleIcon, PlayIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { formatPostDate } from "../lib/format";
import { parseLayout } from "../lib/places/layout";
import { cityOf, peopleAt, ROLE_LABELS, type PlaceRole } from "../lib/places/people";
import { LayoutEditor } from "./LayoutEditor";
import { FaceImage } from "./world/FaceImage";
import { placePicture } from "./world/thumbnail";
import { Button, EmptyState } from "./ui";

export function PlaceTab({ profile }: { profile: Profile }) {
  const { snapshot, profiles, navigate } = useJournal();
  const [editing, setEditing] = useState(false);
  const floor = parseLayout(profile.layout)?.floors[0];
  const people = peopleAt(profile.id, snapshot.profiles);
  const city = cityOf(profile.id, snapshot.profiles);
  const residents = people.filter((p) => p.role === "home" || p.role === "work");
  const picture = useMemo(() => {
    if (!floor) return null;
    // The same spots the world puts them in.
    const used = { home: 0, work: 0 };
    return placePicture(floor, 960, 600, residents.map((r) => {
      const role = r.role === "home" ? "home" : "work";
      return { profile: r.profile, spot: floor.spots?.[role]?.[used[role]++] };
    }));
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floor, residents.map((r) => r.profile.id + r.profile.updatedAt).join()],
  );
  const { posts } = usePosts({ profileId: profile.id });
  const here = (posts ?? []).filter((p) => p.placeId === profile.id);

  if (!floor) {
    return (
      <>
        <EmptyState icon={<BuildingsIcon />} title="No layout yet">
          <p className="mx-auto mb-4 max-w-md">
            Give {profile.name} rooms, doors and furniture, then walk through it, invite people, and open posts here with everyone who was there.
          </p>
          <Button onClick={() => setEditing(true)}>
            <BuildingsIcon /> Build from a template
          </Button>
        </EmptyState>
        {editing && <LayoutEditor profile={profile} onClose={() => setEditing(false)} />}
      </>
    );
  }

  const groups = (["home", "work", "school", "regular"] as PlaceRole[]).map((role) => ({ role, people: people.filter((p) => p.role === role) })).filter((g) => g.people.length);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="overflow-hidden rounded-lg bg-white shadow-sm">
        <img src={picture!} alt={`${profile.name}, from above`} className="w-full bg-[#1d232b]" />
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button onClick={() => navigate({ view: "world", placeId: profile.id })}>
            <PlayIcon weight="fill" /> Enter
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)}>
            <PencilSimpleIcon /> Edit layout
          </Button>
          <span className="ml-auto text-sm text-slate-500">
            {floor.rooms.length} rooms · {floor.width} × {floor.depth} m{city ? ` · ${city.name}` : ""}
          </span>
        </div>
      </section>
      <div className="space-y-6">
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-slate-800">People</h2>
          {groups.length === 0 && <p className="text-sm text-slate-500">Nobody lives or works here yet. Add a relationship on someone's About tab ("Home", "Workplace", "Favourite spot").</p>}
          {groups.map((g) => (
            <div key={g.role} className="mb-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{ROLE_LABELS[g.role]}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.people.map(({ profile: p }) => (
                  <button key={p.id} onClick={() => navigate({ view: "profile", id: p.id })} className="flex items-center gap-2 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-3 text-sm hover:bg-slate-200">
                    <FaceImage profile={p} className="h-7 w-7" /> {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section className="rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-slate-800">Posts here</h2>
          {here.length === 0 && <p className="text-sm text-slate-500">No check-ins yet. "Save moment" in the place adds one.</p>}
          <ul className="divide-y divide-slate-100">
            {here.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => navigate({ view: "post", id: p.id })}>
                  <div className="truncate text-sm font-medium text-slate-800">{p.title || p.content.replace(/@\[profile:[^\]]+\]/g, (m) => profiles.get(m.slice(10, -1))?.name ?? "").slice(0, 80) || "A moment"}</div>
                  <div className="text-xs text-slate-500">
                    {formatPostDate(p.occurredAt)}
                    {p.withIds.length > 0 && ` · with ${p.withIds.map((id) => profiles.get(id)?.name).filter(Boolean).join(", ")}`}
                  </div>
                </button>
                <Button variant="outline" className="!px-2 !py-1 text-sm" onClick={() => navigate({ view: "world", placeId: profile.id, postId: p.id })}>
                  <PlayIcon weight="fill" /> Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {editing && <LayoutEditor profile={profile} onClose={() => setEditing(false)} />}
    </div>
  );
}
