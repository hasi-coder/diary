// A post's story: ordered clauses that read as one sentence.
//
//   Sarah Jenkins was 🥳 feeling festive and 🎄 attending the ward Christmas party
//   as a nurse with Dev Patel, and 📈 got promoted.
//
// Three kinds of clause:
//   state  "feeling festive", "wearing a saree", "a nurse" — follows "is" or "was"
//   done   a life event, "got promoted" — reads on its own
//   as     "as a nurse" — attaches to the clause before it
import type { Activity, Post } from "./api";
import { displayLabel, eventsOf, lifeEvent, type LifeEventTemplate } from "./lifeEvents";
import type { Thing } from "./vocab";

export type ClauseKind = "state" | "done" | "as";

export function kindOf(c: Activity): ClauseKind {
  if (c.verb === "as") return "as";
  if (c.thing?.startsWith("event:")) return "done";
  // Roles, spicy moments and hard times are whole clauses that follow is/was ("was a nurse", "was slow dancing").
  if (c.verb !== "" || /^(role|spicy|struggle|daily|pose):/.test(c.thing ?? "") || /^(an?|the)\s|^\w+ing\b/.test(c.object)) return "state";
  return "done";
}

/** "Got promoted" → "got promoted"; names and acronyms ("IVF", "Visited Japan" → "visited Japan") keep their case. */
export const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export const eventClause = (t: LifeEventTemplate): Activity => ({ emoji: t.emoji, verb: "", object: lowerFirst(displayLabel(t)), thing: `event:${t.id}` });

/** A role as "as a nurse" (attached) or "a nurse" (is/was a nurse). */
export const roleClause = (role: Thing, attached: boolean): Activity => ({ emoji: role.emoji, verb: attached ? "as" : "", object: role.phrase, thing: `role:${role.id}` });

/**
 * Every clause of a post. Feelings saved the old way come first; a life-event
 * post from before stories becomes its event clauses (its title as the first).
 */
export function storyOf(post: Pick<Post, "kind" | "title" | "feeling" | "activities" | "eventType" | "alsoEventTypes">): Activity[] {
  const list = post.activities ?? [];
  const legacy: Activity[] = [];
  if (post.kind === "milestone") {
    const events = eventsOf(post).map(lifeEvent);
    if (post.title && events[0]) legacy.push({ ...eventClause(events[0]), object: lowerFirst(post.title) });
    else legacy.push(...events.map(eventClause));
  }
  if (post.feeling && !list.some((a) => a.verb === "feeling")) {
    const [, word] = /^feeling (.+)$/.exec(post.feeling.text) ?? [];
    legacy.push(word ? { emoji: post.feeling.emoji, verb: "feeling", object: word } : { emoji: post.feeling.emoji, verb: "", object: post.feeling.text });
  }
  return [...legacy, ...list];
}

/** The life events in a story, with their templates when known. */
export function lifeEventsIn(clauses: Activity[]): { clause: Activity; template?: LifeEventTemplate }[] {
  return clauses
    .filter((c) => kindOf(c) === "done")
    .map((c) => ({ clause: c, template: c.thing?.startsWith("event:") ? lifeEvent(c.thing.slice(6)) : undefined }));
}

const aOrAn = (word: string) => (/^(?:[aeio]|u(?!ni|s[eu])|hour|honou?r)/i.test(word) ? "an" : "a");
const DETERMINER = /\b(a|an|the|my|our|your|his|her|their|some)\s+/i;

/**
 * The object with the clause's adjectives in place: after its first determiner
 * ("a saree" + "gorgeous red" → "a gorgeous red saree", fixing a/an), otherwise
 * in front ("festive" + "very" → "very festive").
 */
export function describedObject(c: Activity): string {
  const adjectives = c.adjectives?.trim();
  if (!adjectives) return c.object;
  const m = DETERMINER.exec(c.object);
  if (!m) return `${adjectives} ${c.object}`;
  const det = /^an?$/i.test(m[1]) ? aOrAn(adjectives) : m[1];
  return `${c.object.slice(0, m.index)}${det} ${adjectives} ${c.object.slice(m.index + m[0].length)}`;
}

/** The clause as words: verb, described object and adverb ("wearing a gorgeous red saree proudly"). */
export function clauseText(c: Activity): string {
  return [c.verb, describedObject(c), c.adverb?.trim()].filter(Boolean).join(" ");
}

export interface Piece {
  clause: Activity;
  /** Text before the clause: ", ", " and ", ", and ", " " or "". */
  before: string;
  /** "is " / "was " when the clause starts a new run of states. */
  aux: string;
}

/**
 * How the clauses join: commas, a final "and", ", and" where the sentence
 * turns (from done things to states, or from is to was), and is/was at the
 * start of each run of states.
 */
export function arrange(clauses: Activity[]): Piece[] {
  const main = clauses.filter((c) => kindOf(c) !== "as");
  const lastMain = main[main.length - 1];
  const pieces: Piece[] = [];
  let prev: Activity | undefined;
  let leadingAs = true;
  for (const c of clauses) {
    const kind = kindOf(c);
    if (kind === "as") {
      // At the very start it reads as an aside: "Sarah, as a nurse, was …".
      pieces.push({ clause: c, before: leadingAs ? ", " : " ", aux: "" });
      continue;
    }
    const tense = c.tense === "was" ? "was" : "is";
    const prevTense = prev?.tense === "was" ? "was" : "is";
    const turns = prev !== undefined && (kindOf(prev) !== kind || (kind === "state" && tense !== prevTense));
    const before = prev === undefined ? (pieces.length > 0 ? ", " : " ") : turns ? ", and " : c === lastMain ? " and " : ", ";
    const aux = kind === "state" && (prev === undefined || turns) ? `${tense} ` : "";
    pieces.push({ clause: c, before, aux });
    prev = c;
    leadingAs = false;
  }
  return pieces;
}
