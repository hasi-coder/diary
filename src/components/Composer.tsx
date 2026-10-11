// Write or edit a post, article or album, as any profile, with a rich-text
// editor, mentions and attachments. Articles and albums open full-screen.
import { useEffect, useRef, useState } from "react";
import {
  ArticleIcon,
  AtIcon,
  CalendarBlankIcon,
  FlagBannerIcon,
  ImageIcon,
  MapPinIcon,
  SmileyIcon,
  UserPlusIcon,
  ImagesSquareIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api, errorMessage, type Activity, type Feeling, type Post, type PostKind, type Profile } from "../lib/api";
import { bindEvent, combineTitles, displayLabel, eventsOf, fillTitle, lifeEvent, unbindEvent } from "../lib/lifeEvents";
import { useJournal } from "../lib/journal";
import { fromDatetimeLocal, KINDS, toDatetimeLocal } from "../lib/format";
import { AlbumEditor, AttachmentStrip, useAttachments } from "./Attachments";
import { LifeEventBrowser, LifeEventForm } from "./LifeEventPicker";
import { CheckInPicker, clausesOf, ExtrasChips, FeelingPicker, TagPeoplePicker } from "./PostExtras";
import { StoryEditor } from "./StoryEditor";
import { RichEditor, type RichEditorHandle } from "./RichEditor";
import { Avatar, Button, ErrorText } from "./ui";

const PROFILE_KIND_ORDER = ["me", "person", "page", "shop", "place"] as const;

export const POST_KINDS: { kind: PostKind; label: string; icon: Icon }[] = [
  { kind: "status", label: "Post", icon: NotePencilIcon },
  { kind: "article", label: "Article", icon: ArticleIcon },
  { kind: "album", label: "Album", icon: ImagesSquareIcon },
  { kind: "milestone", label: "Life event", icon: FlagBannerIcon },
];

export function Composer(props: { defaultAuthorId?: string; editing?: Post; onDone?: () => void }) {
  const { editing, onDone } = props;
  const { snapshot, profiles, owner, refresh } = useJournal();
  const [kind, setKind] = useState<PostKind>(editing?.kind ?? "status");
  const [title, setTitle] = useState(editing?.title ?? "");
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
  const [withIds, setWithIds] = useState<string[]>(editing?.withIds ?? []);
  const [placeId, setPlaceId] = useState<string | null>(editing?.placeId ?? null);
  // The story, clause by clause and in order: a feeling, activities and life events.
  // (A feeling saved the old way becomes the first clause.)
  const [activities, setActivities] = useState<Activity[]>(() => (editing ? clausesOf(editing) : []));
  const setFeeling = (f: Feeling) => {
    const word = f.text.replace(/^feeling /, "");
    const clause: Activity = { emoji: f.emoji, verb: "feeling", object: word, thing: `feeling:${word}` };
    setActivities((list) => {
      const at = list.findIndex((a) => a.verb === "feeling");
      return at >= 0 ? list.map((a, i) => (i === at ? { ...a, ...clause } : a)) : [clause, ...list];
    });
  };
  // Life events: the main one first, then any combined with it.
  // Typed templates ("Visited {country}") are edited unbound, with the thing as a field value.
  const [events, setEvents] = useState<string[]>(() => (editing ? eventsOf(editing).map((id) => unbindEvent(id).id) : []));
  // Which slot the browser fills: an index to replace, events.length to add one, null when closed.
  const [picking, setPicking] = useState<number | null>(null);
  // Template inputs per event, the profiles picked for them ("<event>|<key>"),
  // and whether the title was typed by hand (then it stops following the templates).
  const [eventValues, setEventValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries((editing ? eventsOf(editing) : []).map((id) => [unbindEvent(id).id, unbindEvent(id).values])),
  );
  const [eventLinks, setEventLinks] = useState<Record<string, Profile>>({});
  const [titleEdited, setTitleEdited] = useState(!!editing);
  const [picker, setPicker] = useState<"with" | "place" | "feeling" | null>(null);

  const fullScreen = expanded || kind !== "status";

  // Follow the page we're on (e.g. composing on a shop's profile posts as that shop).
  useEffect(() => {
    if (!editing) setAuthorId(props.defaultAuthorId ?? owner.id);
  }, [props.defaultAuthorId, owner.id, editing]);

  const close = () => {
    if (editing && kind !== "status") return onDone?.();
    setExpanded(false);
    if (!editing) setKind("status");
  };

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const unlink = (p: Profile | undefined) => {
    if (!p) return;
    setWithIds((ids) => ids.filter((x) => x !== p.id));
    setPlaceId((id) => (id === p.id ? null : id));
  };
  const link = (p: Profile) => {
    if (p.kind === "person" || p.kind === "me") setWithIds((ids) => (ids.includes(p.id) || p.id === authorId ? ids : [...ids, p.id]));
    else setPlaceId(p.id);
  };

  const autoTitle = (ids: string[], values: Record<string, Record<string, string>>) => {
    if (!titleEdited) setTitle(combineTitles(ids.map((id) => fillTitle(lifeEvent(id), values[id] ?? {}) ?? displayLabel(lifeEvent(id)))));
  };

  /** Drop an event's inputs, untagging the profiles picked for it. */
  const forget = (id: string) => {
    const links = Object.entries(eventLinks).filter(([k]) => k.startsWith(`${id}|`));
    links.forEach(([, p]) => unlink(p));
    setEventLinks((all) => Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith(`${id}|`))));
    const { [id]: _, ...values } = eventValues;
    setEventValues(values);
    return values;
  };

  const pickEvent = (picked: string) => {
    const slot = picking ?? 0;
    setPicking(null);
    // "Visited Japan" from a search becomes "Visited {country}" with Japan filled in.
    const { id, values: implied } = unbindEvent(picked);
    if (events.includes(id)) return;
    const values = { ...(slot < events.length ? forget(events[slot]) : eventValues), [id]: implied };
    setEventValues(values);
    const next = slot < events.length ? events.map((e, i) => (i === slot ? id : e)) : [...events, id];
    setEvents(next);
    autoTitle(next, values);
  };

  const removeEvent = (index: number) => {
    const values = forget(events[index]);
    const next = events.filter((_, i) => i !== index);
    setEvents(next);
    autoTitle(next, values);
  };

  const setEventValue = (id: string, key: string, value: string, profile: Profile | null) => {
    const values = { ...eventValues, [id]: { ...eventValues[id], [key]: value } };
    setEventValues(values);
    const linkKey = `${id}|${key}`;
    if (eventLinks[linkKey]?.id !== profile?.id) {
      unlink(eventLinks[linkKey]);
      if (profile) link(profile);
      setEventLinks(({ [linkKey]: _, ...rest }) => (profile ? { ...rest, [linkKey]: profile } : rest));
    }
    autoTitle(events, values);
  };

  const hasText = content.trim() !== "";
  const ready = !busy && !attachments.uploading && !attachments.failed;
  const canSubmit =
    ready &&
    (kind === "status"
      ? hasText || attachments.mediaIds.length > 0
      : kind === "article"
        ? title.trim() !== "" && hasText
        : kind === "milestone"
          ? title.trim() !== "" && events.length > 0
          : title.trim() !== "" && attachments.mediaIds.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.savePost({
        id: editing?.id,
        kind,
        title,
        authorId,
        content,
        occurredAt: when ? fromDatetimeLocal(when) : undefined,
        mediaIds: attachments.mediaIds,
        captions: attachments.captions,
        withIds,
        placeId,
        feeling: null,
        activities,
        eventType: events[0] ? bindEvent(events[0], eventValues[events[0]] ?? {}) : "",
        alsoEventTypes: events.slice(1).map((id) => bindEvent(id, eventValues[id] ?? {})),
      });
      attachments.committed();
      if (!editing) {
        editor.current?.clear();
        setContent("");
        setTitle("");
        setWhen("");
        setShowWhen(false);
        setExpanded(false);
        setKind("status");
        setWithIds([]);
        setPlaceId(null);
        setActivities([]);
        setEvents([]);
        setPicking(null);
        setEventValues({});
        setEventLinks({});
        setTitleEdited(false);
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
    kind === "article"
      ? "Tell the story… Type @ to mention someone."
      : kind === "album"
        ? "Say something about this album (optional)…"
        : kind === "milestone"
          ? "Tell the story behind it (optional)…"
        : author.kind === "me"
          ? "What happened today? Type @ to mention someone."
          : `Write something as ${author.name}…`;
  const saveLabel = editing
    ? "Save changes"
    : { status: "Encrypt & Save", article: "Publish article", album: "Create album", milestone: "Add life event" }[kind];
  const hint =
    kind === "milestone" && events.length === 0
      ? "Choose the kind of life event"
      : kind === "article" && !title.trim()
      ? "Add a title"
      : kind === "album" && !title.trim()
        ? "Name the album"
        : kind === "album" && attachments.mediaIds.length === 0
          ? "Add photos"
          : attachments.failed
            ? "Remove the failed attachments first"
            : "⌘/Ctrl + Enter";

  const kindTabs = !editing && (
    <div className="flex gap-1">
      {POST_KINDS.map(({ kind: k, label, icon: KindIcon }) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            setKind(k);
            if (k === "milestone") setShowWhen(true);
          }}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            kind === k ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <KindIcon size={16} /> {label}
        </button>
      ))}
    </div>
  );

  const editorEl = (
    <RichEditor
      ref={editor}
      initial={content}
      profiles={snapshot.profiles}
      placeholder={placeholder}
      onChange={setContent}
      onSubmit={() => void submit()}
      onFiles={attachments.add}
      autoFocus={!!editing && kind === "status"}
      expanded={fullScreen && kind !== "album"}
      onToggleExpand={kind === "status" ? () => setExpanded((x) => !x) : undefined}
    />
  );

  const titleInput = kind !== "status" && (
    // A textarea so long (e.g. combined life-event) titles wrap; Enter never adds a newline.
    <textarea
      ref={(el) => {
        if (el) el.style.height = `${el.scrollHeight}px`;
      }}
      rows={1}
      value={title}
      onChange={(e) => {
        setTitle(e.target.value.replace(/\n/g, " "));
        if (kind === "milestone") setTitleEdited(e.target.value !== "");
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      autoFocus={!editing}
      placeholder={kind === "article" ? "Article title" : kind === "milestone" ? "What happened?" : "Album name"}
      className="mb-3 w-full resize-none overflow-hidden bg-transparent text-3xl font-bold leading-tight text-slate-900 placeholder-slate-300 outline-none"
    />
  );


  return (
    <div
      className={`${
        fullScreen ? "fixed inset-0 z-40 m-0 flex flex-col bg-white" : editing ? "" : "rounded-2xl border bg-white p-5 shadow-sm"
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
      {fullScreen && (
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
          {kindTabs || (
            <span className="text-sm font-semibold text-slate-600">
              Editing {POST_KINDS.find((k) => k.kind === kind)?.label.toLowerCase()}
            </span>
          )}
          <button type="button" onClick={close} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
      )}
      {!fullScreen && kindTabs && <div className="-mt-1 mb-3">{kindTabs}</div>}

      <div className={fullScreen ? "thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6" : ""}>
        <div className={`flex gap-4 ${fullScreen ? `mx-auto w-full ${kind === "album" ? "max-w-5xl" : "max-w-3xl"} ${kind === "album" ? "" : "h-full"}` : ""}`}>
          {!editing && !fullScreen && <Avatar profile={author} />}
          <div className={`relative min-w-0 flex-1 ${fullScreen && kind !== "album" ? "flex flex-col" : ""}`}>
            {kind === "milestone" && (events.length === 0 || picking !== null) ? (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-600">
                    {events.length === 0 ? "What kind of life event?" : picking === events.length ? "Combine with another life event" : "Choose a different life event"}
                  </p>
                  {events.length > 0 && (
                    <button type="button" onClick={() => setPicking(null)} className="text-sm font-medium text-slate-500 hover:text-slate-800">
                      Cancel
                    </button>
                  )}
                </div>
                <LifeEventBrowser onPick={pickEvent} />
              </div>
            ) : (
              <>
                {kind === "milestone" && (
                  <div className="mb-5 space-y-2">
                    {events.map((id, i) => (
                      <LifeEventForm
                        key={id}
                        template={lifeEvent(bindEvent(id, eventValues[id] ?? {}))}
                        values={eventValues[id] ?? {}}
                        onValue={(key, value, profile) => setEventValue(id, key, value, profile)}
                        onChange={() => setPicking(i)}
                        onRemove={events.length > 1 ? () => removeEvent(i) : undefined}
                      />
                    ))}
                    {events.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setPicking(events.length)}
                        className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-700"
                      >
                        + Combine with another life event
                      </button>
                    )}
                    <p className="text-xs text-slate-400">The title below fills itself in; edit it freely.</p>
                  </div>
                )}
                {titleInput}
                {editorEl}
              </>
            )}

            {kind === "album" ? (
              <div className="mt-4">
                <AlbumEditor
                  items={attachments.items}
                  onRemove={attachments.remove}
                  onCaption={attachments.setCaption}
                  onMove={attachments.move}
                  onAdd={() => fileInput.current?.click()}
                />
              </div>
            ) : (
              <>
                {kind === "article" && attachments.items.length > 0 && (
                  <p className="mt-2 text-xs text-slate-400">The first image is the article's cover.</p>
                )}
                <AttachmentStrip items={attachments.items} onRemove={attachments.remove} />
              </>
            )}
            <StoryEditor clauses={activities} onChange={setActivities} authorId={authorId} withIds={withIds} placeId={placeId} />
            <ExtrasChips
              withIds={withIds}
              placeId={placeId}
              onRemoveWith={(id) => setWithIds((ids) => ids.filter((x) => x !== id))}
              onRemovePlace={() => setPlaceId(null)}
            />

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
            {!fullScreen && footer()}
            {error && <ErrorText>{error}</ErrorText>}
          </div>
        </div>
      </div>
      {fullScreen && (
        <div className="border-t border-slate-100 px-6 py-3">
          <div className={`mx-auto ${kind === "album" ? "max-w-5xl" : "max-w-3xl"}`}>
            {footer()}
          </div>
        </div>
      )}
    </div>
  );

  function footer() {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 ${fullScreen ? "" : "mt-2 border-t border-slate-100 pt-3"}`}>
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
          <div className="relative">
            <ToolButton title="Tag people" active={withIds.length > 0} onClick={() => setPicker(picker === "with" ? null : "with")}>
              <UserPlusIcon size={20} />
            </ToolButton>
            {picker === "with" && <TagPeoplePicker selected={withIds} exclude={authorId} onChange={setWithIds} onClose={() => setPicker(null)} />}
          </div>
          <div className="relative">
            <ToolButton title="Check in" active={!!placeId} onClick={() => setPicker(picker === "place" ? null : "place")}>
              <MapPinIcon size={20} />
            </ToolButton>
            {picker === "place" && <CheckInPicker onPick={setPlaceId} onClose={() => setPicker(null)} />}
          </div>
          <div className="relative">
            <ToolButton title="Feeling / activity" active={activities.length > 0} onClick={() => setPicker(picker === "feeling" ? null : "feeling")}>
              <SmileyIcon size={20} />
            </ToolButton>
            {picker === "feeling" && <FeelingPicker onPick={setFeeling} onAddActivity={(a) => setActivities((list) => [...list, a].slice(0, 12))} onClose={() => setPicker(null)} />}
          </div>
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
              {PROFILE_KIND_ORDER.map((k) => {
                const group = snapshot.profiles.filter((p) => p.kind === k);
                if (group.length === 0) return null;
                return (
                  <optgroup key={k} label={KINDS[k].plural}>
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
          <Button variant="dark" onClick={submit} disabled={!canSubmit} title={hint}>
            {saveLabel} <ShieldCheckIcon />
          </Button>
        </div>
      </div>
    );
  }
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
