import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toRenderable } from "../lib/mentions";
import { MentionTag } from "./MentionTag";

export function PostContent({ content, onTag, large }: { content: string; onTag?: (tag: string) => void; large?: boolean }) {
  const components: Components = {
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
    img({ alt }) {
      return <span className="text-slate-400">[image: {alt}]</span>;
    },
  };

  return (
    <div className={`post-md text-slate-700 ${large ? "article-md text-[17px] leading-8" : "text-sm leading-relaxed"}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {toRenderable(content)}
      </Markdown>
    </div>
  );
}
