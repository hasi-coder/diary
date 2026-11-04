// Who belongs where, from the relationships people already have: a person's
// home, workplace, school and favourite spots are relations to place profiles,
// and a place's city is a "city" relation.
import type { Profile } from "../api";
import { relationsOf } from "../catalog";

export type PlaceRole = "home" | "work" | "school" | "regular";

/** Relation kind declared by the person → role at the place; and the inverse, declared by the place. */
const BY_PERSON: Record<string, PlaceRole> = { home: "home", workplace: "work", school: "school", favourite: "regular" };
const BY_PLACE: Record<string, PlaceRole> = { resident: "home", employee: "work", student: "school", regular: "regular" };

export const ROLE_LABELS: Record<PlaceRole, string> = { home: "Lives here", work: "Works here", school: "Studies here", regular: "Often here" };

export const isPerson = (p: Profile) => p.kind === "person" || p.kind === "me";
export const isPlace = (p: Profile) => p.kind === "place" || p.kind === "shop" || p.kind === "page";
export const isCity = (p: Profile) => p.kind === "place" && p.category.trim().toLowerCase() === "city";

/** The people with a role at `placeId`. */
export function peopleAt(placeId: string, profiles: Profile[]): { profile: Profile; role: PlaceRole }[] {
  const out: { profile: Profile; role: PlaceRole }[] = [];
  for (const v of relationsOf(placeId, profiles)) {
    if (!isPerson(v.other)) continue;
    const role = v.declarerId === placeId ? BY_PLACE[v.relation.kind] : BY_PERSON[v.relation.kind];
    if (role && !out.some((o) => o.profile.id === v.other.id && o.role === role)) out.push({ profile: v.other, role });
  }
  return out;
}

/** The places a person has a role at. */
export function placesOf(personId: string, profiles: Profile[]): { profile: Profile; role: PlaceRole }[] {
  const out: { profile: Profile; role: PlaceRole }[] = [];
  for (const v of relationsOf(personId, profiles)) {
    if (!isPlace(v.other) || isCity(v.other)) continue;
    const role = v.declarerId === personId ? BY_PERSON[v.relation.kind] : BY_PLACE[v.relation.kind];
    if (role) out.push({ profile: v.other, role });
  }
  return out;
}

/** The city a place is in, if it has one. */
export function cityOf(placeId: string, profiles: Profile[]): Profile | undefined {
  return relationsOf(placeId, profiles).find(
    (v) => isCity(v.other) && ((v.declarerId === placeId && v.relation.kind === "city") || (v.declarerId !== placeId && v.relation.kind === "city_place")),
  )?.other;
}
