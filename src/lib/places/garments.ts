// What people can wear in the Places world. Each garment is a mesh in
// public/places/body.glb (built by tools/places/build_body.py from MakeHuman
// clothes or a draped pattern); its texture is grey, so any colour works.
import type { Character } from "./character";

/** Where a garment goes; a person wears one garment per slot. */
export type Slot = "top" | "bottom" | "feet";

export interface Garment {
  id: string;
  label: string;
  slot: Slot;
}

export interface Worn {
  garment: string;
  color: string;
}

export const GARMENTS: Garment[] = [
  { id: "tee", label: "T-shirt", slot: "top" },
  { id: "fitted_tee", label: "Fitted T-shirt", slot: "top" },
  { id: "jeans", label: "Jeans", slot: "bottom" },
  { id: "slim_jeans", label: "Slim jeans", slot: "bottom" },
  { id: "a_line_skirt", label: "A-line skirt", slot: "bottom" },
  { id: "shoes", label: "Shoes", slot: "feet" },
];

export const SLOTS: Record<Slot, { label: string; optional: boolean }> = {
  top: { label: "Top", optional: false },
  bottom: { label: "Bottom", optional: false },
  feet: { label: "Shoes", optional: true },
};

export const SKIRTS = new Set(["a_line_skirt"]);
export const SHOE_COLORS = ["#292524", "#57534e", "#78350f", "#f5f5f4", "#1e3a8a", "#be123c"];

const byId = new Map(GARMENTS.map((g) => [g.id, g]));
export const garment = (id: string) => byId.get(id);

/** What a character wears: their saved list, or one made from the top and bottom colours. */
export function outfitOf(look: Character): Worn[] {
  const saved = (look.wearing ?? []).filter((w) => byId.has(w.garment));
  const has = (slot: Slot) => saved.some((w) => byId.get(w.garment)!.slot === slot);
  if (has("top") && has("bottom")) return saved;
  const fitted = look.figure === "feminine";
  return [
    { garment: fitted ? "fitted_tee" : "tee", color: look.top },
    { garment: look.skirt ? "a_line_skirt" : fitted ? "slim_jeans" : "jeans", color: look.bottom },
    { garment: "shoes", color: SHOE_COLORS[0] },
  ];
}

/** The outfit with `slot` set to this garment (or emptied, for an optional slot). */
export function withSlot(worn: Worn[], slot: Slot, next: Worn | null): Worn[] {
  const rest = worn.filter((w) => garment(w.garment)?.slot !== slot);
  return next ? [...rest, next] : rest;
}

/** The v1 fields that drawn faces, avatars and the box body still read, kept in step with the outfit. */
export function legacyFields(worn: Worn[]): Pick<Character, "top" | "bottom" | "skirt"> {
  const top = worn.find((w) => garment(w.garment)?.slot === "top");
  const bottom = worn.find((w) => garment(w.garment)?.slot === "bottom");
  return { top: top?.color ?? "#2563eb", bottom: bottom?.color ?? "#334155", skirt: !!bottom && SKIRTS.has(bottom.garment) };
}
