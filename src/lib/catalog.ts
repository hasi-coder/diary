// Fixed vocabularies: feelings and activity verbs, gender identity, relationship
// kinds and statuses. Life events live in lifeEvents.ts, shared things in vocab.ts.
import type { Profile, Relation } from "./api";
import type { VocabKind } from "./vocab";
import relationsCatalog from "./relations.json";

export const FEELINGS: { emoji: string; text: string }[] = [
  ["😊", "happy"], ["🥰", "loved"], ["🙏", "grateful"], ["🤩", "excited"], ["😌", "relaxed"], ["😎", "proud"],
  ["💪", "motivated"], ["🥹", "nostalgic"], ["😇", "blessed"], ["🌱", "hopeful"], ["🤔", "thoughtful"], ["😴", "tired"],
  ["😢", "sad"], ["😔", "lonely"], ["😟", "worried"], ["😤", "frustrated"], ["🤒", "sick"], ["🥳", "festive"],
  ["🥰", "in love"], ["😏", "flirty"], ["🔥", "sexy"], ["😳", "shy"], ["😬", "nervous"], ["😰", "anxious"], ["💔", "heartbroken"],
  ["😒", "jealous"], ["🧳", "homesick"], ["🫠", "overwhelmed"], ["🪫", "burned out"], ["😌", "at peace"], ["💪", "strong"],
].map(([emoji, word]) => ({ emoji, text: `feeling ${word}` }));

/**
 * Activities: a verb plus a thing, happening now or in the moment a post is
 * about. Verbs with `kinds` pick from the shared vocabularies (vocab.ts), so
 * "working as a nurse", "attending an office party" and "wearing a saree" can
 * all go on one post; any verb also takes free text.
 */
export interface ActivityVerb {
  emoji: string;
  /** Empty for lists of whole clauses ("making out"), which need no verb. */
  verb: string;
  /** Shown in the picker instead of "verb…". */
  label?: string;
  kinds: VocabKind[];
  prompt: string;
}

export const ACTIVITY_VERBS: ActivityVerb[] = [
  { emoji: "💼", verb: "working as", kinds: ["role"], prompt: "What role?" },
  { emoji: "📅", verb: "attending", kinds: ["occasion"], prompt: "What are you attending?" },
  { emoji: "🎉", verb: "celebrating", kinds: ["occasion"], prompt: "What are you celebrating?" },
  { emoji: "🏠", verb: "hosting", kinds: ["occasion"], prompt: "What are you hosting?" },
  { emoji: "👗", verb: "wearing", kinds: ["clothing"], prompt: "What are you wearing?" },
  { emoji: "✨", verb: "having", kinds: ["moment"], prompt: "What kind of moment?" },
  { emoji: "🧭", verb: "on", kinds: ["occasion"], prompt: "On what? A road trip, a holiday, a date…" },
  { emoji: "✍️", verb: "", label: "Write your own…", kinds: [], prompt: "Anything at all: dancing on the table, sneaking a cigarette…" },
  { emoji: "🧍", verb: "", label: "Daily life…", kinds: ["daily"], prompt: "Sitting, sleeping, getting ready, driving…" },
  { emoji: "📸", verb: "", label: "Posing…", kinds: ["pose"], prompt: "Posing for a photo, a selfie, a peace sign…" },
  { emoji: "🌶️", verb: "", label: "Spicy & naughty…", kinds: ["spicy"], prompt: "Flirting, making out, a one-night stand…" },
  { emoji: "💔", verb: "", label: "Hard times…", kinds: ["struggle"], prompt: "Crying, job hunting, grieving…" },
  { emoji: "📚", verb: "studying", kinds: ["subject", "exam"], prompt: "What are you studying?" },
  { emoji: "🏅", verb: "playing", kinds: ["sport", "instrument"], prompt: "What are you playing?" },
  { emoji: "🎯", verb: "practising", kinds: ["sport", "instrument", "hobby"], prompt: "What are you practising?" },
  { emoji: "🧠", verb: "learning", kinds: ["language", "instrument", "hobby"], prompt: "What are you learning?" },
  { emoji: "🏃", verb: "training for", kinds: ["race", "sport"], prompt: "What are you training for?" },
  { emoji: "🎨", verb: "enjoying", kinds: ["hobby"], prompt: "What are you enjoying?" },
  { emoji: "✈️", verb: "travelling to", kinds: ["country"], prompt: "Where to?" },
  { emoji: "🧭", verb: "visiting", kinds: ["country"], prompt: "Where are you visiting?" },
  { emoji: "🐾", verb: "walking", kinds: ["pet"], prompt: "Walking who?" },
  { emoji: "🍽️", verb: "eating", kinds: [], prompt: "What are you eating?" },
  { emoji: "☕", verb: "drinking", kinds: [], prompt: "What are you drinking?" },
  { emoji: "🧑‍🍳", verb: "cooking", kinds: [], prompt: "What are you cooking?" },
  { emoji: "🎬", verb: "watching", kinds: [], prompt: "What are you watching?" },
  { emoji: "📖", verb: "reading", kinds: [], prompt: "What are you reading?" },
  { emoji: "🎧", verb: "listening to", kinds: [], prompt: "What are you listening to?" },
  { emoji: "🛍️", verb: "shopping for", kinds: [], prompt: "What are you shopping for?" },
  { emoji: "💭", verb: "thinking about", kinds: [], prompt: "What's on your mind?" },
];

/** Suggestions for describing a clause. Free text always works too. */
export const ADJECTIVES = [
  "very", "so", "really", "a little", "totally", "slightly",
  "beautiful", "gorgeous", "stunning", "elegant", "cute", "lovely", "pretty", "handsome", "fancy", "simple", "classic", "traditional", "modern", "vintage", "new", "old", "favourite", "brand-new", "borrowed", "hand-made",
  "red", "white", "black", "blue", "green", "yellow", "pink", "purple", "gold", "silver", "silk", "cotton", "lace", "sheer", "tight", "short", "long", "little",
  "huge", "tiny", "big", "small", "quiet", "loud", "crowded", "empty", "long-awaited", "last-minute", "surprise", "secret", "unforgettable", "boring", "chaotic", "perfect", "awful", "amazing", "epic", "lazy", "busy", "rainy", "sunny", "cold", "hot",
  "romantic", "cosy", "intimate", "flirty", "sexy", "steamy", "spicy", "naughty", "wild", "dirty", "kinky", "forbidden", "risky", "scandalous", "shameless", "tipsy", "drunken", "messy", "unexpected", "awkward", "embarrassing", "first", "last",
];

export const ADVERBS = [
  "quietly", "happily", "proudly", "nervously", "shyly", "slowly", "quickly", "finally", "secretly", "openly", "together", "alone", "again", "all day", "all night", "for hours", "for the first time", "for the last time", "at last",
  "carefully", "lazily", "peacefully", "patiently", "awkwardly", "badly", "beautifully", "gracefully", "confidently", "bravely", "anxiously", "sadly", "tearfully", "angrily", "madly",
  "passionately", "tenderly", "gently", "hungrily", "playfully", "shamelessly", "wildly", "naughtily", "recklessly", "drunkenly", "breathlessly", "desperately", "sneakily",
];

/** "with a, b and c" style list. */
export const joinAnd = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);


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
