// The interaction library: every JSON file in this folder is one interaction.
import { interactionProblems, type Interaction } from "../interaction";

const files = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;
export const INTERACTIONS: Interaction[] = Object.values(files)
  .filter((v) => {
    const problems = interactionProblems(v);
    if (problems.length) console.warn(problems.join("\n"));
    return problems.length === 0;
  })
  .map((v) => v as Interaction)
  .sort((a, b) => a.label.localeCompare(b.label));

/** Interactions that `count` people can do. */
export const interactionsFor = (count: number) => INTERACTIONS.filter((i) => count >= i.people.min && count <= i.people.max);

