import { ageRequirement, mayPlayDressed, type Interaction } from "./interaction";
import type { Age } from "./character";
import { INTERACTION_SETTINGS } from "../interactionSettings";

// Compatibility exports; values are owned by the main Settings page's store.
export {
  INTERACTION_SETTINGS as INTERACTION_POLICY,
  interactionSettingsRevision as interactionPolicyRevision,
  subscribeInteractionSettings as subscribeInteractionPolicy,
  setInteractionEnabled,
} from "../interactionSettings";

/** Shared by menus and playback. New actions default to enabled. */
export function interactionEnabled(def: Pick<Interaction, "id">): boolean {
  return INTERACTION_SETTINGS.enabled && (INTERACTION_SETTINGS.actions[def.id] ?? true);
}

export interface InteractionPerson {
  profile: { birthday: string };
  look: { age: Age };
}

const AGE_BANDS: Record<Age, { minimum: number; maximum: number }> = {
  child: { minimum: 0, maximum: 12 }, teen: { minimum: 13, maximum: 19 },
  adult: { minimum: 20, maximum: 64 }, elder: { minimum: 65, maximum: Infinity },
};

/**
 * How old someone is for the purposes of an action, in years: their birthday when known, otherwise
 * the youngest age of the band they are drawn as; and never more than the oldest age of that band,
 * so a child drawn as a child stays one whatever the birthday says.
 */
export function yearsOf(person: InteractionPerson, now = new Date()): number {
  const band = AGE_BANDS[person.look.age];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.profile.birthday);
  if (!match) return band.minimum;
  let years = now.getFullYear() - Number(match[1]);
  if (now.getMonth() + 1 < Number(match[2]) || (now.getMonth() + 1 === Number(match[2]) && now.getDate() < Number(match[3]))) years--;
  return Math.min(years, band.maximum);
}

type Gated = Pick<Interaction, "id" | "requires" | "wardrobe" | "gate" | "category">;

/** The age an action needs and how old the group is (the youngest of them counts). */
export function interactionGate(def: Gated, people: InteractionPerson[], now = new Date()) {
  const minimum = ageRequirement(def);
  const age = people.length ? Math.min(...people.map((p) => yearsOf(p, now))) : Infinity;
  const met = age >= minimum;
  return { minimum, age, met, dressed: !met && mayPlayDressed(def), hidden: !met && !mayPlayDressed(def) };
}

/** True when this group plays the action clothed because they don't meet its age requirement. */
export const interactionDressed = (def: Gated, people: InteractionPerson[]) => interactionGate(def, people).dressed;

/** Hidden from menus for this group (shown locked instead when the Settings switch is on). */
export function interactionHidden(def: Gated, people: InteractionPerson[]): boolean {
  return interactionGate(def, people).hidden && !INTERACTION_SETTINGS.showLocked;
}

/** Eligibility reads the saved settings mapping and what the action itself requires; no
 * action-specific rules live in playback or renderers. Respects both known birthdays and the depicted age. */
export function interactionPolicyProblem(def: Gated, people: InteractionPerson[], now = new Date()): string | null {
  if (!interactionEnabled(def)) return "This action is switched off in Settings → Places animations & actions.";
  const minimum = INTERACTION_SETTINGS.minimumAges[def.id] ?? 0;
  if (minimum > 0 && people.some((person) => yearsOf(person, now) < minimum)) return `This action is mapped to ages ${minimum}+ in Settings.`;
  const gate = interactionGate(def, people, now);
  if (gate.hidden) return `Needs everyone to be ${gate.minimum}+.`;
  return null;
}
