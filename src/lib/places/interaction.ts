import type { ClothingRegion } from "./clothingTypes";
import { FACE_VIEWS, type FaceView } from "./character";

// Things people do together in the Places world (dance, hug, high-five, …),
// described as JSON (./interactions/*.json): who takes part, where each person
// stands, and each role's poses over time as keyframes. See
// ./interactions/README.md for the format.

/** A body pose. Angles in degrees; anything left out is the neutral standing pose. */
export interface Pose {
  /** [forward, out]: forward 90 = arm straight ahead, 180 = straight up; out 90 = straight out to the side. */
  armL?: [number, number];
  armR?: [number, number];
  /** Elbow bend, forward from the rig's rest pose. */
  elbowL?: number;
  elbowR?: number;
  /** Forearm rotation around its length, outward on each side. */
  forearmL?: number;
  forearmR?: number;
  /** Wrist [forward bend, outward bend, outward twist]. */
  wristL?: [number, number, number];
  wristR?: [number, number, number];
  /** Thigh forward (negative = backward). */
  legL?: number;
  legR?: number;
  /** Knee bend. */
  kneeL?: number;
  kneeR?: number;
  /** Ankle [toes up, outward roll]. */
  ankleL?: [number, number];
  ankleR?: [number, number];
  /** Upper body lean forward, and tilt to the person's right. */
  lean?: number;
  tilt?: number;
  /** Upper body turn to the person's right, independent of the feet. */
  twist?: number;
  /** Neck and head [nod forward, turn right, tilt right], relative to the parent. */
  neck?: [number, number, number];
  head?: [number, number, number];
  /** Turn on the spot, added to the way the role faces. */
  turn?: number;
  /** Rise (metres): a bounce, a hop. */
  bob?: number;
  /** Step away from the role's spot (metres): [right, forward] in the person's own frame. */
  move?: [number, number];
  /** A symbol over the head from this key on ("♪", "👏"); "" clears it. */
  emote?: string;
  /** What the person holds from this key on ("toothbrush", "baby"); "" puts it down. */
  held?: HeldItem;
  /** Which head image to show from this key on (a FaceView such as "sleeping"); "" goes back to choosing by the camera and the way the head lies. */
  face?: FaceView | "";
}

export type HeldItem = "toothbrush" | "baby" | "";

export interface Key extends Pose {
  /** When, in beats from the start. */
  beat: number;
}

export interface RoleSpot {
  role: string;
  /** Metres from the anchor: [right, forward], forward pointing from the first person to the second. */
  at: [number, number];
  /** Degrees from the anchor's forward: 0 faces forward, 180 faces back. */
  facing: number;
}

export type Formation =
  /** Fixed spots, one per person in order (the person who starts it is first); `spin` turns the group (degrees per beat). */
  | { type: "spots"; spots: RoleSpot[]; spin?: number }
  /** Everyone on a circle facing the middle; `spin` turns the circle (degrees per beat). */
  | { type: "ring"; role: string; radius?: number; spin?: number }
  /** Everyone where they are, turned toward the middle of the group. */
  | { type: "stay"; role: string };

export type Posture = "stand" | "sit" | "lie" | "inside";

/** How a body rests on furniture: hip height in metres and tilt in degrees (-90 = lying face up, 0 = sitting upright). */
export interface Rest { height: number; pitch: number }

/** Where one role goes at the furniture, instead of the action's own posture. */
export interface RolePlacement {
  posture: Posture;
  /** Overrides the action's `rest` for this role. */
  rest?: Rest;
  /** Which side of the furniture, from the point of view of a person lying on it. */
  side?: "left" | "right" | "center";
  /** Metres from the middle toward that side (ignored for "center", the middle line). A standing role defaults to just outside the furniture; a lying role to the middle. */
  across?: number;
  /** Metres from the middle toward the feet (negative toward the head). */
  along?: number;
}


export interface Interaction {
  id: string;
  label: string;
  emoji?: string;
  /** Which group of the action wheel and settings list it sits in. Any word works; give it a label and emoji in interactions/categories.json. "other" when left out. */
  category?: string;
  description?: string;
  /**
   * Furniture used by this action. Omitted for open-floor interactions.
   * `posture` is how everyone uses it; `roles` overrides that for a role, so a
   * client can lie on a bed while a therapist stands beside it.
   */
  target?: { kinds: string[]; posture: Posture; leaveSeat?: boolean; rest?: Rest; roles?: Record<string, RolePlacement> };
  /** A timed cutaway to a full-screen card, in beats. Only for actions that change outfit (with `outfitAt`). */
  cutaway?: { from: number; to: number; label: string; emoji?: string };
  /**
   * Temporary outfit change, restored when the scene ends. Give an `outfitId` to swap
   * in a preset, `remove` to take off whatever covers those body regions (a bath takes
   * everything off; the toilet only the lower body), or both.
   */
  wardrobe?: { at: number; restoreAt: number; outfitId?: string; remove?: ClothingRegion[]; preferUnderlayers?: boolean };
  /** Change to the outfit selected when starting, at this beat. */
  outfitAt?: number;
  water?: boolean;
  people: { min: number; max: number };
  /** Seconds per beat. */
  beat: number;
  /** Beats in one round. */
  length: number;
  /** Repeat until stopped; otherwise it ends after one round. */
  loop?: boolean;
  /** Beats between one person and the next in a ring or group (a wave going round). */
  stagger?: number;
  formation: Formation;
  /** Keyframes per role, in beat order. */
  roles: Record<string, Key[]>;
}

const NEUTRAL: Required<Omit<Pose, "emote" | "held" | "face">> = {
  armL: [0, 8],
  armR: [0, 8],
  elbowL: 0,
  elbowR: 0,
  forearmL: 0,
  forearmR: 0,
  wristL: [0, 0, 0],
  wristR: [0, 0, 0],
  legL: 0,
  legR: 0,
  kneeL: 0,
  kneeR: 0,
  ankleL: [0, 0],
  ankleR: [0, 0],
  lean: 0,
  tilt: 0,
  twist: 0,
  neck: [0, 0, 0],
  head: [0, 0, 0],
  turn: 0,
  bob: 0,
  move: [0, 0],
};
export type FullPose = Required<Omit<Pose, "emote" | "held" | "face">> & { emote: string; held: HeldItem; face: FaceView | "" };

/** Problems that stop an interaction from loading; [] when it's usable. */
export function interactionProblems(value: unknown): string[] {
  const v = value as Partial<Interaction> | null;
  if (!v || typeof v !== "object") return ["An interaction is a JSON object."];
  const out: string[] = [];
  const name = v.id ? `"${v.id}"` : "Interaction";
  if (!v.id || !v.label) out.push(`${name}: needs an id and a label.`);
  if (v.category !== undefined && (typeof v.category !== "string" || !v.category.trim())) out.push(`${name}: category must be a word.`);
  if (!(v.beat! > 0) || !(v.length! > 0)) out.push(`${name}: beat and length must be positive.`);
  if (!(v.people?.min! >= 1) || !(v.people?.max! >= v.people?.min!)) out.push(`${name}: people needs min ≥ 1 and max ≥ min.`);
  const postures = ["stand", "sit", "lie", "inside"];
  if (v.target && (!Array.isArray(v.target.kinds) || !v.target.kinds.length || v.target.kinds.some((kind) => typeof kind !== "string") || !postures.includes(v.target.posture))) out.push(`${name}: target needs furniture kinds and a stand, sit, lie or inside posture.`);
  for (const [role, place] of Object.entries(v.target?.roles ?? {})) {
    if (!postures.includes(place?.posture) || (place.side !== undefined && !["left", "right", "center"].includes(place.side)) || ([place.along, place.across].some((n) => n !== undefined && !Number.isFinite(n)))) out.push(`${name}: target role "${role}" needs a posture, an optional left or right side and numeric across and along.`);
  }
  if (v.cutaway && (!Number.isFinite(v.cutaway.from) || !Number.isFinite(v.cutaway.to) || v.cutaway.from < 0 || v.cutaway.to <= v.cutaway.from || v.cutaway.to > v.length! || typeof v.cutaway.label !== "string")) out.push(`${name}: cutaway needs a label and a time range inside the animation.`);
  if (v.cutaway && v.outfitAt === undefined) out.push(`${name}: a cutaway is only for actions that change outfit (set outfitAt).`);
  if (v.wardrobe && (!Number.isFinite(v.wardrobe.at) || !Number.isFinite(v.wardrobe.restoreAt) || v.wardrobe.at < 0 || v.wardrobe.restoreAt <= v.wardrobe.at || v.wardrobe.restoreAt > v.length! || (!v.wardrobe.outfitId && !v.wardrobe.remove?.length))) out.push(`${name}: wardrobe needs an outfit id or regions to remove, and an ordered time range inside the animation.`);
  if (v.wardrobe?.remove && !(Array.isArray(v.wardrobe.remove) && v.wardrobe.remove.every((r) => REGIONS.includes(r)))) out.push(`${name}: wardrobe remove must list body regions (${REGIONS.join(", ")}).`);
  if (v.outfitAt !== undefined && (!Number.isFinite(v.outfitAt) || v.outfitAt < 0 || v.outfitAt > v.length!)) out.push(`${name}: outfitAt must be inside the animation.`);
  const f = v.formation;
  const roles = f?.type === "spots" ? f.spots.map((s) => s.role) : f?.type === "ring" || f?.type === "stay" ? [f.role] : null;
  if (!roles) out.push(`${name}: formation type must be spots, ring or stay.`);
  if (f?.type === "spots" && v.people && f.spots.length < v.people.max) out.push(`${name}: ${v.people.max} people need ${v.people.max} spots.`);
  for (const r of roles ?? []) {
    const keys = v.roles?.[r];
    if (!Array.isArray(keys) || keys.length === 0) out.push(`${name}: role "${r}" has no keyframes.`);
    else if (keys.some((k, i) => typeof k.beat !== "number" || (i > 0 && k.beat < keys[i - 1].beat))) out.push(`${name}: role "${r}" keyframes need beats in order.`);
    if (Array.isArray(keys)) for (const key of keys) {
      if (key.face !== undefined && key.face !== "" && !FACE_VIEWS.includes(key.face)) out.push(`${name}: role "${r}" at beat ${key.beat}: face must be one of ${FACE_VIEWS.join(", ")}.`);
      if (key.held !== undefined && !["toothbrush", "baby", ""].includes(key.held)) out.push(`${name}: role "${r}" at beat ${key.beat}: held must be toothbrush, baby or "".`);
      for (const field of Object.keys(NEUTRAL) as (keyof typeof NEUTRAL)[]) {
        const value = key[field];
        if (value === undefined) continue;
        const neutral = NEUTRAL[field];
        const valid = Array.isArray(neutral)
          ? Array.isArray(value) && value.length === neutral.length && value.every((n) => typeof n === "number" && Number.isFinite(n))
          : typeof value === "number" && Number.isFinite(value);
        if (!valid) out.push(`${name}: role "${r}" at beat ${key.beat}: ${field} needs ${Array.isArray(neutral) ? `${neutral.length} finite numbers` : "a finite number"}.`);
      }
    }
  }
  return out;
}

const REGIONS: string[] = ["torso", "upperArms", "forearms", "hips", "thighs", "calves", "feet", "neck", "wrists"];

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A role's pose at a beat, blending between keyframes. Missing joints are neutral. */
export function poseAt(def: Interaction, role: string, beat: number): FullPose {
  const keys = def.roles[role] ?? [];
  if (!keys.length) return { ...NEUTRAL, emote: "", held: "", face: "" };
  const b = def.loop ? ((beat % def.length) + def.length) % def.length : Math.min(Math.max(beat, 0), def.length);
  let i = keys.length - 1;
  while (i > 0 && keys[i].beat > b) i--;
  const a = keys[i];
  // After the last key a loop blends back into the first, one round later.
  const next = keys[i + 1] ?? (def.loop ? { ...keys[0], beat: keys[0].beat + def.length } : a);
  const span = next.beat - a.beat;
  const t = b < a.beat ? 0 : span > 0 ? smooth(Math.min(1, (b - a.beat) / span)) : 0;
  // Drive interpolation from the neutral pose so new joints cannot silently be
  // omitted here. Tuples are freshly allocated; callers never mutate defaults.
  const pose = Object.fromEntries((Object.keys(NEUTRAL) as (keyof typeof NEUTRAL)[]).map((field) => {
    const x = a[field] ?? NEUTRAL[field];
    const y = next[field] ?? NEUTRAL[field];
    return [field, Array.isArray(x) ? x.map((n, i) => mix(n, (y as number[])[i], t)) : mix(x, y as number, t)];
  })) as Required<Omit<Pose, "emote" | "held" | "face">>;
  let emote = "";
  let held: HeldItem = "";
  let face: FaceView | "" = "";
  for (const k of keys) if (k.beat <= b) { if (k.emote !== undefined) emote = k.emote; if (k.held !== undefined) held = k.held; if (k.face !== undefined) face = k.face; }
  return { ...pose, emote, held, face };
}
