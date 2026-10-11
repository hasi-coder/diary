// Fixed vocabularies: feelings and activities, life-event types, relationship kinds.
import type { Profile, Relation } from "./api";

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

export const LIFE_EVENTS: { key: string; emoji: string; label: string; example: string }[] = [
  { key: "work", emoji: "💼", label: "Work", example: "Started a new job at …" },
  { key: "education", emoji: "🎓", label: "Education", example: "Graduated from …" },
  { key: "home", emoji: "🏠", label: "Home", example: "Moved to …" },
  { key: "relationship", emoji: "💞", label: "Relationship", example: "Got engaged to …" },
  { key: "family", emoji: "👶", label: "Family", example: "Welcomed a new family member" },
  { key: "travel", emoji: "✈️", label: "Travel", example: "First trip to …" },
  { key: "health", emoji: "❤️‍🩹", label: "Health & wellness", example: "Ran my first 10K" },
  { key: "achievement", emoji: "🏆", label: "Achievement", example: "Finished my first novel" },
  { key: "remembrance", emoji: "🕊️", label: "Remembrance", example: "In loving memory of …" },
  { key: "other", emoji: "⭐", label: "Other", example: "Something worth remembering" },
];

export const lifeEvent = (key: string) => LIFE_EVENTS.find((e) => e.key === key) ?? LIFE_EVENTS[LIFE_EVENTS.length - 1];

interface RelationKind {
  kind: string;
  /** How the related profile is described, e.g. "Sibling", "Workplace". */
  label: string;
  inverse: string;
  group: "Family" | "Relationship" | "Friends & work" | "Places & groups" | "Other";
  /** Phrase for the intro card, from the declarer's side. */
  intro?: string;
}

export const RELATION_KINDS: RelationKind[] = [
  { kind: "parent", label: "Parent", inverse: "child", group: "Family" },
  { kind: "child", label: "Child", inverse: "parent", group: "Family" },
  { kind: "sibling", label: "Sibling", inverse: "sibling", group: "Family" },
  { kind: "grandparent", label: "Grandparent", inverse: "grandchild", group: "Family" },
  { kind: "grandchild", label: "Grandchild", inverse: "grandparent", group: "Family" },
  { kind: "relative", label: "Relative", inverse: "relative", group: "Family" },
  { kind: "spouse", label: "Spouse", inverse: "spouse", group: "Relationship", intro: "Married to" },
  { kind: "partner", label: "Partner", inverse: "partner", group: "Relationship", intro: "In a relationship with" },
  { kind: "friend", label: "Friend", inverse: "friend", group: "Friends & work" },
  { kind: "best_friend", label: "Best friend", inverse: "best_friend", group: "Friends & work" },
  { kind: "colleague", label: "Colleague", inverse: "colleague", group: "Friends & work" },
  { kind: "neighbour", label: "Neighbour", inverse: "neighbour", group: "Friends & work" },
  { kind: "workplace", label: "Workplace", inverse: "employee", group: "Places & groups", intro: "Works at" },
  { kind: "employee", label: "Employee", inverse: "workplace", group: "Places & groups" },
  { kind: "school", label: "School", inverse: "student", group: "Places & groups", intro: "Studied at" },
  { kind: "student", label: "Student", inverse: "school", group: "Places & groups" },
  { kind: "club", label: "Group", inverse: "member", group: "Places & groups", intro: "Member of" },
  { kind: "member", label: "Member", inverse: "club", group: "Places & groups" },
  { kind: "home", label: "Home", inverse: "resident", group: "Places & groups", intro: "Lives in" },
  { kind: "resident", label: "Resident", inverse: "home", group: "Places & groups" },
  { kind: "hometown", label: "Hometown", inverse: "native", group: "Places & groups", intro: "From" },
  { kind: "native", label: "From here", inverse: "hometown", group: "Places & groups" },
  { kind: "favourite", label: "Favourite spot", inverse: "regular", group: "Places & groups", intro: "Regular at" },
  { kind: "regular", label: "Regular", inverse: "favourite", group: "Places & groups" },
  { kind: "custom", label: "Custom…", inverse: "custom", group: "Other" },
];

const kindInfo = (kind: string) => RELATION_KINDS.find((k) => k.kind === kind);

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
        const info = kindInfo(r.kind);
        out.push({ relation: r, declarerId: p.id, other, label: r.kind === "custom" ? r.label : (info?.label ?? r.kind), intro: info?.intro });
      } else if (r.toId === profileId) {
        const info = kindInfo(kindInfo(r.kind)?.inverse ?? r.kind);
        const label = r.kind === "custom" ? r.inverseLabel || r.label : (info?.label ?? r.kind);
        out.push({ relation: r, declarerId: p.id, other: p, label, intro: info?.intro });
      }
    }
  }
  return out;
}
