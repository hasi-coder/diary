// How a person looks in the Places world. Stored as `Profile.character`; any
// field left out is filled in from the profile (age from the birthday, body
// shape from the relationship words), so everyone has a character.
import type { Profile } from "../api";
import type { Worn } from "./garments";

export type Age = "child" | "teen" | "adult" | "elder";
export type Figure = "feminine" | "masculine" | "neutral";
export type Build = "slim" | "average" | "broad";
export type HairStyle = "short" | "long" | "bun" | "curly" | "bald";
/** The four head images; `left` and `right` are profiles with the nose toward that edge. */
export type FaceView = "front" | "left" | "right" | "back";

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
export const FACE_VIEWS: FaceView[] = ["front", "left", "right", "back"];

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
      color: saved.hair?.color ?? (age === "elder" ? "#d4d4d4" : HAIR_COLORS[(h >> 3) % 4]),
    },
    top: saved.top ?? OUTFIT_COLORS[(h >> 5) % OUTFIT_COLORS.length],
    bottom: saved.bottom ?? "#334155",
    skirt: saved.skirt ?? false,
    glasses: saved.glasses ?? false,
    beard: saved.beard ?? false,
    ...(saved.body ? { body: saved.body } : {}),
    ...(saved.wearing ? { wearing: saved.wearing } : {}),
  };
}
