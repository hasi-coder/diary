// The furniture in a place that people can use, for the action wheel's Home group: one of each kind
// (the nearest to you), only kinds with an action or a seat.
import type { Interaction } from "./interaction";
import type { PlacedItem } from "./layout";

export const FURNITURE_EMOJI: Record<string, string> = {
  bed: "🛏️", hbed: "🛏️", couch: "🛋️", sofa: "🛋️", armchair: "🛋️", chair: "🪑", bench: "🪑",
  toilet: "🚽", sink: "🚰", bath: "🛁", shower: "🚿", wardrobe: "👗", mirror: "🪞", tv: "📺", desk: "🖥️", table: "🍽️",
  fridge: "🧊", stove: "🍳",
};

/** Whether a piece of furniture offers anything to do: an action that targets its kind, or somewhere to sit. */
export const usable = (item: PlacedItem, defs: Interaction[]) =>
  defs.some((def) => def.target?.kinds.includes(item.kind)) || (!!item.spec.seat && item.kind !== "toilet");

/** One usable item of each kind, the nearest to `from` (cell coordinates), nearest kind first. */
export function furnitureToUse(items: PlacedItem[], defs: Interaction[], from: [number, number]): PlacedItem[] {
  const nearest = new Map<string, PlacedItem>();
  const distance = (item: PlacedItem) => Math.hypot(item.x + item.w / 2 - from[0], item.y + item.h / 2 - from[1]);
  for (const item of items) {
    if (!usable(item, defs)) continue;
    const best = nearest.get(item.kind);
    if (!best || distance(item) < distance(best)) nearest.set(item.kind, item);
  }
  return [...nearest.values()].sort((a, b) => distance(a) - distance(b));
}
