// Write or edit a post, as any profile, in a rich-text editor with mentions and attachments.
import { useEffect, useRef, useState } from "react";
import { AtIcon, CalendarBlankIcon, ImageIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { fromDatetimeLocal, KINDS, toDatetimeLocal } from "../lib/format";
import { AttachmentStrip, useAttachments } from "./Attachments";
import { RichEditor, type RichEditorHandle } from "./RichEditor";
import { Avatar, Button, ErrorText } from "./ui";

const KIND_ORDER = ["me", "person", "page", "shop", "place"] as const;

export function Composer(props: { defaultAuthorId?: string; editing?: Post; onDone?: () => void; placeholder?: string }) {
  const { editing, onDone } = props;
  const { snapshot, profiles, owner, refresh } = useJournal();
  const [authorId, setAuthorId] = useState(editing?.authorId ?? props.defaultAuthorId ?? owner.id);
  const [content, setContent] = useState(editing?.content ?? "");
  const [when, setWhen] = useState(() => (editing ? toDatetimeLocal(editing.occurredAt) : ""));
  const [showWhen, setShowWhen] = useState(!!editing);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<RichEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useAttachments(editing?.media ?? []);
  const [dragging, setDragging] = useState(false);

  // Follow the page we're on (e.g. composing on a shop's profile posts as that shop).
  useEffect(() => {
    if (!editing) setAuthorId(props.defaultAuthorId ?? owner.id);
  }, [props.defaultAuthorId, owner.id, editing]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const canSubmit =
    !busy && !attachments.uploading && !attachments.failed && (content.trim() !== "" || attachments.mediaIds.length > 0);

  const submit = async () => {
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
        editor.current?.clear();
        setContent("");
        setWhen("");
        setShowWhen(false);
        setExpanded(false);
      }
      await refresh();
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const author = profiles.get(authorId) ?? owner;
  const placeholder =
    props.placeholder ?? (author.kind === "me" ? "What happened today? Type @ to mention someone." : `Write something as ${author.name}…`);

  return (
    <div
      className={`${
        expanded
          ? "fixed inset-0 z-40 flex flex-col bg-white px-6 py-8"
          : editing
            ? ""
            : "rounded-2xl border bg-white p-5 shadow-sm"
      } ${dragging ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200"}`}
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
      <div className={`flex gap-4 ${expanded ? "mx-auto min-h-0 w-full max-w-3xl flex-1" : ""}`}>
        {!editing && <Avatar profile={author} />}
        <div className={`relative min-w-0 flex-1 ${expanded ? "flex flex-col" : ""}`}>
          <RichEditor
            ref={editor}
            initial={editing?.content ?? ""}
            profiles={snapshot.profiles}
            placeholder={placeholder}
            onChange={setContent}
            onSubmit={() => void submit()}
            onFiles={attachments.add}
            autoFocus={!!editing}
            expanded={expanded}
            onToggleExpand={() => setExpanded((x) => !x)}
          />

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
              <ToolButton title="Mention a profile" onClick={() => editor.current?.startMention()}>
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
