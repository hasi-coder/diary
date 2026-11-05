// How a person looks in the Places world. Stored as `Profile.character`; any
// field left out is filled in from the profile (age from the birthday, body
// shape from the relationship words), so everyone has a character.
import type { PhotoSlot, Profile } from "../api";
import type { Worn } from "./garments";

export type Age = "child" | "teen" | "adult" | "elder";
export type Figure = "feminine" | "masculine" | "neutral";
export type Build = "slim" | "average" | "broad";
export type Anatomy = "auto" | "none" | "vulva" | "penis";
export type HairStyle = "short" | "long" | "bun" | "curly" | "bald";
/**
 * The head images. `left` and `right` are 90° profiles with the nose toward that
 * edge; `frontLeft` and `frontRight` are turned 45° that way. The rest are for
 * people lying down, seen from the raised camera: `up` is the face looking at the
 * ceiling, `sleeping` the same with closed eyes, `sleepingLeft` / `sleepingRight`
 * closed-eye profiles on a pillow, `down` the head turned face-down. Every view but
 * the first four is optional: the fallback stands in until an image exists.
 */
export type FaceView = "front" | "frontLeft" | "frontRight" | "left" | "right" | "back" | "up" | "sleeping" | "sleepingLeft" | "sleepingRight" | "down";

export interface Character {
  age: Age;
  /** Body shape of the figure only; pronouns and genders stay on the profile. */
  figure: Figure;
  build: Build;
  skin: string;
  hair: { style: HairStyle; color: string };
  top: string;
  bottom: string;
  skirt?: boolean;
  glasses?: boolean;
  beard?: boolean;
  /** Adult resting anatomy; auto follows the figure preset. Independent of gender. */
  anatomy?: Anatomy;
  /** Fine body sliders (-1 … 1, `shape` 0 feminine … 1 masculine); left out, `figure` and `build` decide. */
  body?: BodySliders;
  /** What they wear; left out, a tee and jeans (or a skirt) in the top and bottom colours. */
  wearing?: Worn[];
}

export interface BodySliders {
  shape?: number;
  weight?: number;
  muscle?: number;
  height?: number;
  bust?: number;
}

export const AGES: Record<Age, { label: string; height: number }> = {
  child: { label: "Child", height: 1.12 },
  teen: { label: "Teen", height: 1.55 },
  adult: { label: "Adult", height: 1.74 },
  elder: { label: "Elder", height: 1.62 },
};

export const FIGURES: Record<Figure, string> = { feminine: "Feminine", masculine: "Masculine", neutral: "Neutral" };
export const BUILDS: Record<Build, string> = { slim: "Slim", average: "Average", broad: "Broad" };
export const HAIR_STYLES: Record<HairStyle, string> = { short: "Short", long: "Long", bun: "Bun", curly: "Curly", bald: "Bald" };
/**
 * Every head view: its photo slot, a label, what it shows (for people and the
 * face-generation skill) and what shows in its place without an image. To add a
 * view, add it here and to the Rust `Faces` and `PhotoSlot`, `set_person_faces`,
 * and the generate-face-views skill; the editor and the world pick it up from here.
 */
export const FACE_DEFS: Record<FaceView, { slot: string; label: string; hint: string; fallback?: FaceView }> = {
  front: { slot: "face_front", label: "Front", hint: "front face view" },
  frontLeft: { slot: "face_front_left", label: "45° left", hint: "45° left face view", fallback: "front" },
  frontRight: { slot: "face_front_right", label: "45° right", hint: "45° right face view", fallback: "front" },
  left: { slot: "face_left", label: "Left", hint: "left face view" },
  right: { slot: "face_right", label: "Right", hint: "right face view" },
  back: { slot: "face_back", label: "Back", hint: "back-of-head view" },
  up: { slot: "face_up", label: "Looking up", hint: "face looking up at the ceiling (lying on the back)", fallback: "front" },
  sleeping: { slot: "face_sleeping", label: "Sleeping", hint: "sleeping face, eyes closed, lying on the back", fallback: "up" },
  sleepingLeft: { slot: "face_sleeping_left", label: "Sleeping, left", hint: "sleeping profile, eyes closed, nose to the left", fallback: "left" },
  sleepingRight: { slot: "face_sleeping_right", label: "Sleeping, right", hint: "sleeping profile, eyes closed, nose to the right", fallback: "right" },
  down: { slot: "face_down", label: "Looking down", hint: "head turned down, face toward the bed", fallback: "back" },
};
export const FACE_VIEWS = Object.keys(FACE_DEFS) as FaceView[];
/** The view shown when a person has no image for this one. */
export const FALLBACK_VIEW: Partial<Record<FaceView, FaceView>> = Object.fromEntries(FACE_VIEWS.filter((v) => FACE_DEFS[v].fallback).map((v) => [v, FACE_DEFS[v].fallback]));
/** The photo slot that holds each view. */
export const FACE_SLOTS = Object.fromEntries(FACE_VIEWS.map((v) => [v, FACE_DEFS[v].slot])) as Record<FaceView, PhotoSlot>;

export const SKIN_TONES = ["#f6d5bf", "#e8b796", "#e0ac85", "#c68e64", "#a5683f", "#7a4a2e", "#5a3420"];
/** The Monk Skin Tone Scale, lightest to deepest (Ellis Monk and Google, CC BY 4.0: skintone.google). */
export const MONK_SKIN_TONES = ["#f6ede4", "#f3e7db", "#f7ead0", "#eadaba", "#d7bd96", "#a07e56", "#825c43", "#604134", "#3a312a", "#292420"];
export const HAIR_COLORS = ["#0c0a09", "#3a2214", "#6b3f1d", "#a16207", "#d6a75c", "#c2410c", "#d4d4d4"];
export const OUTFIT_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#16a34a", "#f59e0b", "#ef4444", "#db2777", "#9333ea", "#334155", "#f8fafc"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Age group from a "YYYY-MM-DD" birthday, if the year is known. */
export function ageFromBirthday(birthday: string, now = new Date()): Age | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  let years = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) years--;
  return years < 13 ? "child" : years < 20 ? "teen" : years < 65 ? "adult" : "elder";
}

/** The profile's character with every field filled in. */
export function characterOf(profile: Profile): Character {
  const saved = (profile.character ?? {}) as Partial<Character>;
  // Unsigned shifts (>>>): the hash can be over 2^31, and >> would make it negative.
  const h = hash(profile.id);
  const figure: Figure = profile.terms === "feminine" ? "feminine" : profile.terms === "masculine" ? "masculine" : "neutral";
  const age = saved.age ?? ageFromBirthday(profile.birthday) ?? "adult";
  return {
    age,
    figure: saved.figure ?? figure,
    build: saved.build ?? "average",
    skin: saved.skin ?? SKIN_TONES[h % SKIN_TONES.length],
    hair: {
      style: saved.hair?.style ?? (figure === "feminine" ? "long" : "short"),
      color: saved.hair?.color ?? (age === "elder" ? "#d4d4d4" : HAIR_COLORS[(h >>> 3) % 4]),
    },
    top: saved.top ?? OUTFIT_COLORS[(h >>> 5) % OUTFIT_COLORS.length],
    bottom: saved.bottom ?? "#334155",
    skirt: saved.skirt ?? false,
    glasses: saved.glasses ?? false,
    beard: saved.beard ?? false,
    ...(saved.anatomy ? { anatomy: saved.anatomy } : {}),
    ...(saved.body ? { body: saved.body } : {}),
    ...(saved.wearing ? { wearing: saved.wearing } : {}),
  };
}
