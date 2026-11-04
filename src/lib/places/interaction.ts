// Things people do together in the Places world (dance, hug, high-five, …),
// described as JSON (./interactions/*.json): who takes part, where each person
// stands, and each role's poses over time as keyframes. See
// ./interactions/README.md for the format.

/** A body pose. Angles in degrees; anything left out is the neutral standing pose. */
export interface Pose {
  /** [forward, out]: forward 90 = arm straight ahead, 180 = straight up; out 90 = straight out to the side. */
  armL?: [number, number];
  armR?: [number, number];
  /** Thigh forward (negative = backward). */
  legL?: number;
  legR?: number;
  /** Knee bend. */
  kneeL?: number;
  kneeR?: number;
  /** Upper body lean forward, and tilt to the person's right. */
  lean?: number;
  tilt?: number;
  /** Turn on the spot, added to the way the role faces. */
  turn?: number;
  /** Rise (metres): a bounce, a hop. */
  bob?: number;
  /** Step away from the role's spot (metres): [right, forward] in the person's own frame. */
  move?: [number, number];
  /** A symbol over the head from this key on ("♪", "👏"); "" clears it. */
  emote?: string;
}

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

export interface Interaction {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
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

const NEUTRAL: Required<Omit<Pose, "emote">> = {
  armL: [0, 8],
  armR: [0, 8],
  legL: 0,
  legR: 0,
  kneeL: 0,
  kneeR: 0,
  lean: 0,
  tilt: 0,
  turn: 0,
  bob: 0,
  move: [0, 0],
};
export type FullPose = Required<Omit<Pose, "emote">> & { emote: string };

/** Problems that stop an interaction from loading; [] when it's usable. */
export function interactionProblems(value: unknown): string[] {
  const v = value as Partial<Interaction> | null;
  if (!v || typeof v !== "object") return ["An interaction is a JSON object."];
  const out: string[] = [];
  const name = v.id ? `"${v.id}"` : "Interaction";
  if (!v.id || !v.label) out.push(`${name}: needs an id and a label.`);
  if (!(v.beat! > 0) || !(v.length! > 0)) out.push(`${name}: beat and length must be positive.`);
  if (!(v.people?.min! >= 1) || !(v.people?.max! >= v.people?.min!)) out.push(`${name}: people needs min ≥ 1 and max ≥ min.`);
  const f = v.formation;
  const roles = f?.type === "spots" ? f.spots.map((s) => s.role) : f?.type === "ring" || f?.type === "stay" ? [f.role] : null;
  if (!roles) out.push(`${name}: formation type must be spots, ring or stay.`);
  if (f?.type === "spots" && v.people && f.spots.length < v.people.max) out.push(`${name}: ${v.people.max} people need ${v.people.max} spots.`);
  for (const r of roles ?? []) {
    const keys = v.roles?.[r];
    if (!Array.isArray(keys) || keys.length === 0) out.push(`${name}: role "${r}" has no keyframes.`);
    else if (keys.some((k, i) => typeof k.beat !== "number" || (i > 0 && k.beat < keys[i - 1].beat))) out.push(`${name}: role "${r}" keyframes need beats in order.`);
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A role's pose at a beat, blending between keyframes. Missing joints are neutral. */
export function poseAt(def: Interaction, role: string, beat: number): FullPose {
  const keys = def.roles[role] ?? [];
  if (!keys.length) return { ...NEUTRAL, emote: "" };
  const b = def.loop ? ((beat % def.length) + def.length) % def.length : Math.min(Math.max(beat, 0), def.length);
  let i = keys.length - 1;
  while (i > 0 && keys[i].beat > b) i--;
  const a = keys[i];
  // After the last key a loop blends back into the first, one round later.
  const next = keys[i + 1] ?? (def.loop ? { ...keys[0], beat: keys[0].beat + def.length } : a);
  const span = next.beat - a.beat;
  const t = b < a.beat ? 0 : span > 0 ? smooth(Math.min(1, (b - a.beat) / span)) : 0;
  const pick = <K extends keyof typeof NEUTRAL>(k: K) => [a[k] ?? NEUTRAL[k], next[k] ?? NEUTRAL[k]] as const;
  const pair = (k: "armL" | "armR" | "move"): [number, number] => {
    const [x, y] = pick(k) as readonly [[number, number], [number, number]];
    return [mix(x[0], y[0], t), mix(x[1], y[1], t)];
  };
  const one = (k: "legL" | "legR" | "kneeL" | "kneeR" | "lean" | "tilt" | "turn" | "bob") => {
    const [x, y] = pick(k) as readonly [number, number];
    return mix(x, y, t);
  };
  let emote = "";
  for (const k of keys) if (k.beat <= b && k.emote !== undefined) emote = k.emote;
  return {
    armL: pair("armL"),
    armR: pair("armR"),
    legL: one("legL"),
    legR: one("legR"),
    kneeL: one("kneeL"),
    kneeR: one("kneeR"),
    lean: one("lean"),
    tilt: one("tilt"),
    turn: one("turn"),
    bob: one("bob"),
    move: pair("move"),
    emote,
  };
}
