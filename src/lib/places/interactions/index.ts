// The interaction library: every JSON file in this folder is one interaction.
import { interactionProblems, interactionWarnings, type Interaction } from "../interaction";
import { interactionEnabled } from "../interactionPolicy";
import known from "./categories.json";

// Files named test_<name>.json are scratch animations for testing: never loaded.
const files = import.meta.glob(["./*.json", "!./categories.json", "!./test_*.json"], { eager: true, import: "default" }) as Record<string, unknown>;
export const INTERACTIONS: Interaction[] = Object.values(files)
  .filter((v) => {
    const problems = interactionProblems(v);
    if (problems.length) console.warn(problems.join("\n"));
    else if (import.meta.env?.DEV) { const warnings = interactionWarnings(v); if (warnings.length) console.warn(warnings.join("\n")); }
    return problems.length === 0;
  })
  .map((v) => v as Interaction)
  .sort((a, b) => a.label.localeCompare(b.label));

/** Available actions, evaluated when read so policy changes take effect. */
export const enabledInteractions = () => INTERACTIONS.filter(interactionEnabled);
/** Available interactions that `count` people can do. */
export const interactionsFor = (count: number) => enabledInteractions().filter((i) => count >= i.people.min && count <= i.people.max);


/** A group of actions in the wheel and the settings list. */
export interface ActionCategory { id: string; label: string; emoji: string }

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
