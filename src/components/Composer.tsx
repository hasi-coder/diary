// Write or edit a post, as any profile, with @mention autocomplete and attachments.
import { useEffect, useMemo, useRef, useState } from "react";
import { AtIcon, CalendarBlankIcon, ImageIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Post, type Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import { fromDatetimeLocal, KINDS, subtitle, toDatetimeLocal } from "../lib/format";
import { activeMentionQuery, toEditable, toStored } from "../lib/mentions";
import { AttachmentStrip, useAttachments } from "./Attachments";
import { Avatar, Button, ErrorText } from "./ui";

const KIND_ORDER = ["me", "person", "page", "shop", "place"] as const;

export function Composer(props: { defaultAuthorId?: string; editing?: Post; onDone?: () => void; placeholder?: string }) {
  const { editing, onDone } = props;
  const { snapshot, profiles, owner, refresh } = useJournal();
  const [authorId, setAuthorId] = useState(editing?.authorId ?? props.defaultAuthorId ?? owner.id);
  const [text, setText] = useState(() => (editing ? toEditable(editing.content, profiles) : ""));
  const [when, setWhen] = useState(() => (editing ? toDatetimeLocal(editing.occurredAt) : ""));
  const [showWhen, setShowWhen] = useState(!!editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useAttachments(editing?.media ?? []);
  const [dragging, setDragging] = useState(false);

  // Follow the page we're on (e.g. composing on a shop's profile posts as that shop).
  useEffect(() => {
    if (!editing) setAuthorId(props.defaultAuthorId ?? owner.id);
  }, [props.defaultAuthorId, owner.id, editing]);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 60)}px`;
  }, [text]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return snapshot.profiles
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
      .slice(0, 6);
  }, [mention, snapshot.profiles]);

  const trackMention = (value: string, caret: number) => {
    setMention(activeMentionQuery(value, caret));
    setHighlight(0);
  };

  const pick = (p: Profile) => {
    const el = textarea.current;
    if (!el || !mention) return;
    const before = text.slice(0, mention.start);
    const insert = `@${p.name} `;
    setText(before + insert + text.slice(el.selectionStart));
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertAt = () => {
    const el = textarea.current;
    if (!el) return;
    const pos = el.selectionStart;
    const needsSpace = pos > 0 && !/\s/.test(text[pos - 1]);
    const next = text.slice(0, pos) + (needsSpace ? " @" : "@") + text.slice(pos);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = pos + (needsSpace ? 2 : 1);
      el.setSelectionRange(caret, caret);
      trackMention(next, caret);
    });
  };

  const submit = async () => {
    const content = toStored(text.trim(), snapshot.profiles);
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.savePost({
        id: editing?.id,
        authorId,
        content,
        occurredAt: when ? fromDatetimeLocal(when) : undefined,
        mediaIds: attachments.mediaIds,
      });
      attachments.committed();
      if (!editing) {
        setText("");
        setWhen("");
        setShowWhen(false);
      }
      await refresh();
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && suggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[highlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && editing) {
      onDone?.();
    }
  };

  const canSubmit =
    !busy && !attachments.uploading && !attachments.failed && (text.trim() !== "" || attachments.mediaIds.length > 0);

  const author = profiles.get(authorId) ?? owner;
  const placeholder =
    props.placeholder ??
    (author.kind === "me" ? "What happened today? (Markdown, @mentions and #tags)" : `Write something as ${author.name}…`);

  return (
    <div
      className={`${editing ? "" : "rounded-2xl border bg-white p-5 shadow-sm"} ${
        dragging ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200"
      }`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        setDragging(false);
        attachments.add(e.dataTransfer.files);
      }}
    >
      <div className="flex gap-4">
        {!editing && <Avatar profile={author} />}
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textarea}
            value={text}
            autoFocus={!!editing}
            onChange={(e) => {
              setText(e.target.value);
              trackMention(e.target.value, e.target.selectionStart);
            }}
            onClick={(e) => trackMention(text, e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            onPaste={(e) => {
              if (e.clipboardData.files.length > 0) {
                e.preventDefault();
                attachments.add(e.clipboardData.files);
              }
            }}
            className="min-h-[60px] w-full resize-none bg-transparent text-sm leading-relaxed text-slate-700 placeholder-slate-400 outline-none"
            placeholder={placeholder}
          />

          {mention && suggestions.length > 0 && (
            <ul className="absolute left-0 z-30 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {suggestions.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(p);
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === highlight ? "bg-brand-50" : "hover:bg-slate-50"}`}
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
          )}

          <AttachmentStrip items={attachments.items} onRemove={attachments.remove} />

          {showWhen && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <CalendarBlankIcon />
              <span>Happened on</span>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
              />
              {!when && <span className="text-slate-400">(leave empty for now)</span>}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1">
              <ToolButton title="Attach photos or videos (or drag & drop, or paste)" onClick={() => fileInput.current?.click()}>
                <ImageIcon size={20} />
              </ToolButton>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,video/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) attachments.add(e.target.files);
                  e.target.value = "";
                }}
              />
              <ToolButton title="Mention a profile" onClick={insertAt}>
                <AtIcon size={20} />
              </ToolButton>
              <ToolButton title="Set the date" active={showWhen} onClick={() => setShowWhen((s) => !s)}>
                <CalendarBlankIcon size={20} />
              </ToolButton>
              <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-500">
                as
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="max-w-[11rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
                >
                  {KIND_ORDER.map((kind) => {
                    const group = snapshot.profiles.filter((p) => p.kind === kind);
                    if (group.length === 0) return null;
                    return (
                      <optgroup key={kind} label={KINDS[kind].plural}>
                        {group.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {editing && (
                <Button variant="ghost" onClick={onDone}>
                  Cancel
                </Button>
              )}
              <Button variant="dark" onClick={submit} disabled={!canSubmit} title={attachments.failed ? "Remove the failed attachments first" : "⌘/Ctrl + Enter"}>
                {editing ? "Save changes" : "Encrypt & Save"} <ShieldCheckIcon />
              </Button>
            </div>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </div>
    </div>
  );
}

function ToolButton(props: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className={`rounded-lg p-2 transition-colors hover:bg-brand-50 hover:text-brand-500 ${props.active ? "bg-brand-50 text-brand-600" : "text-slate-400"}`}
    >
      {props.children}
    </button>
  );
}
