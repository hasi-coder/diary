// What the all-fours posture needs to know that doesn't depend on a renderer. Distances are in leg lengths
// (the body's hip height), so they hold at any scale.

/** How near the floor a hand's keyed position must be before it is put flat on it. Full inside `full`, fading to nothing at `fade`. */
export interface Grip { full: number; fade: number }

/** The default band: hands the keys leave within 0.2 of a leg's length of the floor are flattened (that is a keyed 90 to about 110); by 0.25 they are free (about 120 and up). */
export const ALLFOURS_GRIP: Grip = { full: 0.2, fade: 0.25 };

/** Where the rig's wrist rests keyed with the arm straight down (90), in leg lengths above the floor: its forearm has a forward bend. Measured on the shipped rig; a test keeps it honest. */
export const ALLFOURS_REST_HAND = 0.14;
/** Shoulder-to-wrist length in leg lengths (shipped rig, measured); a test keeps it honest. */
export const ALLFOURS_ARM = 0.36;

/** About where the keyed wrist is, in leg lengths above the floor, for an arm keyed `forward` degrees (all-fours baseline: 90 = straight down). */
export function estimateHandHeight(forward: number): number {
  return ALLFOURS_REST_HAND + ALLFOURS_ARM * (1 - Math.cos((Math.max(forward, 90) - 90) * Math.PI / 180));
}

/** How far forward of the shoulder a flattened hand may land, as a share of the arm's length; the pitch is sized so an arm reaches the floor with this much spread. */
export const ALLFOURS_SPREAD = 0.25;
