// The interaction library: every JSON file in this folder is one interaction.
import { interactionProblems, interactionWarnings, type Interaction } from "../interaction";
import { interactionEnabled } from "../interactionPolicy";

// Files named test_<name>.json are the owner's scratch animations: they load and show in the app like any
// other, but the tests, lint, library listing and the agent never read, check or commit them (git-ignored).
const files = import.meta.glob(["./*.json", "!./categories.json"], { eager: true, import: "default" }) as Record<string, unknown>;
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


export * from "./categories";
