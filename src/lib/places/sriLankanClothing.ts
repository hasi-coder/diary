import type { Garment } from "./clothingTypes";

/** Regional additions to the everyday catalogue. Each piece stays independently
 * selectable and tintable; style is a browsing collection, not a body restriction. */
export const SRI_LANKAN_GARMENTS: Garment[] = [
  { id: "feminine_base_saree_blouse", label: "Sri Lankan saree blouse", category: "saree_blouse", slot: "top", layer: "base", depth: 0, styles: ["feminine"], covers: ["torso", "upperArms"], recipe: { kind: "shell", part: "top", sleeves: 0.3, length: 0.72, necklineShape: "round", neckline: 0.14 } },
  { id: "feminine_base_saree", label: "Sri Lankan saree", category: "saree", slot: "bottom", layer: "base", depth: 0, styles: ["feminine"], covers: ["hips", "thighs", "calves"], recipe: { kind: "drape", drape: "saree", length: 0.98, flare: 1.14, pleats: 7, trim: "gold", ease: 0.008 } },
  { id: "feminine_base_osariya_blouse", label: "Kandyan osariya blouse · Sri Lanka", category: "osariya_blouse", slot: "top", layer: "base", depth: 0, styles: ["feminine"], covers: ["torso", "upperArms"], recipe: { kind: "shell", part: "top", sleeves: 0.38, length: 0.96, necklineShape: "round", neckline: 0.06, sleevePuff: 0.025 } },
  { id: "feminine_base_osariya", label: "Kandyan osariya · Sri Lanka", category: "osariya", slot: "bottom", layer: "base", depth: 0, styles: ["feminine"], covers: ["hips", "thighs", "calves"], recipe: { kind: "drape", drape: "osariya", length: 0.98, flare: 1.1, pleats: 7, trim: "gold", ease: 0.008 } },
  { id: "feminine_base_hatte", label: "Hatte blouse · Sri Lanka", category: "hatte", slot: "top", layer: "base", depth: 0, styles: ["feminine"], covers: ["torso", "upperArms"], recipe: { kind: "shell", part: "top", sleeves: 0.4, length: 0.96, necklineShape: "round", neckline: 0.12, sleevePuff: 0.012 } },
  { id: "feminine_base_redda", label: "Redda wrap skirt · Sri Lanka", category: "redda", slot: "bottom", layer: "base", depth: 0, styles: ["feminine"], covers: ["hips", "thighs", "calves"], recipe: { kind: "drape", drape: "redda", length: 0.96, flare: 1.03, trim: "woven", ease: 0.006 } },
  // A kameez is a long top: its separate trousers can stay underneath it.
  { id: "feminine_base_kameez", label: "Salwar kameez tunic · Sri Lanka", category: "kameez", slot: "top", layer: "base", depth: 0, styles: ["feminine"], covers: ["torso", "upperArms", "forearms"], recipe: { kind: "dress", length: 0.53, sleeves: 0.75, flare: 1.2, ease: 0.035, necklineShape: "round", neckline: 0.07, trim: "woven" } },
  { id: "feminine_base_salwar", label: "Salwar trousers · Sri Lanka", category: "salwar", slot: "bottom", layer: "base", depth: 0, styles: ["feminine"], covers: ["hips", "thighs", "calves"], recipe: { kind: "shell", part: "bottom", length: 0.97, ease: 0.018 } },
  { id: "feminine_accessories_dupatta", label: "Dupatta shawl · Sri Lanka", category: "dupatta", slot: "scarf", layer: "accessories", depth: 0, styles: ["feminine"], covers: ["neck"], recipe: { kind: "drape", drape: "dupatta", length: 1, trim: "woven", ease: 0.012 } },
];
