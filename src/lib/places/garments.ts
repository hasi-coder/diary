import type { Character } from "./character";
import { CLOTHING_CATALOG } from "./clothingCatalog";
import { SRI_LANKAN_GARMENTS } from "./sriLankanClothing";
import { normalizeClothingFit } from "./clothingFit";
import type { ClothingLayer, ClothingStyle, Garment, Slot, Worn } from "./clothingTypes";
export type { ClothingFit, ClothingLayer, ClothingStyle, ClothingRecipe, ClothingRegion, Garment, Slot, Worn } from "./clothingTypes";

export const CLOTHING_LAYERS: Record<ClothingLayer, { label: string; description: string }> = {
  underwear: { label: "Underwear", description: "Foundation pieces, undershirts and underlayers" },
  base: { label: "Base clothes", description: "Tops, bottoms, dresses and uniforms" },
  mid: { label: "Mid layers", description: "Knitwear, cardigans and warm layers" },
  outer: { label: "Outerwear", description: "Jackets, coats and weather layers" },
  footwear: { label: "Footwear", description: "Socks and shoes, worn independently" },
  accessories: { label: "Accessories", description: "Ties, scarves, belts and wristwear" },
};
export const CLOTHING_STYLES: Record<ClothingStyle, string> = { feminine: "Feminine", masculine: "Masculine", neutral: "Neutral" };
const ALL_STYLES: ClothingStyle[] = ["feminine", "masculine", "neutral"];
const legacy = (id: string, label: string, slot: Slot, layer: ClothingLayer, covers: Garment["covers"], depth = 0): Garment => ({ id, label, slot, layer, covers, depth, styles: ALL_STYLES, category: id });

/** Saved ids remain valid. The new catalogue adds ten cuts per layer/style. */
export const GARMENTS: Garment[] = [
  legacy("tee", "T-shirt", "top", "base", ["torso", "upperArms"]),
  legacy("fitted_tee", "Fitted T-shirt", "top", "base", ["torso", "upperArms"]),
  legacy("jeans", "Jeans", "bottom", "base", ["hips", "thighs", "calves"]),
  legacy("slim_jeans", "Slim jeans", "bottom", "base", ["hips", "thighs", "calves"]),
  legacy("a_line_skirt", "A-line skirt", "bottom", "base", ["hips", "thighs"]),
  legacy("shoes", "Shoes", "feet", "footwear", ["feet"], 1),
  { ...legacy("underwear_vest", "Underwear vest", "underwearTop", "underwear", ["torso"], 1), recipe: { kind: "shell", part: "top", sleeves: 0, length: 0.82, neckline: 0.06 } },
  { ...legacy("boxer_briefs", "Boxer briefs", "underwearBottom", "underwear", ["hips", "thighs"]), recipe: { kind: "shell", part: "bottom", length: 0.22 } },
  ...CLOTHING_CATALOG,
  ...SRI_LANKAN_GARMENTS,
];

export const SLOTS: Record<Slot, { label: string; optional: boolean; layer: ClothingLayer }> = {
  bra: { label: "Foundation top", optional: true, layer: "underwear" },
  underwearTop: { label: "Underwear top", optional: true, layer: "underwear" },
  underwearBottom: { label: "Underwear bottom", optional: true, layer: "underwear" },
  underwearLegs: { label: "Underlayers", optional: true, layer: "underwear" },
  top: { label: "Top", optional: true, layer: "base" }, bottom: { label: "Bottom", optional: true, layer: "base" }, dress: { label: "Dress / tunic", optional: true, layer: "base" },
  midTop: { label: "Mid top", optional: true, layer: "mid" }, midBottom: { label: "Mid bottom", optional: true, layer: "mid" },
  outerTop: { label: "Jacket", optional: true, layer: "outer" }, outerBottom: { label: "Outer bottom", optional: true, layer: "outer" }, outerDress: { label: "Coat", optional: true, layer: "outer" },
  socks: { label: "Socks", optional: true, layer: "footwear" }, feet: { label: "Shoes", optional: true, layer: "footwear" },
  neckwear: { label: "Tie / bow", optional: true, layer: "accessories" }, scarf: { label: "Scarf", optional: true, layer: "accessories" }, waistwear: { label: "Belt / sash", optional: true, layer: "accessories" }, wristwear: { label: "Wristwear", optional: true, layer: "accessories" },
};

const byId = new Map(GARMENTS.map((g) => [g.id, g]));
export const garment = (id: string) => byId.get(id);
export const garmentsFor = (layer: ClothingLayer, style: ClothingStyle | "all" = "all") => GARMENTS.filter((g) => g.layer === layer && (style === "all" || g.styles.includes(style)));
export const SHOE_COLORS = ["#292524", "#57534e", "#78350f", "#f5f5f4", "#1e3a8a", "#be123c"];
export const SKIRTS = new Set(GARMENTS.filter((g) => g.id === "a_line_skirt" || g.recipe?.kind === "skirt" || g.recipe?.kind === "dress" || (g.recipe?.kind === "drape" && g.recipe.drape !== "dupatta")).map((g) => g.id));

/** Socks sit below trousers, shoes above them; a bra sits below a camisole. */
export function clothingOrder(g: Garment): number {
  if (g.slot === "socks") return 5;
  if (g.slot === "feet") return 25;
  if (g.slot === "midBottom") return 15;
  return { underwear: 0, base: 20, mid: 30, outer: 40, footwear: 25, accessories: 50 }[g.layer] + g.depth;
}
export const clothingOffset = (g: Garment) => g.slot === "feet" ? 0.012 : g.slot === "socks" ? 0.006 : 0.004 + clothingOrder(g) * 0.0008;
const clashes = (a: Garment, b: Garment) => a.slot === b.slot || (clothingOrder(a) === clothingOrder(b) && a.covers.some((region) => b.covers.includes(region)));

export function clothingProblems(worn: Worn[]): string[] {
  const problems: string[] = [];
  worn.forEach((item, i) => {
    const a = garment(item.garment);
    if (!a) { problems.push(`Unknown garment: ${item.garment}.`); return; }
    for (const previous of worn.slice(0, i)) {
      const b = garment(previous.garment);
      if (b && clashes(a, b)) problems.push(`${a.label} and ${b.label} occupy the same clothing layer and area.`);
    }
  });
  return problems;
}

/** Last selected piece replaces clashes on its own layer, preserving other layers. */
export function normalizeWorn(worn: Worn[]): Worn[] {
  let result: Worn[] = [];
  for (const item of worn) {
    const definition = garment(item.garment);
    if (!definition) continue;
    result = result.filter((existing) => !clashes(definition, garment(existing.garment)!));
    const copy = { ...item };
    const fit = normalizeClothingFit(item.fit);
    if (fit) copy.fit = fit;
    else delete copy.fit;
    result.push(copy);
  }
  return result.sort((a, b) => clothingOrder(garment(a.garment)!) - clothingOrder(garment(b.garment)!) || a.garment.localeCompare(b.garment));
}

/** The pieces a character wears, bottom layer first.
 *
 * Layer 0 is the bare body: nothing is ever added for them. An explicit empty
 * `wearing` is a nude body, and removing a piece reveals whatever lies beneath
 * it (the next layer down, or skin). Only a character saved before `wearing`
 * existed gets a starting set: underwear, then the old top/bottom colours. */
export function outfitOf(look: Character): Worn[] {
  const fitted = look.figure === "feminine";
  const initial = look.wearing ?? [
    { garment: "underwear_vest", color: "#e2e8f0" }, { garment: "boxer_briefs", color: "#64748b" },
    { garment: fitted ? "fitted_tee" : "tee", color: look.top },
    { garment: look.skirt ? "a_line_skirt" : fitted ? "slim_jeans" : "jeans", color: look.bottom },
    { garment: "shoes", color: SHOE_COLORS[0] },
  ];
  return normalizeWorn(initial);
}

export function withSlot(worn: Worn[], slot: Slot, next: Worn | null): Worn[] {
  const rest = worn.filter((item) => garment(item.garment)?.slot !== slot);
  return normalizeWorn(next ? [...rest, next] : rest);
}

export function legacyFields(worn: Worn[]): Pick<Character, "top" | "bottom" | "skirt"> {
  const ordered = normalizeWorn(worn).reverse();
  const top = ordered.find((w) => garment(w.garment)!.covers.includes("torso"));
  const bottom = ordered.find((w) => garment(w.garment)!.layer !== "accessories" && garment(w.garment)!.covers.includes("hips"));
  return { top: top?.color ?? "#2563eb", bottom: bottom?.color ?? "#334155", skirt: !!bottom && SKIRTS.has(bottom.garment) };
}

/** Strip outer clothes while preserving every selected underwear sub-layer. */
export function underwearOf(look: Character, fallback: Worn[]): Worn[] {
  const selected = outfitOf(look).filter((w) => garment(w.garment)?.layer === "underwear");
  return outfitOf({ ...look, wearing: selected.length ? selected : fallback });
}
