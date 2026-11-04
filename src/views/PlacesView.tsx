// Places: each city is a list of places with a picture and who belongs there.
// Places with a layout can be entered; the rest can be built from a template.
import { useMemo, useState } from "react";
import { BuildingsIcon, MapPinIcon, PlayIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import { parseLayout } from "../lib/places/layout";
import { cityOf, isCity, isPlace, peopleAt, type PlaceRole } from "../lib/places/people";
import { LayoutEditor } from "../components/LayoutEditor";
import { Page } from "../components/Shell";
import { placePicture } from "../components/world/thumbnail";
import { Button, CoverImage, EmptyState } from "../components/ui";

const ROLE_TAGS: Record<PlaceRole, { label: string; className: string }> = {
  home: { label: "home", className: "bg-emerald-100 text-emerald-800" },
  work: { label: "work", className: "bg-sky-100 text-sky-800" },
  school: { label: "school", className: "bg-violet-100 text-violet-800" },
  regular: { label: "regular", className: "bg-amber-100 text-amber-800" },
};

export function PlacesView() {
  const { snapshot } = useJournal();
  const groups = useMemo(() => {
    const places = snapshot.profiles.filter((p) => isPlace(p) && !isCity(p) && (p.kind !== "page" || p.layout));
    const byCity = new Map<string, { city: Profile | null; places: Profile[] }>();
    for (const p of places) {
      const city = cityOf(p.id, snapshot.profiles) ?? null;
      const key = city?.id ?? "";
      if (!byCity.has(key)) byCity.set(key, { city, places: [] });
      byCity.get(key)!.places.push(p);
    }
    for (const c of snapshot.profiles.filter(isCity)) if (!byCity.has(c.id)) byCity.set(c.id, { city: c, places: [] });
    // Cities by name, "Elsewhere" last; inside, places you can enter first.
    return [...byCity.values()]
      .sort((a, b) => (a.city ? 0 : 1) - (b.city ? 0 : 1) || (a.city?.name ?? "").localeCompare(b.city?.name ?? ""))
      .map((g) => ({ ...g, places: g.places.sort((a, b) => Number(!!b.layout) - Number(!!a.layout) || a.name.localeCompare(b.name)) }));
  }, [snapshot.profiles]);
  const [cityId, setCityId] = useState<string | null>(null);
  const shown = groups.find((g) => (g.city?.id ?? "") === cityId) ?? groups[0];

  return (
    <Page title={<><MapPinIcon className="text-rose-500" /> Places</>}>
      {groups.length === 0 ? (
        <EmptyState icon={<BuildingsIcon />} title="No places yet">
          Add a place, shop or page profile, then give it a layout to walk through it.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {groups.map((g) => {
              const id = g.city?.id ?? "";
              const on = (shown.city?.id ?? "") === id;
              return (
                <button
                  key={id}
                  onClick={() => setCityId(id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-600 text-white" : "bg-white text-slate-700 shadow-sm hover:bg-slate-50"}`}
                >
                  {g.city?.name ?? "Elsewhere"} · {g.places.length}
                </button>
              );
            })}
          </div>
          {shown.city && (
            <div className="relative mb-4 overflow-hidden rounded-lg shadow-sm">
              <CoverImage profile={shown.city} className="h-32" />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-4 text-white">
                <div>
                  <div className="text-xl font-bold">{shown.city.name}</div>
                  {shown.city.tagline && <div className="text-sm text-white/85">{shown.city.tagline}</div>}
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.places.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}

function PlaceCard({ place }: { place: Profile }) {
  const { snapshot, navigate } = useJournal();
  const [building, setBuilding] = useState(false);
  const floor = parseLayout(place.layout)?.floors[0];
  const picture = useMemo(() => (floor ? placePicture(floor, 640, 400) : null), [floor]);
  const people = peopleAt(place.id, snapshot.profiles);
  const roles = (["home", "work", "school", "regular"] as PlaceRole[]).map((role) => ({ role, names: people.filter((p) => p.role === role).map((p) => p.profile.name) })).filter((r) => r.names.length);
  const posts = snapshot.stats[place.id]?.posts ?? 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg bg-white shadow-sm">
      <button onClick={() => navigate({ view: "profile", id: place.id, tab: "place" })} className="block">
        {place.cover ? (
          <CoverImage profile={place} className="aspect-[16/10]" />
        ) : picture ? (
          <img src={picture} alt="" className="aspect-[16/10] w-full bg-[#1d232b] object-cover" />
        ) : (
          <CoverImage profile={place} className="aspect-[16/10]" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <button onClick={() => navigate({ view: "profile", id: place.id, tab: "place" })} className="text-left text-[17px] font-bold text-slate-800 hover:underline">
          {place.name}
        </button>
        <div className="text-sm text-slate-500">{[place.category, place.location].filter(Boolean).join(" · ") || "Place"}</div>
        <div className="space-y-1 text-sm text-slate-600">
          {roles.map((r) => (
            <div key={r.role}>
              <span className={`mr-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_TAGS[r.role].className}`}>{ROLE_TAGS[r.role].label}</span>
              {r.names.join(", ")}
            </div>
          ))}
        </div>
        <div className="mt-auto flex gap-2 pt-2">
          {floor ? (
            <>
              <Button onClick={() => navigate({ view: "world", placeId: place.id })}>
                <PlayIcon weight="fill" /> Enter
              </Button>
              <Button variant="outline" onClick={() => navigate({ view: "profile", id: place.id, tab: "posts" })}>
                Posts · {posts}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setBuilding(true)}>
              <BuildingsIcon /> Build from a template
            </Button>
          )}
        </div>
      </div>
      {building && <LayoutEditor profile={place} onClose={() => setBuilding(false)} />}
    </article>
  );
}
