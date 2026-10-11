// Mentions are stored as `@[profile:<uuid>]` so renames propagate, and shown
// to the writer as `@Display Name` while editing.
import type { Profile } from "./api";

const TOKEN_RE = /@\[profile:([0-9a-fA-F-]{36})\]/g;
const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}_-]*[\p{L}_-][\p{L}\p{N}_-]*)/gu;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function mentionedIds(content: string): string[] {
  return [...content.matchAll(TOKEN_RE)].map((m) => m[1]);
}

/** Stored content -> text for the editor. */
export function toEditable(content: string, profiles: Map<string, Profile>): string {
  return content.replace(TOKEN_RE, (token, id: string) => {
    const p = profiles.get(id);
    return p ? `@${p.name}` : token;
  });
}

/** Editor text -> stored content. Longest names first so "Sarah Jenkins" wins over "Sarah". */
export function toStored(text: string, profiles: Profile[]): string {
  const byLength = [...profiles].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const p of byLength) {
    const re = new RegExp(`@${escapeRegExp(p.name)}(?![\\p{L}\\p{N}_])`, "gu");
    out = out.replace(re, `@[profile:${p.id}]`);
  }
  return out;
}

/**
 * Stored content -> Markdown for rendering. Mentions and hashtags become links
 * with `#mention-<id>` / `#tag-<tag>` hrefs that PostContent renders as components.
 */
export function toRenderable(content: string): string {
  return content
    .replace(HASHTAG_RE, (_m, pre: string, tag: string) => `${pre}[#${tag}](#tag-${encodeURIComponent(tag)})`)
    .replace(TOKEN_RE, (_m, id: string) => `[@](#mention-${id})`);
}

/** The `@query` being typed just before the caret, if any. */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@[\]]{0,40})$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}
