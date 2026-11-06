import type { ClothingLayer, ClothingRegion } from "./clothingTypes";
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
  /** Plant limbs on something from this key on, keyed by limb; weight 0 releases it. Holds until changed. */
  plant?: Partial<Record<Limb, Plant>>;
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

export type Posture = "stand" | "sit" | "lie" | "inside" | "kneel" | "allfours";

/** How a body rests on furniture: hip height in metres and tilt in degrees (-90 = lying face up, 0 = sitting upright). */
export interface Rest { height: number; pitch: number }

/** Where one role goes at the furniture, instead of the action's own posture. */
export interface RolePlacement {
  posture: Posture;
  /** Overrides the action's `rest` for this role. */
  rest?: Rest;
  /** Place this role against another role instead (same as a top-level `anchors` entry). */
  anchor?: Anchor;
  /** Which side of the furniture, from the point of view of a person lying on it. */
  side?: "left" | "right" | "center";
  /** Metres from the middle toward that side (ignored for "center", the middle line). A standing role defaults to just outside the furniture; a lying role to the middle. */
  across?: number;
  /** Metres from the middle toward the feet (negative toward the head). */
  along?: number;
  /** Degrees from the furniture's facing the role looks. Left out: along the furniture lying, outward when sitting on it, toward it standing. */
  facing?: number;
}


/** A repeating wobble added to one channel: "lean", "armL.0" (a tuple's first value), "move.1". */
export interface Oscillator {
  channel: string;
  amplitude: number;
  /** Beats per cycle. */
  period: number;
  /** Fraction of a cycle (0–1) to start at, or "auto": each role takes the next half-cycle, so partners alternate. */
  phase?: number | "auto";
}

/**
 * Carves the keyed beats into an intro (before `intro`), a middle that repeats `repeat` times
 * (`loop` beats long) and an outro (the rest). Playing time is `length + (repeat - 1) * loop`.
 */
export interface Segments { intro?: number; loop: number; repeat?: number }

/**
 * Places a role against another role instead of against the furniture or its spot: `distance`
 * metres to its `front`, `behind`, `left` or `right` (`over` stays on top), `lift` metres above the
 * ground (stacks with `bob`), looking `angle` degrees from the anchor role (default: back at it from
 * the front, otherwise the same way). Follows the anchor role through the clip, oscillators included.
 * `distance` left out is derived from the two bodies' sizes.
 */
export interface Anchor { role: string; at: "front" | "behind" | "left" | "right" | "over"; distance?: number; lift?: number; angle?: number }

/**
 * Where the camera looks while the action plays; the camera eases there and back. Ignored when left out.
 * `focus` is what it centres on ("target": the furniture; "people": the middle of the group), `offset` moves
 * that by [right, forward] metres on the floor, `height` is how high the camera looks (metres), `zoom` multiplies the zoom.
 */
export interface Framing { zoom?: number; height?: number; offset?: [number, number]; focus?: "target" | "people" }

/** A change of clothes: a preset, and/or garments covering these regions or in these layers taken off. */
export interface WardrobeStep { at: number; restoreAt: number; outfitId?: string; remove?: (ClothingRegion | ClothingLayer)[]; preferUnderlayers?: boolean }
/**
 * Everyone's clothes change at `at` and come back at `restoreAt`. `roles` gives one role its own step,
 * merged over the global one (so one role can change while the other keeps their clothes).
 */
export interface Wardrobe extends WardrobeStep { fallback?: "dressed" | "hide"; roles?: Record<string, Partial<WardrobeStep>> }

/** Which two roles must stay apart, in metres (default: the two bodies' sizes), pushed apart softly. */
export interface Clearance { min?: number }

/** What a role's limb is planted on: `role:<id>`, `bed` or `floor`, at a named point of that body. */
export type Limb = "armL" | "armR" | "legL" | "legR";
export const LIMBS: Limb[] = ["armL", "armR", "legL", "legR"];
/** Points on a body a limb can be planted on. `hand` on another body is the mutual midpoint of the two keyed hands when that body plants a hand back (else it falls back to their opposite hand, and lint flags it); `handL` / `handR` name one specific keyed hand of that body. */
export const PLANT_POINTS = ["head", "shoulder", "hand", "handL", "handR", "hip", "lowerBack", "knee", "surface"];
export interface Plant { on: string; point?: string; weight?: number; blend?: number }
/** A planted limb at an instant: how strongly it is held on its target. */
export type PlantState = Partial<Record<Limb, { on: string; point: string; weight: number }>>;

/** How an action reads, for a lint that checks the declared tier against what it does. */
export interface Content { motion?: "static" | "cyclic" | "repetitive"; contact?: "none" | "incidental" | "sustained"; witness?: "fine" | "private" }

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
   * everything off; the toilet only the lower body), or both. `fallback` is what happens for people too
   * young to see the undressing: "dressed" plays the action clothed, "hide" removes it. Default: "hide"
   * when the action declares a `minAge`, is intimate or declares no tier at all; "dressed" only for an
   * action that states it is casual or affectionate.
   */
  wardrobe?: Wardrobe;
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
  /**
   * What the action needs of the people in it. `minAge` is in years; `wardrobe` lists the body
   * regions it undresses (declared, so no clip can forget it). Taking clothes off the hips, thighs
   * or calves always needs an adult, declared or not (see `ageRequirement`).
   */
  requires?: { minAge?: number; wardrobe?: ClothingRegion[]; tier?: Tier };
  /** Also offer a left-right mirrored copy of this action (id `<id>-mirrored`), made by `mirrorInteraction`. */
  mirror?: boolean;
  /** Declare how it reads; lint warns when that disagrees with the tier. */
  content?: Content;
  /** Keeps roles at least this far apart (pushes the unanchored role, or lengthens an anchor). */
  clearance?: Clearance;
  /** Camera framing while it plays, so stacked or far-apart bodies stay in view. */
  camera?: Framing;
  /** Roles placed against another role: `{ "client": { "role": "therapist", "at": "front", "distance": 0.5 } }`. */
  anchors?: Record<string, Anchor>;
  /** Periodic modifiers per role, added on top of the keyframes. */
  oscillators?: Record<string, Oscillator[]>;
  /** An intro / repeating middle / outro split of the keyed beats. */
  segments?: Segments;
}

export type Tier = "casual" | "affectionate" | "intimate";
/** The youngest age each tier may be seen at. */
export const TIER_AGE: Record<Tier, number> = { casual: 0, affectionate: 0, intimate: 18 };
export const TIERS = Object.keys(TIER_AGE) as Tier[];

/** Regions whose clothes may only come off for adults. */
export const ADULT_REGIONS: ClothingRegion[] = ["hips", "thighs", "calves"];
export const ADULT_AGE = 18;

type Requiring = Pick<Interaction, "requires" | "wardrobe">;

/** The youngest age that may see the action at all: its tier, raised by a declared `minAge`. */
export const viewAge = (def: Requiring) => Math.max(def.requires?.minAge ?? 0, TIER_AGE[def.requires?.tier ?? "casual"]);

/**
 * The youngest age that may do the action as authored: `viewAge`, and 18 whenever it undresses the
 * hips, thighs or calves (by `wardrobe.remove` or `requires.wardrobe`), whatever its tier.
 */
export function ageRequirement(def: Requiring): number {
  const steps = [def.wardrobe, ...Object.values(def.wardrobe?.roles ?? {})];
  const regions = [...steps.flatMap((step) => step?.remove ?? []), ...(def.requires?.wardrobe ?? [])] as ClothingRegion[];
  return Math.max(viewAge(def), regions.some((r) => ADULT_REGIONS.includes(r)) ? ADULT_AGE : 0);
}

/** What happens for someone old enough to see the action but not its undressing. */
export const wardrobeFallback = (def: Requiring): "dressed" | "hide" =>
  def.wardrobe?.fallback ?? (def.requires?.minAge !== undefined || def.requires?.tier === undefined || def.requires.tier === "intimate" ? "hide" : "dressed");

/** Whether the action may play clothed for people too young for its undressing. Never for an intimate one. */
export const mayPlayDressed = (def: Requiring) => !!def.wardrobe && def.requires?.tier !== "intimate" && wardrobeFallback(def) === "dressed";

/** Every role anchor an action declares: the top-level `anchors` and any `anchor` on a role's placement. */
export function anchorsOf(def: Pick<Interaction, "anchors" | "target">): Record<string, Anchor> {
  const out: Record<string, Anchor> = { ...(def.anchors ?? {}) };
  for (const [role, place] of Object.entries(def.target?.roles ?? {})) if (place?.anchor) out[role] = place.anchor;
  return out;
}

/** Beats the action plays for: `length`, plus the extra repeats of a segmented middle. */
export const lengthOf = (def: Interaction) => def.length + (def.segments ? ((def.segments.repeat ?? 1) - 1) * def.segments.loop : 0);

/** The keyed beat that playing beat `beat` shows, with a segmented middle repeated. */
function keyedBeat(def: Interaction, beat: number): number {
  const seg = def.segments;
  if (!seg || beat <= 0) return beat;
  const intro = seg.intro ?? 0, repeat = seg.repeat ?? 1;
  if (beat < intro) return beat;
  if (beat < intro + seg.loop * repeat) return intro + ((beat - intro) % seg.loop);
  return beat - seg.loop * (repeat - 1);
}

const NEUTRAL: Required<Omit<Pose, "emote" | "held" | "face" | "plant">> = {
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
/** The posture a role is in, falling back to the clip's. */
export const postureOf = (def: Pick<Interaction, "target">, role: string): Posture | undefined => def.target?.roles?.[role]?.posture ?? def.target?.posture;

/**
 * What a limb does when a key doesn't name it. Mostly neutral; on all fours the arms and thighs hang at 90, the
 * rig's own "straight down to the floor" for a torso held level, and the shins fold back at 90 (so the
 * keyed numbers read the same at every scale: 95 is five degrees past vertical).
 */
function baselineOf(def: Interaction, role: string): typeof NEUTRAL {
  if (postureOf(def, role) !== "allfours") return NEUTRAL;
  return { ...NEUTRAL, armL: [90, 0], armR: [90, 0], legL: 90, legR: 90, kneeL: 90, kneeR: 90 };
}
export type FullPose = Required<Omit<Pose, "emote" | "held" | "face" | "plant">> & { emote: string; held: HeldItem; face: FaceView | ""; plant: PlantState };

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
  const postures = ["stand", "sit", "lie", "inside", "kneel", "allfours"];
  if (v.target && (!Array.isArray(v.target.kinds) || !v.target.kinds.length || v.target.kinds.some((kind) => typeof kind !== "string") || !postures.includes(v.target.posture))) out.push(`${name}: target needs furniture kinds and a stand, sit, lie or inside posture.`);
  for (const [role, place] of Object.entries(v.target?.roles ?? {})) {
    if (!postures.includes(place?.posture) || (place.side !== undefined && !["left", "right", "center"].includes(place.side)) || ([place.along, place.across, place.facing].some((n) => n !== undefined && !Number.isFinite(n)))) out.push(`${name}: target role "${role}" needs a posture, an optional left or right side and numeric across, along and facing.`);
  }
  if (v.cutaway && (!Number.isFinite(v.cutaway.from) || !Number.isFinite(v.cutaway.to) || v.cutaway.from < 0 || v.cutaway.to <= v.cutaway.from || v.cutaway.to > v.length! || typeof v.cutaway.label !== "string")) out.push(`${name}: cutaway needs a label and a time range inside the animation.`);
  if (v.cutaway && v.outfitAt === undefined) out.push(`${name}: a cutaway is only for actions that change outfit (set outfitAt).`);
  if (v.wardrobe) {
    const w = v.wardrobe;
    const okRemove = (r: unknown) => r === undefined || (Array.isArray(r) && r.every((x) => REGIONS.includes(x) || LAYERS.includes(x)));
    const stepProblem = (label: string, step: Partial<WardrobeStep>, strict: boolean) => {
      if ((strict && (!Number.isFinite(step.at) || !Number.isFinite(step.restoreAt))) || (step.at !== undefined && (!Number.isFinite(step.at) || step.at < 0)) || (step.restoreAt !== undefined && (!Number.isFinite(step.restoreAt) || step.restoreAt > v.length!)) || (step.at !== undefined && step.restoreAt !== undefined && step.restoreAt <= step.at)) out.push(`${name}: ${label} needs an ordered time range (at before restoreAt) inside the animation.`);
      if (!okRemove(step.remove)) out.push(`${name}: ${label} remove must list body regions (${REGIONS.join(", ")}) or layers (${LAYERS.join(", ")}).`);
    };
    stepProblem("wardrobe", w, true);
    if (!w.outfitId && !w.remove?.length && !Object.keys(w.roles ?? {}).length) out.push(`${name}: wardrobe needs an outfit id, regions or layers to remove, or a step for a role.`);
    for (const [role, step] of Object.entries(w.roles ?? {})) {
      stepProblem(`wardrobe for "${role}"`, step ?? {}, false);
      const at = step?.at ?? w.at, restoreAt = step?.restoreAt ?? w.restoreAt;
      if (!(restoreAt > at)) out.push(`${name}: wardrobe for "${role}" restores (${restoreAt}) before it starts (${at}).`);
    }
  }
  if (v.outfitAt !== undefined && (!Number.isFinite(v.outfitAt) || v.outfitAt < 0 || v.outfitAt > v.length!)) out.push(`${name}: outfitAt must be inside the animation.`);
  if (v.segments && (!(v.segments.loop > 0) || !(v.segments.intro === undefined || v.segments.intro >= 0) || (v.segments.intro ?? 0) + v.segments.loop > v.length! || !(v.segments.repeat === undefined || (Number.isInteger(v.segments.repeat) && v.segments.repeat >= 1)))) out.push(`${name}: segments need a positive loop inside the animation, an optional intro, and a whole repeat count.`);
  for (const [role, list] of Object.entries(v.oscillators ?? {})) {
    for (const o of Array.isArray(list) ? list : []) {
      const [field, index] = String(o?.channel).split(".");
      const neutral = (NEUTRAL as Record<string, unknown>)[field];
      const slots = Array.isArray(neutral) ? neutral.length : 1;
      if (neutral === undefined || (index !== undefined && !(Number(index) >= 0 && Number(index) < slots)) || !Number.isFinite(o.amplitude) || !(o.period > 0) || !(o.phase === undefined || o.phase === "auto" || Number.isFinite(o.phase))) out.push(`${name}: oscillator for "${role}" needs a channel (such as lean or armL.0), a numeric amplitude, a positive period and a phase.`);
    }
  }
  if (v.requires && (typeof v.requires !== "object" || !(v.requires.minAge === undefined || (Number.isFinite(v.requires.minAge) && v.requires.minAge >= 0 && v.requires.minAge <= 120)) || !(v.requires.wardrobe === undefined || (Array.isArray(v.requires.wardrobe) && v.requires.wardrobe.every((r) => REGIONS.includes(r)))))) out.push(`${name}: requires needs an optional minAge in years and optional wardrobe regions (${REGIONS.join(", ")}).`);
  if (v.mirror !== undefined && typeof v.mirror !== "boolean") out.push(`${name}: mirror must be true or false.`);
  if (v.requires?.tier !== undefined && !TIERS.includes(v.requires.tier)) out.push(`${name}: requires.tier must be ${TIERS.join(", ")}.`);
  if (v.wardrobe?.fallback !== undefined && !["dressed", "hide"].includes(v.wardrobe.fallback)) out.push(`${name}: wardrobe.fallback must be dressed or hide.`);
  if (v.requires?.tier === "intimate" && v.wardrobe?.fallback === "dressed") out.push(`${name}: an intimate action can only be hidden for people too young for it, never played dressed.`);
  if (v.camera && (typeof v.camera !== "object" || !(v.camera.zoom === undefined || (Number.isFinite(v.camera.zoom) && v.camera.zoom > 0)) || !(v.camera.height === undefined || Number.isFinite(v.camera.height)) || !(v.camera.offset === undefined || (Array.isArray(v.camera.offset) && v.camera.offset.length === 2 && v.camera.offset.every(Number.isFinite))) || !(v.camera.focus === undefined || v.camera.focus === "target" || v.camera.focus === "people"))) out.push(`${name}: camera needs an optional positive zoom, numeric height, an [right, forward] offset and a focus of target or people.`);
  for (const [role, keys] of Object.entries(v.roles ?? {})) {
    for (const key of Array.isArray(keys) ? keys : []) for (const [limb, plant] of Object.entries(key.plant ?? {})) {
      const to = typeof plant?.on === "string" ? plant.on : "";
      const okOn = to === "bed" || to === "floor" || (to.startsWith("role:") && !!v.roles?.[to.slice(5)] && to.slice(5) !== role);
      if (!LIMBS.includes(limb as Limb) || !okOn || (plant.point !== undefined && !PLANT_POINTS.includes(plant.point)) || !(plant.weight === undefined || (Number.isFinite(plant.weight) && plant.weight >= 0 && plant.weight <= 1)) || !(plant.blend === undefined || (Number.isFinite(plant.blend) && plant.blend >= 0))) out.push(`${name}: role "${role}" at beat ${key.beat}: plant ${limb} needs a limb (${LIMBS.join(", ")}), an on of role:<another role>, bed or floor, a point (${PLANT_POINTS.join(", ")}), weight 0–1 and blend in beats.`);
    }
  }
  if (v.clearance && !(v.clearance.min === undefined || (Number.isFinite(v.clearance.min) && v.clearance.min >= 0))) out.push(`${name}: clearance.min must be a distance in metres.`);
  if (v.content) {
    const c = v.content;
    if (!(c.motion === undefined || ["static", "cyclic", "repetitive"].includes(c.motion)) || !(c.contact === undefined || ["none", "incidental", "sustained"].includes(c.contact)) || !(c.witness === undefined || ["fine", "private"].includes(c.witness))) out.push(`${name}: content needs motion (static, cyclic, repetitive), contact (none, incidental, sustained) and witness (fine, private).`);
  }
  const AT = ["front", "behind", "left", "right", "over"];
  const allAnchors = anchorsOf(v as Interaction);
  for (const [role, a] of Object.entries(allAnchors)) {
    if (!a || !AT.includes(a.at) || !(a.distance === undefined || (Number.isFinite(a.distance) && a.distance >= 0)) || !(a.lift === undefined || Number.isFinite(a.lift)) || !(a.angle === undefined || Number.isFinite(a.angle))) out.push(`${name}: anchor for "${role}" needs a role, an at (${AT.join(", ")}) and numeric distance, lift and angle.`);
    else if (a.role === role) out.push(`${name}: "${role}" can't be anchored to itself.`);
    else if (!v.roles?.[a.role] || !v.roles?.[role]) out.push(`${name}: anchor for "${role}" names a role with no keyframes.`);
  }
  for (const start of Object.keys(allAnchors)) {
    let r = allAnchors[start]?.role;
    for (let hops = 0; r && hops < 32; hops++) {
      if (r === start) { out.push(`${name}: anchors form a loop through "${start}".`); break; }
      r = allAnchors[r]?.role;
    }
  }
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

const LAYERS: string[] = ["underwear", "base", "mid", "outer", "footwear", "accessories"];
const REGIONS: string[] = ["torso", "upperArms", "forearms", "hips", "thighs", "calves", "feet", "neck", "wrists"];

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A role's pose at a beat, blending between keyframes. Missing joints are neutral. */
export function poseAt(def: Interaction, role: string, beat: number): FullPose {
  const keys = def.roles[role] ?? [];
  const base = baselineOf(def, role);
  if (!keys.length) return { ...base, emote: "", held: "", face: "", plant: {} };
  const playing = beat;
  beat = keyedBeat(def, beat);
  const beat0 = beat;
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
  const pose = Object.fromEntries((Object.keys(base) as (keyof typeof NEUTRAL)[]).map((field) => {
    const x = a[field] ?? base[field];
    const y = next[field] ?? base[field];
    return [field, Array.isArray(x) ? x.map((n, i) => mix(n, (y as number[])[i], t)) : mix(x, y as number, t)];
  })) as Required<Omit<Pose, "emote" | "held" | "face" | "plant">>;
  let emote = "";
  let held: HeldItem = "";
  let face: FaceView | "" = "";
  for (const k of keys) if (k.beat <= b) { if (k.emote !== undefined) emote = k.emote; if (k.held !== undefined) held = k.held; if (k.face !== undefined) face = k.face; }
  oscillate(def, role, playing, pose);
  return { ...pose, emote, held, face, plant: plantsAt(keys, beat0, def) };
}

/**
 * Each limb's plant at a beat. A plant starts at its key and ramps in over its `blend` beats (default 1,
 * from the weight before it), then holds until a later key changes it. Weight 0 releases it.
 */
function plantsAt(keys: Key[], beat: number, def: Interaction): PlantState {
  void def;
  const out: PlantState = {};
  for (const limb of LIMBS) {
    type Entry = { beat: number; on: string; point?: string; weight?: number; blend?: number };
    const entries: Entry[] = keys.filter((k) => k.plant?.[limb]).map((k) => ({ beat: k.beat, ...k.plant![limb]! }));
    const ramp = (e: Entry, from: number, at: number) => {
      const target = Math.max(0, Math.min(1, e.weight ?? 1));
      const blend = e.blend ?? 1;
      return from + (target - from) * smooth(blend > 0 ? Math.min(1, Math.max(0, (at - e.beat) / blend)) : 1);
    };
    let start = 0, current: Entry | null = null;
    for (const e of entries) {
      if (e.beat > beat) break;
      if (current) start = ramp(current, start, e.beat);
      current = e;
    }
    if (!current) continue;
    const weight = ramp(current, start, beat);
    if (weight > 0) out[limb] = { on: current.on, point: current.point ?? "hand", weight };
  }
  return out;
}

/** Adds the role's oscillators to a pose, in place. */
function oscillate(def: Interaction, role: string, beat: number, pose: Record<string, unknown>) {
  const list = def.oscillators?.[role];
  if (!list?.length) return;
  const order = Object.keys(def.roles).indexOf(role);
  for (const o of list) {
    const [field, index] = o.channel.split(".");
    const phase = o.phase === "auto" ? (order % 2) / 2 : o.phase ?? 0;
    const wobble = o.amplitude * Math.sin(2 * Math.PI * (beat / o.period + phase));
    const value = pose[field];
    if (Array.isArray(value)) value[Number(index ?? 0)] += wobble;
    else if (typeof value === "number") pose[field] = value + wobble;
  }
}

const TOP_KEYS = ["mirror", "content", "clearance", "camera", "anchors", "requires", "id", "label", "emoji", "category", "description", "target", "cutaway", "wardrobe", "outfitAt", "water", "people", "beat", "length", "loop", "stagger", "formation", "roles", "oscillators", "segments"];
const KEY_FIELDS = new Set(["beat", "emote", "held", "face", "plant", ...Object.keys(NEUTRAL)]);

/** Things that still load but are probably mistakes: unknown keys, wild angles, a placement for a role that isn't there. */
export function interactionWarnings(value: unknown): string[] {
  const v = value as Partial<Interaction> | null;
  if (!v || typeof v !== "object") return [];
  const name = v.id ? `"${v.id}"` : "Interaction";
  const out: string[] = [];
  for (const key of Object.keys(v)) if (!TOP_KEYS.includes(key)) out.push(`${name}: unknown key "${key}" (ignored).`);
  const roles = new Set(Object.keys(v.roles ?? {}));
  for (const [role, keys] of Object.entries(v.roles ?? {})) {
    for (const key of Array.isArray(keys) ? keys : []) {
      for (const [field, val] of Object.entries(key)) {
        if (!KEY_FIELDS.has(field)) out.push(`${name}: role "${role}" at beat ${key.beat}: unknown channel "${field}" (ignored).`);
        else if ((typeof val === "number" && Math.abs(val) > 360 && field !== "beat") || (Array.isArray(val) && val.some((n) => typeof n === "number" && Math.abs(n) > 360))) out.push(`${name}: role "${role}" at beat ${key.beat}: ${field} is out of range (degrees; metres for bob and move).`);
      }
    }
  }
  if (v.requires?.tier === undefined && v.requires?.minAge === undefined) out.push(`${name}: declare requires.tier (casual, affectionate or intimate) or requires.minAge.`);
  const undressed = ([v.wardrobe, ...Object.values(v.wardrobe?.roles ?? {})].flatMap((step) => step?.remove ?? []) as ClothingRegion[]).filter((r) => ADULT_REGIONS.includes(r));
  const removes = [v.wardrobe, ...Object.values(v.wardrobe?.roles ?? {})].flatMap((step) => step?.remove ?? []) as string[];
  const lower = undressed.length > 0 || removes.some((r) => r === "underwear" || r === "base") || !!v.requires?.wardrobe?.length;
  if (lower && v.wardrobe?.fallback === undefined && v.requires?.minAge === undefined && v.requires?.tier !== "intimate") out.push(`${name}: it undresses; declare wardrobe.fallback ("dressed" or "hide") or requires.minAge.`);
  const declared = v.requires?.wardrobe ?? [];
  if (undressed.some((r) => !declared.includes(r))) out.push(`${name}: it undresses ${undressed.join(", ")}; declare that in requires.wardrobe (it is adult-only either way).`);
  const tier = v.requires?.tier ?? (v.requires?.minAge !== undefined ? "minAge" : "none");
  if (tier === "casual" && v.content?.motion === "repetitive") out.push(`${name}: repetitive motion doesn't read as casual; raise the tier.`);
  if (tier === "casual" && v.content?.contact === "sustained") out.push(`${name}: sustained contact doesn't read as casual; raise the tier.`);
  // Contact the keyframes imply: a limb held on another body for a long stretch is sustained contact, declared or not.
  const held = longestPlantHold(v as Interaction);
  if (held >= 6 && v.content?.contact === undefined && tier === "casual") out.push(`${name}: a limb is held on another body for ${Math.round(held)} beats (sustained contact); declare content.contact and a tier that fits.`);
  if (held >= 6 && (v.content?.contact === "none" || v.content?.contact === "incidental")) out.push(`${name}: content.contact says ${v.content.contact}, but a limb is held on another body for ${Math.round(held)} beats.`);
  // A hand plant on a hand is the mutual midpoint only if the other body plants a hand back.
  const handsBack = (from: string, onto: string) => (Array.isArray(v.roles?.[from]) ? v.roles![from] : []).some((k) => Object.values(k.plant ?? {}).some((q) => q?.on === `role:${onto}` && ["hand", "handL", "handR"].includes(q.point ?? "hand") && (q.weight ?? 1) > 0));
  const flagged = new Set<string>();
  for (const [role, keys] of Object.entries(v.roles ?? {})) for (const key of Array.isArray(keys) ? keys : []) for (const [limb, plant] of Object.entries(key.plant ?? {})) {
    if (typeof plant?.on !== "string" || !plant.on.startsWith("role:") || (plant.point ?? "hand") !== "hand") continue;
    const other = plant.on.slice(5);
    if (!handsBack(other, role) && !flagged.has(`${role}>${other}`)) {
      flagged.add(`${role}>${other}`);
      out.push(`${name}: role "${role}" at beat ${key.beat}: plant ${limb} on "${other}" uses point "hand" (the mutual midpoint), but "${other}" never plants a hand back, so it falls back to their opposite hand; plant a hand back, or name handL / handR.`);
    }
  }
  if (v.clearance?.min !== undefined && v.clearance.min < 0.05) out.push(`${name}: clearance.min is under 5 cm, which lets bodies intersect.`);
  for (const [role, place] of Object.entries(v.target?.roles ?? {})) if (place?.posture && !["stand", "sit", "lie", "inside", "kneel", "allfours"].includes(place.posture)) out.push(`${name}: role "${role}" has a posture with no placement rule.`);
  for (const role of Object.keys(v.target?.roles ?? {})) if (!roles.has(role)) out.push(`${name}: target.roles names "${role}", which has no keyframes.`);
  for (const role of Object.keys(v.oscillators ?? {})) if (!roles.has(role)) out.push(`${name}: oscillators name "${role}", which has no keyframes.`);
  return out;
}

/** The longest stretch, in beats, that any role holds a limb (weight 0.5 or more) on another role's body. */
export function longestPlantHold(def: Pick<Interaction, "roles" | "length">): number {
  let longest = 0;
  for (const keys of Object.values(def.roles ?? {})) {
    for (const limb of LIMBS) {
      let since: number | null = null;
      for (const key of Array.isArray(keys) ? keys : []) {
        const plant = key.plant?.[limb];
        if (!plant) continue;
        const strong = (plant.weight ?? 1) >= 0.5 && plant.on.startsWith("role:");
        if (strong && since === null) since = key.beat;
        else if (!strong && since !== null) { longest = Math.max(longest, key.beat - since); since = null; }
      }
      if (since !== null) longest = Math.max(longest, def.length - since);
    }
  }
  return longest;
}

// ── Mirroring ────────────────────────────────────────────────────────────────

const swapSide = (name: string) => name.replace(/L(?=$|\.)/, "\0").replace(/R(?=$|\.)/, "L").replace("\0", "R");
/** Channels whose sign flips in a mirror (a turn to the right becomes a turn to the left). */
const FLIPS = new Set(["tilt", "twist", "turn", "move.0", "head.1", "head.2", "neck.1", "neck.2"]);

const mirrorKey = (key: Key): Key => {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(key)) {
    if (/^(arm|leg|elbow|knee|wrist|forearm|ankle)[LR]$/.test(field)) out[swapSide(field)] = value; // already side-relative: swap, don't negate
    else if (field === "tilt" || field === "twist" || field === "turn") out[field] = -(value as number) || 0;
    else if (field === "move") out[field] = [-(value as [number, number])[0] || 0, (value as [number, number])[1]];
    else if (field === "head" || field === "neck") { const [nod, turn, tilt] = value as [number, number, number]; out[field] = [nod, -turn || 0, -tilt || 0]; }
    else if (field === "plant") {
      const plant: Record<string, unknown> = {};
      for (const [limb, p] of Object.entries(value as Record<string, Plant>)) plant[swapSide(limb)] = { ...p, ...(p.point === "handL" || p.point === "handR" ? { point: swapSide(p.point) } : {}) };
      out[field] = plant;
    } else out[field] = value;
  }
  return out as unknown as Key;
};

/**
 * The same action left to right: every left and right channel swapped, turns, tilts, twists, head and neck yaw
 * and roll and the sideways step negated, plants moved to the other limb (and handL / handR swapped), formation
 * spots and furniture sides flipped. Returns a copy with id `<id>-mirrored`; it carries no `mirror` of its own.
 */
export function mirrorInteraction(def: Interaction): Interaction {
  const { mirror: _unused, ...rest } = def;
  void _unused;
  const copy = structuredClone(rest) as Interaction;
  copy.id = `${def.id}-mirrored`;
  copy.label = `${def.label} (mirrored)`;
  copy.roles = Object.fromEntries(Object.entries(def.roles).map(([role, keys]) => [role, keys.map(mirrorKey)]));
  if (def.oscillators) {
    copy.oscillators = Object.fromEntries(Object.entries(def.oscillators).map(([role, list]) => [role, list.map((o) => {
      const [field, index] = o.channel.split(".");
      const flips = FLIPS.has(o.channel) || (index === undefined && FLIPS.has(field));
      return { ...o, channel: swapSide(field) + (index !== undefined ? `.${index}` : ""), amplitude: flips ? -o.amplitude || 0 : o.amplitude };
    })]));
  }
  const f = copy.formation;
  if (f.type === "spots") f.spots = f.spots.map((spot) => ({ ...spot, at: [-spot.at[0] || 0, spot.at[1]] as [number, number], facing: -spot.facing || 0 }));
  else if (f.type === "ring" && f.spin) f.spin = -f.spin;
  const flipSide = (side?: "left" | "right" | "center") => (side === "left" ? "right" : side === "right" ? "left" : side);
  const flipAnchor = (a: Anchor): Anchor => ({ ...a, at: a.at === "left" ? "right" : a.at === "right" ? "left" : a.at, ...(a.angle !== undefined ? { angle: -a.angle || 0 } : {}) });
  if (copy.target?.roles) {
    copy.target.roles = Object.fromEntries(Object.entries(copy.target.roles).map(([role, place]) => [role, {
      ...place,
      ...(place.side ? { side: flipSide(place.side) } : {}),
      ...(place.facing !== undefined ? { facing: -place.facing || 0 } : {}),
      ...(place.anchor ? { anchor: flipAnchor(place.anchor) } : {}),
    }]));
  }
  if (copy.anchors) copy.anchors = Object.fromEntries(Object.entries(copy.anchors).map(([role, a]) => [role, flipAnchor(a)]));
  if (copy.camera?.offset) copy.camera.offset = [-copy.camera.offset[0] || 0, copy.camera.offset[1]];
  return copy;
}
