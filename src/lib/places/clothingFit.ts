import type { ClothingFit, Garment, Worn } from "./clothingTypes";

export const CLOTHING_FIT_LIMITS = { ease: { min: 0, max: 0.04, step: 0.001 }, length: { min: 0.75, max: 1.25, step: 0.01 } } as const;

/** Treat stored fit values as geometry inputs; malformed data uses the original
 * cut. Defaults stay omitted so existing outfits keep their saved shape. */
export function normalizeClothingFit(value?: ClothingFit): ClothingFit | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result: ClothingFit = {};
  if (typeof value.ease === "number" && Number.isFinite(value.ease)) {
    const ease = Math.max(0, Math.min(CLOTHING_FIT_LIMITS.ease.max, value.ease));
    if (ease > 0) result.ease = ease;
  }
  if (typeof value.length === "number" && Number.isFinite(value.length)) {
    const length = Math.max(CLOTHING_FIT_LIMITS.length.min, Math.min(CLOTHING_FIT_LIMITS.length.max, value.length));
    if (length !== 1) result.length = length;
  }
  return Object.keys(result).length ? result : undefined;
}

export function fittedGarment(definition: Garment, fit?: ClothingFit): Garment {
  const clean = normalizeClothingFit(fit);
  if (!clean || !definition.recipe) return definition;
  const recipe = definition.recipe;
  return { ...definition, recipe: {
    ...recipe,
    ease: (recipe.ease ?? 0) + (clean.ease ?? 0),
    length: (recipe.length ?? 1) * (clean.length ?? 1),
    sleeves: recipe.sleeves === undefined ? undefined : Math.min(1, recipe.sleeves * (clean.length ?? 1)),
  } };
}

export function withClothingFit(worn: Worn[], id: string, fit: ClothingFit | null): Worn[] {
  return worn.map((item) => {
    if (item.garment !== id) return item;
    const next = { ...item };
    const clean = normalizeClothingFit(fit ?? undefined);
    if (clean) next.fit = clean;
    else delete next.fit;
    return next;
  });
}
