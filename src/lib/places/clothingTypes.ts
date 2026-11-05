export type ClothingStyle = "feminine" | "masculine" | "neutral";
export type ClothingLayer = "underwear" | "base" | "mid" | "outer" | "footwear" | "accessories";
export type Slot = "bra" | "underwearTop" | "underwearBottom" | "underwearLegs" | "top" | "bottom" | "dress" | "midTop" | "midBottom" | "outerTop" | "outerBottom" | "outerDress" | "socks" | "feet" | "neckwear" | "scarf" | "waistwear" | "wristwear";
export type ClothingRegion = "torso" | "upperArms" | "forearms" | "hips" | "thighs" | "calves" | "feet" | "neck" | "wrists";

/** Shared geometry recipes describe cuts, not just colour variants. New styles
 * reuse the shipped rig and morph targets, with their own silhouettes and trim. */
export interface ClothingRecipe {
  kind: "shell" | "skirt" | "dress" | "shoes" | "accessory";
  part?: "top" | "bottom" | "socks";
  sleeves?: number;
  length?: number;
  neckline?: number;
  openFront?: boolean;
  flare?: number;
  pleats?: number;
  ease?: number;
  detail?: "shirt" | "polo" | "uniform" | "zip" | "blazer";
  accessory?: "tie" | "bow" | "scarf" | "neckerchief" | "belt" | "sash" | "suspenders" | "wristband" | "cuffs" | "watch";
  shoe?: "flat" | "loafer" | "sneaker" | "sandal" | "ankle-boot" | "boot";
}

export interface Garment {
  id: string;
  label: string;
  slot: Slot;
  layer: ClothingLayer;
  /** Ordering within a layer, e.g. bra → camisole, socks → shoes. */
  depth: number;
  covers: ClothingRegion[];
  styles: ClothingStyle[];
  category: string;
  recipe?: ClothingRecipe;
}

export interface ClothingFit {
  /** Additional clearance in metres, independent of the body-shape sliders. */
  ease?: number;
  /** Hem/sleeve length multiplier; omitted means the garment's original cut. */
  length?: number;
}

export interface Worn { garment: string; color: string; fit?: ClothingFit }
