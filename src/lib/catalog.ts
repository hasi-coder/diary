// Fixed vocabularies: feelings and activities, gender identity, relationship
// kinds and statuses. Life events live in lifeEvents.ts.
import type { Profile, Relation } from "./api";
import relationsCatalog from "./relations.json";

export const FEELINGS: { emoji: string; text: string }[] = [
  ["😊", "happy"], ["🥰", "loved"], ["🙏", "grateful"], ["🤩", "excited"], ["😌", "relaxed"], ["😎", "proud"],
  ["💪", "motivated"], ["🥹", "nostalgic"], ["😇", "blessed"], ["🌱", "hopeful"], ["🤔", "thoughtful"], ["😴", "tired"],
  ["😢", "sad"], ["😔", "lonely"], ["😟", "worried"], ["😤", "frustrated"], ["🤒", "sick"], ["🥳", "festive"],
].map(([emoji, word]) => ({ emoji, text: `feeling ${word}` }));

/** Activities need an object, typed by the user: "watching" + " Dune". */
export const ACTIVITIES: { emoji: string; verb: string; prompt: string }[] = [
  { emoji: "🍽️", verb: "eating", prompt: "What are you eating?" },
  { emoji: "☕", verb: "drinking", prompt: "What are you drinking?" },
  { emoji: "🎬", verb: "watching", prompt: "What are you watching?" },
  { emoji: "📖", verb: "reading", prompt: "What are you reading?" },
  { emoji: "🎧", verb: "listening to", prompt: "What are you listening to?" },
  { emoji: "🎮", verb: "playing", prompt: "What are you playing?" },
  { emoji: "✈️", verb: "travelling to", prompt: "Where to?" },
  { emoji: "🎉", verb: "celebrating", prompt: "What are you celebrating?" },
  { emoji: "📅", verb: "attending", prompt: "What are you attending?" },
  { emoji: "💭", verb: "thinking about", prompt: "What's on your mind?" },
];

export { lifeEvent } from "./lifeEvents";

// ── Gender identity ──────────────────────────────────────────────────────────
// Facebook's custom-gender list (2014+, ~58 options) plus a few common
// additions. Profiles can hold up to 10 and type anything not listed.
export const GENDER_SUGGESTIONS = [
  "Woman", "Man", "Non-binary", "Agender", "Androgyne", "Androgynous", "Bigender", "Cis", "Cisgender",
  "Cis female", "Cis male", "Cis man", "Cis woman", "Cisgender female", "Cisgender male", "Cisgender man",
  "Cisgender woman", "Female to male", "FTM", "Gender fluid", "Genderfluid", "Gender nonconforming",
  "Gender questioning", "Gender variant", "Genderqueer", "Intersex", "Male to female", "MTF", "Neither",
  "Neutrois", "Non-binary", "Other", "Pangender", "Trans", "Trans*", "Trans female", "Trans* female",
  "Trans male", "Trans* male", "Trans man", "Trans* man", "Trans person", "Trans* person", "Trans woman",
  "Trans* woman", "Transfeminine", "Transgender", "Transgender female", "Transgender male",
  "Transgender man", "Transgender person", "Transgender woman", "Transmasculine", "Transsexual",
  "Transsexual female", "Transsexual male", "Transsexual man", "Transsexual person", "Transsexual woman",
  "Two-Spirit", "Demigirl", "Demiboy", "Demigender", "Xenogender", "Hijra", "Fa'afafine", "Māhū",
  "Muxe", "Kathoey", "Prefer not to say",
].filter((g, i, all) => all.indexOf(g) === i);

export const PRONOUNS = ["she/her", "he/him", "they/them", "she/they", "he/they", "xe/xem", "ze/hir", "any pronouns", "no pronouns"];

/** Which words to use for this profile in relationship labels (Facebook asks the same). */
export const TERMS: { value: Terms; label: string; example: string }[] = [
  { value: "neutral", label: "Neutral", example: "sibling, parent, partner" },
  { value: "feminine", label: "Feminine", example: "sister, mother, wife" },
  { value: "masculine", label: "Masculine", example: "brother, father, husband" },
];
export type Terms = "neutral" | "feminine" | "masculine";

/** A sensible default for the terms picker when pronouns are chosen. */
export function termsForPronouns(pronouns: string): Terms {
  const p = pronouns.trim().toLowerCase();
  if (p.startsWith("she")) return "feminine";
  if (p.startsWith("he/") || p === "he") return "masculine";
  return "neutral";
}

/** Facebook's relationship statuses, plus modern ones. */
export const RELATIONSHIP_STATUSES = [
  "Single", "In a relationship", "Engaged", "Married", "In a civil union", "In a domestic partnership",
  "In an open relationship", "It's complicated", "Separated", "Divorced", "Widowed",
  "Dating", "Talking to someone", "Polyamorous", "In a queerplatonic relationship", "Nesting with partners",
  "Long distance", "Asexual and happy", "Aromantic and happy", "Not looking", "Prefer not to say",
];

// ── Relationships ────────────────────────────────────────────────────────────
// Shared with the Rust backend (validation and inverses): src/lib/relations.json.

export type RelationGroup = "Family" | "Partners" | "Friends & community" | "Work" | "Pets" | "Places & groups" | "Other";
export const RELATION_GROUPS: RelationGroup[] = ["Family", "Partners", "Friends & community", "Work", "Pets", "Places & groups", "Other"];

interface RelationKind {
  kind: string;
  inverse: string;
  group: RelationGroup;
  /** [neutral, feminine, masculine]: how the related profile is described. */
  label: [string, string, string];
  /** Phrase for the intro card, from the declarer's side ("Married to"). */
  intro?: string;
}

export const RELATION_KINDS = relationsCatalog.kinds as RelationKind[];
const byKind = new Map(RELATION_KINDS.map((k) => [k.kind, k]));
const kindInfo = (kind: string) => byKind.get(kind);

/** The label for `kind`, gendered by the profile it describes. */
export function relationLabel(kind: string, describes?: Pick<Profile, "terms">): string {
  const info = kindInfo(kind);
  if (!info) return kind;
  const i = describes?.terms === "feminine" ? 1 : describes?.terms === "masculine" ? 2 : 0;
  return info.label[i];
}

export interface RelationView {
  relation: Relation;
  /** Profile that stored the relation (needed to edit or delete it). */
  declarerId: string;
  /** The other profile, seen from the page being viewed. */
  other: Profile;
  /** How `other` relates to the viewed profile. */
  label: string;
  /** Intro-card phrase, when the viewed profile declared it ("Works at"). */
  intro?: string;
}

/** Every relationship involving `profileId`, from that profile's point of view. */
export function relationsOf(profileId: string, profiles: Profile[]): RelationView[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const out: RelationView[] = [];
  for (const p of profiles) {
    for (const r of p.relations) {
      if (p.id === profileId) {
        const other = byId.get(r.toId);
        if (!other) continue;
        const label = r.kind === "custom" ? r.label : relationLabel(r.kind, other);
        out.push({ relation: r, declarerId: p.id, other, label, intro: kindInfo(r.kind)?.intro });
      } else if (r.toId === profileId) {
        const inverse = kindInfo(r.kind)?.inverse ?? r.kind;
        const label = r.kind === "custom" ? r.inverseLabel || r.label : relationLabel(inverse, p);
        out.push({ relation: r, declarerId: p.id, other: p, label, intro: kindInfo(inverse)?.intro });
      }
    }
  }
  return out;
}
