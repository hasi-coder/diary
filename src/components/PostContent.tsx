import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { mediaUrl, type MediaRef } from "../lib/api";
import { toRenderable } from "../lib/mentions";
import { MentionTag } from "./MentionTag";

export function PostContent(props: {
  content: string;
  onTag?: (tag: string) => void;
  large?: boolean;
  /** The post's attachments, for photos placed in the text (`![caption](media:<id>)`). */
  media?: MediaRef[];
  onOpenMedia?: (id: string) => void;
}) {
  const { content, onTag, large, media, onOpenMedia } = props;
  const components: Components = {
    // A paragraph of only photos is the photos: a figure can't sit in a <p>.
    p({ node, children }) {
      const only = node?.children.every((c) => (c.type === "element" && c.tagName === "img") || (c.type === "text" && !c.value.trim()));
      return only ? <>{children}</> : <p>{children}</p>;
    },
    a({ href, children }) {
      if (href?.startsWith("#mention-")) return <MentionTag id={href.slice("#mention-".length)} />;
      if (href?.startsWith("#tag-")) {
        const tag = decodeURIComponent(href.slice("#tag-".length));
        return (
          <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => onTag?.(`#${tag}`)}>
            {children}
          </button>
        );
      }
      // External links stay inert: the journal never makes network requests on its own.
      return (
        <span className="text-brand-600 underline decoration-dotted" title={href}>
          {children}
        </span>
      );
    },
    img({ src, alt }) {
      const m = typeof src === "string" && src.startsWith("media:") ? media?.find((x) => x.id === src.slice("media:".length)) : undefined;
      if (!m) return <span className="text-slate-400">[image: {alt}]</span>;
      return (
        <figure className="my-6">
          {m.kind === "image" ? (
            <button type="button" onClick={() => onOpenMedia?.(m.id)} className="block w-full" aria-label={`View ${alt || m.name}`}>
              <img src={mediaUrl(m.id)} alt={alt || m.name} loading="lazy" className="mx-auto max-h-[36rem] rounded-xl" />
            </button>
          ) : (
            <video src={mediaUrl(m.id)} controls preload="metadata" playsInline className="mx-auto max-h-[36rem] w-full rounded-xl bg-black" />
          )}
          {alt && <figcaption className="mt-2 text-center text-sm text-slate-500">{alt}</figcaption>}
        </figure>
      );
    },
  };

  return (
    <div className={`post-md text-slate-700 ${large ? "article-md text-[17px] leading-8" : "text-sm leading-relaxed"}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => (url.startsWith("media:") ? url : defaultUrlTransform(url))}
      >
        {toRenderable(content)}
      </Markdown>
    </div>
  );
}
