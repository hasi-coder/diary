import type { ClothingLayer, ClothingRecipe, ClothingRegion, ClothingStyle, Garment, Slot } from "./clothingTypes";

type Choice = { category: string; label: string; slot: Slot; recipe: ClothingRecipe; depth?: number };
const top = (category: string, label: string, sleeves = 0.35, length = 1, extra: Partial<ClothingRecipe> = {}, slot: Slot = "top"): Choice => ({ category, label, slot, recipe: { kind: "shell", part: "top", sleeves, length, ...extra } });
const pants = (category: string, label: string, length = 1, extra: Partial<ClothingRecipe> = {}, slot: Slot = "bottom"): Choice => ({ category, label, slot, recipe: { kind: "shell", part: "bottom", length, ...extra } });
const skirt = (category: string, label: string, length = 0.65, flare = 1, pleats = 0, slot: Slot = "bottom"): Choice => ({ category, label, slot, recipe: { kind: "skirt", length, flare, pleats } });
const dress = (category: string, label: string, length = 0.65, sleeves = 0.3, pleats = 0, slot: Slot = "dress"): Choice => ({ category, label, slot, recipe: { kind: "dress", length, sleeves, pleats, flare: 1.1, detail: category === "school_frock" ? "uniform" : undefined } });
const innerTop = (category: string, label: string, length = 0.8, sleeves = 0, neckline = 0.1, bra = false): Choice => ({ ...top(category, label, sleeves, length, { neckline }, bra ? "bra" : "underwearTop"), depth: bra ? 0 : 1 });
const innerBottom = (category: string, label: string, length = 0.18, highWaist = false): Choice => pants(category, label, length, { neckline: highWaist ? 0 : 0.05 }, "underwearBottom");

const UNDERWEAR: Record<ClothingStyle, Choice[]> = {
  feminine: [innerTop("bra", "Cotton bra", 0.45, 0, 0.18, true), innerTop("sports_bra", "Sports bra", 0.55, 0, 0.08, true), innerTop("bralette", "Full-coverage bralette", 0.6, 0, 0.14, true), innerTop("camisole", "Camisole", 0.9, 0, 0.12), innerTop("vest", "Underwear vest", 1, 0, 0.06), innerBottom("briefs", "Cotton briefs", 0.12), innerBottom("boyshorts", "Boyshorts", 0.22), innerBottom("high_waist_briefs", "High-waist briefs", 0.16, true), { ...pants("thermal_leggings", "Thermal underleggings", 1, {}, "underwearLegs"), depth: 2 }, { ...skirt("petticoat", "Petticoat", 0.64, 0.92, 0, "underwearLegs"), depth: 2 }],
  masculine: [innerTop("vest", "Cotton vest", 1, 0, 0.04), innerTop("undershirt", "Short-sleeve undershirt", 1, 0.3, 0.02), innerTop("tank", "Ribbed undershirt", 0.92, 0, 0.1), innerTop("compression_top", "Compression base top", 0.9, 0.45, 0.04), innerTop("thermal_top", "Thermal undershirt", 1, 1, 0), innerBottom("briefs", "Cotton briefs", 0.12), innerBottom("boxer_briefs", "Boxer briefs", 0.24), innerBottom("boxers", "Boxer shorts", 0.32), innerBottom("trunks", "Trunks", 0.18), { ...pants("long_johns", "Long johns", 1, {}, "underwearLegs"), depth: 2 }],
  neutral: [innerTop("vest", "Cotton underwear vest", 1, 0, 0.05), innerTop("tank", "Underwear tank", 0.88, 0, 0.12), innerTop("undershirt", "Base undershirt", 1, 0.3, 0.03), innerTop("thermal_top", "Long thermal top", 1, 1, 0), innerTop("base_top", "Sleeveless base top", 0.82, 0, 0.08), innerBottom("briefs", "Cotton briefs", 0.12), innerBottom("boxer_briefs", "Boxer briefs", 0.24), innerBottom("trunks", "Trunks", 0.18), { ...pants("long_johns", "Thermal underleggings", 1, {}, "underwearLegs"), depth: 2 }, { ...skirt("underskirt", "Underskirt", 0.62, 0.95, 0, "underwearLegs"), depth: 2 }],
};

const BASE: Record<ClothingStyle, Choice[]> = {
  feminine: [top("tee", "Everyday T-shirt"), top("blouse", "Long-sleeve blouse", 1, 1, { detail: "shirt" }), top("school_blouse", "School white blouse", 0.35, 0.95, { detail: "uniform" }), top("polo", "Polo shirt", 0.4, 1, { detail: "polo" }), dress("tunic", "Tunic", 0.3, 0.6), pants("trousers", "Tailored trousers", 1, { ease: 0.01 }), pants("shorts", "Tailored shorts", 0.4), skirt("a_line", "A-line skirt", 0.65, 1.15), skirt("pleated", "Pleated skirt", 0.6, 1.1, 12), dress("school_frock", "Sri Lankan school white frock", 0.64, 0.32, 8)],
  masculine: [top("tee", "Everyday T-shirt"), top("polo", "Polo shirt", 0.4, 1, { detail: "polo" }), top("casual_shirt", "Short-sleeve shirt", 0.4, 1, { detail: "shirt" }), top("formal_shirt", "Long-sleeve shirt", 1, 1, { detail: "shirt" }), dress("kurta", "Kurta", 0.42, 0.9), pants("jeans", "Straight jeans", 1, { ease: 0.008 }), pants("chinos", "Chinos", 0.96, { ease: 0.015 }), pants("school_shorts", "Sri Lankan school shorts", 0.48, { ease: 0.012 }), pants("school_trousers", "Sri Lankan school trousers", 1, { ease: 0.012 }), pants("track_bottoms", "Track bottoms", 0.94, { ease: 0.025 })],
  neutral: [top("tee", "Everyday T-shirt"), top("long_tee", "Long-sleeve T-shirt", 1), top("school_shirt", "School short-sleeve shirt", 0.35, 0.95, { detail: "uniform" }), top("polo", "Polo shirt", 0.4, 1, { detail: "polo" }), dress("tunic", "Tunic", 0.34, 0.65), pants("jeans", "Straight jeans", 1, { ease: 0.01 }), pants("shorts", "Everyday shorts", 0.44), pants("trousers", "Straight trousers", 0.98, { ease: 0.015 }), skirt("skirt", "Everyday skirt", 0.68, 1.1), dress("dress", "Everyday dress", 0.75, 0.3)],
};

function middle(style: ClothingStyle): Choice[] {
  return [top("cardigan", "Open cardigan", 1, 1, { openFront: true, ease: 0.008 }, "midTop"), top("knit_vest", "Knit vest", 0, 0.95, {}, "midTop"), top("sweater", "Crew-neck sweater", 1, 1, { ease: 0.012 }, "midTop"), top("cropped_cardigan", "Short cardigan", 0.85, 0.7, { openFront: true }, "midTop"), top("waistcoat", "Buttoned waistcoat", 0, 0.9, { detail: "shirt" }, "midTop"), top("hoodie", "Zip sweatshirt", 1, 1.05, { detail: "zip", ease: 0.02 }, "midTop"), top("sleeveless_sweater", "Sleeveless sweater", 0, 1.06, { neckline: 0.07 }, "midTop"), top("three_quarter_knit", "Three-quarter knit", 0.7, 0.96, {}, "midTop"), pants("warm_leggings", "Warm leggings", 0.98, {}, "midBottom"), style === "feminine" ? skirt("overskirt", "Knit overskirt", 0.56, 1.02, 0, "midBottom") : pants("warm_shorts", "Warm-up shorts", 0.5, { ease: 0.02 }, "midBottom")];
}

function outer(style: ClothingStyle): Choice[] {
  return [top("blazer", "Open blazer", 1, 1.12, { openFront: true, detail: "blazer", ease: 0.012 }, "outerTop"), dress("long_coat", "Long coat", 0.75, 1, 0, "outerDress"), top("short_jacket", "Short jacket", 1, 0.92, { detail: "zip", ease: 0.018 }, "outerTop"), top("rain_jacket", "Rain jacket", 1, 1.2, { detail: "zip", ease: 0.025 }, "outerTop"), top("denim_jacket", "Open denim jacket", 0.95, 0.95, { openFront: true, detail: "shirt", ease: 0.02 }, "outerTop"), top("padded_vest", "Padded vest", 0, 1.05, { detail: "zip", ease: 0.035 }, "outerTop"), top("poncho", "Loose poncho", 0.55, 1.12, { ease: 0.05 }, "outerTop"), dress("rain_coat", "Long raincoat", 0.62, 1, 0, "outerDress"), top("bomber", "Bomber jacket", 0.9, 0.88, { detail: "zip", ease: 0.03 }, "outerTop"), style === "feminine" ? top("cropped_blazer", "Cropped blazer", 0.65, 0.7, { openFront: true, detail: "blazer" }, "outerTop") : pants("rain_trousers", "Rain trousers", 1, { ease: 0.025 }, "outerBottom")];
}

function footwear(style: ClothingStyle): Choice[] {
  const socks = (category: string, label: string, length: number): Choice => ({ category, label, slot: "socks", recipe: { kind: "shell", part: "socks", length } });
  const shoe = (category: string, label: string, kind: ClothingRecipe["shoe"], length = 0): Choice => ({ category, label, slot: "feet", depth: 1, recipe: { kind: "shoes", shoe: kind, length } });
  return [socks("ankle_socks", "Ankle socks", 0.15), socks("crew_socks", "Crew socks", 0.42), socks("knee_socks", "Knee-high socks", 0.85), socks("sports_socks", "Sports socks", 0.6), shoe("school_shoes", style === "feminine" ? "School strap shoes" : "School lace-up shoes", style === "feminine" ? "flat" : "loafer"), shoe("trainers", "Trainers", "sneaker"), shoe("loafers", "Loafers", "loafer"), shoe("sandals", "Sandals", "sandal"), shoe("ankle_boots", "Ankle boots", "ankle-boot", 0.25), shoe("boots", "Calf boots", "boot", 0.6)];
}

function accessories(): Choice[] {
  const item = (category: string, label: string, accessory: ClothingRecipe["accessory"], slot: Slot, length = 1): Choice => ({ category, label, slot, recipe: { kind: "accessory", accessory, length } });
  return [item("school_tie", "School tie", "tie", "neckwear", 0.8), item("long_tie", "Long tie", "tie", "neckwear", 1), item("bow_tie", "Bow tie", "bow", "neckwear"), item("scarf", "Long scarf", "scarf", "scarf"), item("neckerchief", "Neckerchief", "neckerchief", "scarf"), item("belt", "Plain belt", "belt", "waistwear"), item("sash", "Waist sash", "sash", "waistwear"), item("suspenders", "Suspenders", "suspenders", "waistwear"), item("wristband", "Wristbands", "wristband", "wristwear"), item("watch", "Wristwatch", "watch", "wristwear")];
}

function regions(choice: Choice): ClothingRegion[] {
  const { recipe, slot } = choice;
  if (recipe.kind === "accessory") return slot === "wristwear" ? ["wrists"] : slot === "waistwear" ? ["hips"] : ["neck"];
  if (recipe.kind === "shoes") return ["feet"];
  if (recipe.part === "socks") return ["calves", "feet"];
  if (recipe.kind === "dress") return ["torso", "hips", "thighs", ...((recipe.sleeves ?? 0) > 0 ? ["upperArms" as const] : [])];
  if (recipe.kind === "skirt" || recipe.part === "bottom") return ["hips", "thighs", ...((recipe.length ?? 1) > 0.65 ? ["calves" as const] : [])];
  return ["torso", ...((recipe.sleeves ?? 0) > 0 ? ["upperArms" as const] : []), ...((recipe.sleeves ?? 0) > 0.6 ? ["forearms" as const] : [])];
}

export const CLOTHING_CATALOG: Garment[] = (["feminine", "masculine", "neutral"] as ClothingStyle[]).flatMap((style) => {
  const layers: Record<ClothingLayer, Choice[]> = { underwear: UNDERWEAR[style], base: BASE[style], mid: middle(style), outer: outer(style), footwear: footwear(style), accessories: accessories() };
  return (Object.entries(layers) as [ClothingLayer, Choice[]][]).flatMap(([layer, choices]) => choices.map((choice) => ({ ...choice, id: `${style}_${layer}_${choice.category}`, layer, depth: choice.depth ?? 0, covers: regions(choice), styles: [style] })));
});
