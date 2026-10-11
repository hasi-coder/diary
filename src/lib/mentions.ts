// Mentions are stored as `@[profile:<uuid>]` so renames propagate. The editor
// (RichEditor.tsx) parses and writes the same token.

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
