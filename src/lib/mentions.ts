// Mentions are stored as `@[profile:<uuid>]` so renames propagate. The editor
// (RichEditor.tsx) parses and writes the same token.
import type { Profile } from "./api";

const TOKEN_RE = /@\[profile:([0-9a-fA-F-]{36})\]/g;
const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}_-]*[\p{L}_-][\p{L}\p{N}_-]*)/gu;

/**
 * Stored content -> Markdown for rendering. Mentions and hashtags become links
 * with `#mention-<id>` / `#tag-<tag>` hrefs that PostContent renders as components.
 */
export function toRenderable(content: string): string {
  return content
    .replace(HASHTAG_RE, (_m, pre: string, tag: string) => `${pre}[#${tag}](#tag-${encodeURIComponent(tag)})`)
    .replace(TOKEN_RE, (_m, id: string) => `[@](#mention-${id})`);
}

/** Plain-text preview of stored Markdown: mentions resolved, syntax stripped. */
export function excerpt(content: string, profiles: Map<string, Profile>, max = 280): string {
  const text = content
    .replace(TOKEN_RE, (_m, id: string) => `@${profiles.get(id)?.name ?? "deleted profile"}`)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s|>\s?|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s)/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s\S*$/, "")}…` : text;
}
