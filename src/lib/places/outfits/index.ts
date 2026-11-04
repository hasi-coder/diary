// Ready-made outfits a character can start from: one JSON file each, like the
// place templates. Garments are ids from ../garments.ts; outfitProblems checks them.
import { garment, legacyFields, type Worn } from "../garments";
import atHome from "./at-home.json";
import casual from "./casual.json";
import schoolSkirt from "./school-skirt.json";
import schoolTrousers from "./school-trousers.json";
import skirtDay from "./skirt-day.json";
import weekend from "./weekend.json";

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
];

/** Problems with an outfit file; [] when every garment exists and the top and bottom are there. */
export function outfitProblems(o: Outfit): string[] {
  const out = o.wearing.filter((w) => !garment(w.garment)).map((w) => `${o.id}: unknown garment "${w.garment}".`);
  for (const slot of ["top", "bottom"] as const) if (!o.wearing.some((w) => garment(w.garment)?.slot === slot)) out.push(`${o.id}: needs a ${slot}.`);
  return out;
}

/** The character fields an outfit sets. */
export const applyOutfit = (o: Outfit) => ({ wearing: o.wearing.map((w) => ({ ...w })), ...legacyFields(o.wearing) });
