// Ready-made outfits a character can start from: one JSON file each, like the
// place templates. Garments are ids from ../garments.ts; outfitProblems checks them.
import { clothingProblems, garment, legacyFields, normalizeWorn, type Worn } from "../garments";
import atHome from "./at-home.json";
import casual from "./casual.json";
import schoolSkirt from "./school-skirt.json";
import schoolTrousers from "./school-trousers.json";
import skirtDay from "./skirt-day.json";
import weekend from "./weekend.json";
import underwear from "./underwear.json";
import slFrock from "./sl-school-frock.json";
import slShorts from "./sl-school-shorts.json";
import slTrousers from "./sl-school-trousers.json";
import slWhiteShorts from "./sl-school-white-shorts.json";
import layeredFeminine from "./layered-feminine.json";
import layeredMasculine from "./layered-masculine.json";
import layeredNeutral from "./layered-neutral.json";

export interface Outfit {
  id: string;
  label: string;
  description: string;
  wearing: Worn[];
}

export const OUTFITS: Outfit[] = [
  { id: "casual", ...casual },
  { id: "weekend", ...weekend },
  { id: "skirt-day", ...skirtDay },
  { id: "school-skirt", ...schoolSkirt },
  { id: "school-trousers", ...schoolTrousers },
  { id: "at-home", ...atHome },
  { id: "underwear", ...underwear },
  { id: "sl-school-frock", ...slFrock },
  { id: "sl-school-shorts", ...slShorts },
  { id: "sl-school-trousers", ...slTrousers },
  { id: "sl-school-white-shorts", ...slWhiteShorts },
  { id: "layered-feminine", ...layeredFeminine },
  { id: "layered-masculine", ...layeredMasculine },
  { id: "layered-neutral", ...layeredNeutral },
].map((outfit) => ({ ...outfit, wearing: normalizeWorn(outfit.wearing) }));

/** Problems with an outfit file; [] when every garment exists and the top and bottom are there. */
export function outfitProblems(o: Outfit): string[] {
  const out = clothingProblems(o.wearing).map((problem) => `${o.id}: ${problem}`);
  for (const region of ["torso", "hips"] as const) if (!o.wearing.some((w) => {
    const definition = garment(w.garment);
    return definition?.layer !== "accessories" && !definition?.recipe?.openFront && definition?.covers.includes(region);
  })) out.push(`${o.id}: needs clothing covering the ${region}.`);
  return out;
}

/** The character fields an outfit sets. */
export function applyOutfit(o: Outfit, current?: Worn[]) {
  const onlyUnderwear = o.wearing.every((w) => garment(w.garment)?.layer === "underwear");
  const retained = current && !onlyUnderwear ? current.filter((w) => garment(w.garment)?.layer === "underwear") : [];
  const wearing = normalizeWorn([...o.wearing, ...retained]);
  return { wearing, ...legacyFields(wearing) };
}
