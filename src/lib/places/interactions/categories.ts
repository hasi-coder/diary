// The groups actions sit in (the wheel and the settings list), from categories.json.
import type { Interaction } from "../interaction";
import known from "./categories.json";

/** A group of actions in the wheel and the settings list. */
export interface ActionCategory { id: string; label: string; emoji: string; /** A group inside another group (Nurse inside Care). */ parent?: string }

const FALLBACK_EMOJI = "✨";
const titled = (id: string) => id.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The category an action sits in; "other" when it names none. */
export const categoryOf = (def: Interaction) => def.category?.trim() || "other";

/**
 * Every group that has actions, in order: those listed in categories.json first (in that file's
 * order), then any new word an action uses, by name. So adding a category is writing it on an action;
 * add it to categories.json only to choose its label, emoji and place in the order.
 */
export function categoriesOf(defs: Interaction[]): (ActionCategory & { defs: Interaction[] })[] {
  const order = known as ActionCategory[];
  const used = [...new Set(defs.map(categoryOf))];
  const ids = [...order.map((c) => c.id).filter((id) => used.includes(id)), ...used.filter((id) => !order.some((c) => c.id === id)).sort()];
  return ids.map((id) => {
    const info = order.find((c) => c.id === id);
    return { id, label: info?.label ?? titled(id), emoji: info?.emoji ?? FALLBACK_EMOJI, defs: defs.filter((d) => categoryOf(d) === id) };
  });
}

export interface CategoryNode extends ActionCategory { defs: Interaction[]; children: CategoryNode[] }

/**
 * The groups as a tree for the wheel: a category with a `parent` (categories.json) sits inside it, so a
 * long group splits into short rings (Care holds Nurse, Doctor and Therapy). A parent with no actions of
 * its own still appears when a child has some.
 */
export function categoryTree(defs: Interaction[]): CategoryNode[] {
  const order = known as ActionCategory[];
  const flat = categoriesOf(defs);
  const nodes = new Map<string, CategoryNode>();
  const make = (id: string): CategoryNode => {
    if (!nodes.has(id)) {
      const info = flat.find((c) => c.id === id);
      const meta = order.find((c) => c.id === id);
      nodes.set(id, { id, label: info?.label ?? meta?.label ?? titled(id), emoji: info?.emoji ?? meta?.emoji ?? FALLBACK_EMOJI, parent: meta?.parent, defs: info?.defs ?? [], children: [] });
    }
    return nodes.get(id)!;
  };
  const top: CategoryNode[] = [];
  for (const c of flat) {
    const node = make(c.id);
    const parent = node.parent ? make(node.parent) : null;
    if (parent) { if (!parent.children.includes(node)) parent.children.push(node); }
  }
  for (const node of nodes.values()) if (!node.parent || !nodes.has(node.parent)) top.push(node);
  const rank = (id: string) => { const i = order.findIndex((c) => c.id === id); return i < 0 ? 999 : i; };
  return top.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}
