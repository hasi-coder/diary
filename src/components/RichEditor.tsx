// WYSIWYG editor for posts. Content goes in and out as Markdown, so stored
// entries stay readable and independent of the editor. Mentions round-trip as
// `@[profile:<uuid>]` and are displayed with the profile's current name.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Extension, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Mention from "@tiptap/extension-mention";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CodeBlockIcon,
  CodeIcon,
  ColumnsPlusRightIcon,
  LinkIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  RowsPlusBottomIcon,
  TableIcon,
  TextBIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TrashIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { subtitle } from "../lib/format";
import { Avatar } from "./ui";

const MENTION_TOKEN = /^@\[profile:([0-9a-fA-F-]{36})\]/;

export interface RichEditorHandle {
  focus: () => void;
  clear: () => void;
  /** Types "@" at the cursor, opening the mention picker. */
  startMention: () => void;
}

interface Props {
  /** Stored Markdown to start from. Read once, on mount. */
  initial: string;
  profiles: Profile[];
  placeholder: string;
  onChange: (markdown: string) => void;
  onSubmit?: () => void;
  onFiles?: (files: FileList) => void;
  autoFocus?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

interface SuggestState {
  items: Profile[];
  index: number;
  rect: DOMRect | null;
  command: (p: Profile) => void;
}

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(props, ref) {
  // Editor extensions are created once; everything they call goes through refs.
  const latest = useRef(props);
  latest.current = props;
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const suggestRef = useRef(suggest);
  suggestRef.current = suggest;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false, // not representable in Markdown
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: () => latest.current.placeholder }),
      JournalMention.configure({
        HTMLAttributes: { class: "entity-tag" },
        renderText: ({ node }) => `@${nameOf(latest.current.profiles, node.attrs.id)}`,
        renderHTML: ({ options, node }) => [
          "span",
          mergeAttributes({ "data-type": "mention", "data-id": node.attrs.id }, options.HTMLAttributes),
          `@${nameOf(latest.current.profiles, node.attrs.id)}`,
        ],
        suggestion: {
          char: "@",
          allowSpaces: true,
          items: ({ query }) => matchProfiles(latest.current.profiles, query),
          render: () => {
            const show = (p: SuggestionProps<Profile>) =>
              setSuggest((s) => ({
                items: p.items,
                index: s && s.items.length === p.items.length ? s.index : 0,
                rect: p.clientRect?.() ?? null,
                command: (profile) => p.command({ id: profile.id, label: profile.name }),
              }));
            return {
              onStart: show,
              onUpdate: show,
              onExit: () => setSuggest(null),
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const s = suggestRef.current;
                if (!s || s.items.length === 0) return false;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setSuggest({ ...s, index: (s.index + step + s.items.length) % s.items.length });
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  s.command(s.items[s.index]);
                  return true;
                }
                if (event.key === "Escape") {
                  setSuggest(null);
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
      Extension.create({
        name: "submitShortcut",
        addKeyboardShortcuts: () => ({
          "Mod-Enter": () => {
            latest.current.onSubmit?.();
            return true;
          },
        }),
      }),
    ],
    content: props.initial,
    contentType: "markdown",
    autofocus: props.autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "rich-editor post-md text-sm leading-relaxed text-slate-700 outline-none" },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files;
        if (files && files.length > 0) {
          latest.current.onFiles?.(files);
          return true;
        }
        return false;
      },
      // Dropped files bubble up to the composer, which attaches them.
      handleDrop: (_view, event) => !!(event as DragEvent).dataTransfer?.files?.length,
    },
    onUpdate: ({ editor }) => latest.current.onChange(editor.isEmpty ? "" : editor.getMarkdown()),
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(),
      clear: () => editor?.commands.clearContent(true),
      startMention: () => {
        if (!editor) return;
        const { from } = editor.state.selection;
        const before = from > 1 ? editor.state.doc.textBetween(from - 1, from) : "";
        editor.chain().focus().insertContent(before && !/\s/.test(before) ? " @" : "@").run();
      },
    }),
    [editor],
  );

  // Re-render mentions when a profile is renamed.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("profilesChanged", true));
  }, [editor, props.profiles]);

  if (!editor) return null;
  return (
    <div className={props.expanded ? "flex min-h-0 flex-1 flex-col" : ""}>
      <Toolbar editor={editor} expanded={props.expanded} onToggleExpand={props.onToggleExpand} />
      <EditorContent editor={editor} className={props.expanded ? "thin-scroll min-h-0 flex-1 overflow-y-auto py-2" : "py-2"} />
      {suggest && suggest.items.length > 0 && suggest.rect && <MentionMenu state={suggest} />}
    </div>
  );
});

/** Mention node that reads and writes `@[profile:<uuid>]` in Markdown. */
const JournalMention = Mention.extend({
  markdownTokenName: "journalMention",
  markdownTokenizer: {
    name: "journalMention",
    level: "inline",
    start: (src: string) => src.indexOf("@[profile:"),
    tokenize: (src: string) => {
      const m = MENTION_TOKEN.exec(src);
      return m ? { type: "journalMention", raw: m[0], id: m[1] } : undefined;
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode("mention", { id: token.id, label: null }),
  renderMarkdown: (node) => `@[profile:${node.attrs?.id}]`,
});

function nameOf(profiles: Profile[], id: string): string {
  return profiles.find((p) => p.id === id)?.name ?? "deleted profile";
}

function matchProfiles(profiles: Profile[], query: string): Profile[] {
  const q = query.trim().toLowerCase();
  return profiles
    .filter((p) => p.name.toLowerCase().includes(q))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
    .slice(0, 6);
}

function MentionMenu({ state }: { state: SuggestState }) {
  const rect = state.rect!;
  const below = rect.bottom + 280 < window.innerHeight;
  return (
    <ul
      className="fixed z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
      style={below ? { top: rect.bottom + 6, left: rect.left } : { bottom: window.innerHeight - rect.top + 6, left: rect.left }}
    >
      {state.items.map((p, i) => (
        <li key={p.id}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              state.command(p);
            }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === state.index ? "bg-brand-50" : "hover:bg-slate-50"}`}
          >
            <Avatar profile={p} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
              <span className="block text-xs text-slate-400">{subtitle(p)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Toolbar({ editor, expanded, onToggleExpand }: { editor: Editor; expanded?: boolean; onToggleExpand?: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const run = () => editor.chain().focus();

  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-slate-100 pb-1.5">
      <Btn icon={TextBIcon} title="Bold (⌘B)" active={s.bold} onClick={() => run().toggleBold().run()} />
      <Btn icon={TextItalicIcon} title="Italic (⌘I)" active={s.italic} onClick={() => run().toggleItalic().run()} />
      <Btn icon={TextStrikethroughIcon} title="Strikethrough" active={s.strike} onClick={() => run().toggleStrike().run()} />
      <Btn icon={CodeIcon} title="Inline code" active={s.code} onClick={() => run().toggleCode().run()} />
      <Sep />
      <Btn icon={TextHOneIcon} title="Heading 1" active={s.h1} onClick={() => run().toggleHeading({ level: 1 }).run()} />
      <Btn icon={TextHTwoIcon} title="Heading 2" active={s.h2} onClick={() => run().toggleHeading({ level: 2 }).run()} />
      <Btn icon={TextHThreeIcon} title="Heading 3" active={s.h3} onClick={() => run().toggleHeading({ level: 3 }).run()} />
      <Sep />
      <Btn icon={ListBulletsIcon} title="Bulleted list" active={s.bullet} onClick={() => run().toggleBulletList().run()} />
      <Btn icon={ListNumbersIcon} title="Numbered list" active={s.ordered} onClick={() => run().toggleOrderedList().run()} />
      <Btn icon={ListChecksIcon} title="Checklist" active={s.task} onClick={() => run().toggleTaskList().run()} />
      <Btn icon={QuotesIcon} title="Quote" active={s.quote} onClick={() => run().toggleBlockquote().run()} />
      <Btn icon={CodeBlockIcon} title="Code block" active={s.codeBlock} onClick={() => run().toggleCodeBlock().run()} />
      <Btn icon={MinusIcon} title="Divider" onClick={() => run().setHorizontalRule().run()} />
      <Sep />
      <Btn icon={LinkIcon} title="Link" active={s.link || linkOpen} onClick={() => setLinkOpen((o) => !o)} />
      <Btn icon={TableIcon} title="Insert table" active={s.table} onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {s.table && (
        <>
          <Btn icon={RowsPlusBottomIcon} title="Add row" onClick={() => run().addRowAfter().run()} />
          <Btn icon={ColumnsPlusRightIcon} title="Add column" onClick={() => run().addColumnAfter().run()} />
          <Btn icon={TrashIcon} title="Delete table" onClick={() => run().deleteTable().run()} />
        </>
      )}
      <Sep />
      <Btn icon={ArrowCounterClockwiseIcon} title="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => run().undo().run()} />
      <Btn icon={ArrowClockwiseIcon} title="Redo (⇧⌘Z)" disabled={!s.canRedo} onClick={() => run().redo().run()} />
      {onToggleExpand && (
        <div className="ml-auto">
          <Btn
            icon={expanded ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon}
            title={expanded ? "Exit focus mode (Esc)" : "Focus mode"}
            onClick={onToggleExpand}
          />
        </div>
      )}
      {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState<string>(() => editor.getAttributes("link").href ?? "");
  const apply = () => {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}` }).run();
    onClose();
  };
  return (
    <div className="absolute left-0 top-full z-30 mt-1 flex w-80 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
      <input
        autoFocus
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          } else if (e.key === "Escape") onClose();
        }}
        placeholder="Paste or type a link"
        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
      />
      <button type="button" onClick={apply} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white">
        {href.trim() ? "Apply" : "Remove"}
      </button>
    </div>
  );
}

function Btn(props: { icon: Icon; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  const I = props.icon;
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active}
      disabled={props.disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={props.onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-30 ${
        props.active ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      <I size={16} weight={props.active ? "bold" : "regular"} />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-4 w-px bg-slate-200" />;
