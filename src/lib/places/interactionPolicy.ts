import type { Interaction } from "./interaction";
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

/** Eligibility reads the saved settings mapping; no action-specific rules live
 * in playback or renderers. Respect both known birthdays and the depicted age. */
export function interactionPolicyProblem(def: Pick<Interaction, "id">, people: InteractionPerson[], now = new Date()): string | null {
  if (!interactionEnabled(def)) return "This action is switched off in Settings → Places animations & actions.";
  const minimum = INTERACTION_SETTINGS.minimumAges[def.id] ?? 0;
  if (minimum > 0 && people.some((person) => {
    const band = AGE_BANDS[person.look.age];
    if (band.maximum < minimum) return true;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.profile.birthday);
    if (!match) return band.minimum < minimum;
    let years = now.getFullYear() - Number(match[1]);
    if (now.getMonth() + 1 < Number(match[2]) || (now.getMonth() + 1 === Number(match[2]) && now.getDate() < Number(match[3]))) years--;
    return years < minimum;
  })) return `This action is mapped to ages ${minimum}+ in Settings.`;
  return null;
}
