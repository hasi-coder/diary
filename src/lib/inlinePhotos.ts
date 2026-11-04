// Photos placed inside an article's text are stored as `![caption](media:<id>)`
// on a line of their own, pointing at one of the post's attachments. The editor
// (RichEditor.tsx) parses and writes the same line.
import type { MediaRef, Post } from "./api";

/** One photo line; the caption escapes `\` and `]`. */
export const INLINE_PHOTO_RE = /^!\[((?:\\.|[^\]\\\n])*)\]\(media:([\w-]+)\)[ \t]*(?:\n+|$)/;
const ALL_RE = /!\[((?:\\.|[^\]\\\n])*)\]\(media:([\w-]+)\)/g;

export const photoMarkdown = (id: string, caption: string) =>
  `![${caption.replace(/\n/g, " ").replace(/[\\\]]/g, "\\$&")}](media:${id})`;

export const unescapeCaption = (s: string) => s.replace(/\\(.)/g, "$1");

/** The captions of the photos placed in `content`, by media id. */
export function inlineCaptions(content: string): Record<string, string> {
  return Object.fromEntries([...content.matchAll(ALL_RE)].map((m) => [m[2], unescapeCaption(m[1])]));
}

/**
 * An article's photos: the cover is the first one not placed in the text, and
 * the rest that aren't placed show in a grid after it.
 */
export function articleMedia(post: Post): { cover: MediaRef | undefined; rest: MediaRef[] } {
  const placed = new Set(Object.keys(inlineCaptions(post.content)));
  const [cover, ...rest] = post.media.filter((m) => !placed.has(m.id));
  return { cover, rest };
}
