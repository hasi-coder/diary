// Write or edit a post, article or album, as any profile, with a rich-text
// editor, mentions, attachments, a poll (posts only) and a story (feelings, activities, life events
// and roles, in order). Articles and albums open full-screen.
import { useEffect, useRef, useState } from "react";
import {
  ArticleIcon,
  AtIcon,
  BooksIcon,
  CalendarBlankIcon,
  ImageIcon,
  MapPinIcon,
  SmileyIcon,
  UserPlusIcon,
  ImagesSquareIcon,
  ListChecksIcon,
  NotePencilIcon,
  ShieldCheckIcon,
  StackIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api, errorMessage, MAX_MEDIA_PER_POST, type Activity, type Post, type PostKind } from "../lib/api";
import { kindOf, storyOf } from "../lib/story";
import { useJournal } from "../lib/journal";
import { fromDatetimeLocal, KINDS, MONTHS, toDatetimeLocal } from "../lib/format";
import { AlbumEditor, AttachmentStrip, useAttachments } from "./Attachments";
import { CheckInPicker, ExtrasChips, TagPeoplePicker } from "./PostExtras";
import { StoryEditor } from "./StoryEditor";
import { StoryPicker } from "./StoryPicker";
import { PasteButton } from "./PasteButton";
import { PollEditor, usePollDraft } from "./Poll";
import { usePasteImages } from "../lib/uploads";
import { inlineCaptions } from "../lib/inlinePhotos";
import { SeriesBadges, SeriesPicker } from "./SeriesParts";
import { MemoryEmbed, SharedMemory } from "./SharedMemory";
import { RichEditor, type RichEditorHandle } from "./RichEditor";
import { Avatar, Button, ErrorText } from "./ui";

const PROFILE_KIND_ORDER = ["me", "person", "page", "shop", "place"] as const;

export const POST_KINDS: { kind: PostKind; label: string; icon: Icon }[] = [
  { kind: "status", label: "Post", icon: NotePencilIcon },
  { kind: "article", label: "Article", icon: ArticleIcon },
  { kind: "album", label: "Album", icon: ImagesSquareIcon },
];

export function Composer(props: {
  defaultAuthorId?: string;
  editing?: Post;
  onDone?: () => void;
  /** Start as this kind (new posts). */
  defaultKind?: PostKind;
  /** Start in these series (new posts), e.g. a new part from a series' page. */
  defaultSeriesIds?: string[];
  /** Opened on its own, full-screen: closing it calls this instead of going back to the inline box. */
  onCancel?: () => void;
  /** Share this earlier post as a memory (new posts). */
  sharing?: Post;
}) {
  const { editing, onDone, onCancel } = props;
  const { snapshot, profiles, owner, refresh } = useJournal();
  // Life-event posts from before stories are edited as posts: their events become clauses.
  const [kind, setKind] = useState<PostKind>(editing?.kind === "milestone" ? "status" : (editing?.kind ?? props.defaultKind ?? "status"));
  const [title, setTitle] = useState(editing?.kind === "milestone" ? "" : (editing?.title ?? ""));
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
  const poll = usePollDraft(editing?.poll);
  const [layered, setLayered] = useState(editing?.layered ?? false);
  const layers = kind === "album" && layered;
  const layerProblem = !layers
    ? null
    : attachments.items.some((a) => a.media?.kind === "video")
      ? "Layers are photos only: remove the videos"
      : attachments.mediaIds.length < 2
        ? "Add at least two photos to layer"
        : null;
  const asking = kind === "status" && poll.open;
  const [dragging, setDragging] = useState(false);
  const [withIds, setWithIds] = useState<string[]>(editing?.withIds ?? []);
  const [placeId, setPlaceId] = useState<string | null>(editing?.placeId ?? null);
  // The story, clause by clause and in order: feelings, activities, life events and roles.
  const [activities, setActivities] = useState<Activity[]>(() => (editing ? storyOf(editing) : []));
  // New clauses follow how the story is being told: "is" (now) or "was" (then).
  const [tense, setTense] = useState<"is" | "was">(() => (editing && storyOf(editing).some((c) => c.tense === "was") ? "was" : "is"));
  const addClause = (c: Activity) =>
    setActivities((list) => [...list, kindOf(c) === "state" && tense === "was" ? { ...c, tense: "was" as const } : c].slice(0, 12));
  const [picker, setPicker] = useState<"with" | "place" | "story" | "series" | null>(null);
  const [seriesIds, setSeriesIds] = useState<string[]>(editing?.seriesIds ?? props.defaultSeriesIds ?? []);
  const [sharedPostId, setSharedPostId] = useState<string | null>(editing?.sharedPostId ?? props.sharing?.id ?? null);
  const sharing = kind === "status" && sharedPostId !== null;

  // What it was saved as (life events from before stories edit as posts); editing can convert it.
  const savedKind: PostKind | null = editing ? (editing.kind === "milestone" ? "status" : editing.kind) : null;
  const converting = savedKind !== null && kind !== savedKind;
  // Articles and albums edit full-screen, even when turned into a post.
  const lockedFull = savedKind === "article" || savedKind === "album" || !!onCancel;
  const fullScreen = expanded || kind !== "status" || lockedFull;
  const tooMany = kind !== "album" && attachments.items.length > MAX_MEDIA_PER_POST;
  // ⌘V anywhere in a full-screen composer attaches images (the editor handles its own pastes).
  usePasteImages(attachments.add, fullScreen);

  // Follow the page we're on (e.g. composing on a shop's profile posts as that shop).
  useEffect(() => {
    if (!editing) setAuthorId(props.defaultAuthorId ?? owner.id);
  }, [props.defaultAuthorId, owner.id, editing]);

  const close = () => {
    if (onCancel) return onCancel();
    if (editing && (kind !== "status" || lockedFull)) return onDone?.();
    setExpanded(false);
    if (!editing) setKind("status");
  };

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hasText = content.trim() !== "";
  const ready = !busy && !attachments.uploading && !attachments.failed;
  const canSubmit =
    ready &&
    !tooMany &&
    (asking
      ? hasText && !poll.problem
      : kind === "status"
        ? hasText || sharing || attachments.mediaIds.length > 0 || activities.some((c) => c.object.trim() !== "")
        : kind === "article"
          ? title.trim() !== "" && hasText
          : title.trim() !== "" && attachments.mediaIds.length > 0 && !layerProblem);

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
        // Captions written under photos in an article's text are the photos' captions too.
        captions: { ...attachments.captions, ...(kind === "article" ? inlineCaptions(content) : {}) },
        withIds,
        placeId,
        feeling: null,
        activities,
        eventType: "",
        alsoEventTypes: [],
        seriesIds,
        layered: layers,
        poll: asking ? poll.input() : null,
        sharedPostId: sharing ? sharedPostId : null,
      });
      attachments.committed();
      poll.committed();
      // A composer opened on its own closes after saving; the inline one empties for the next post.
      if (!editing && !onCancel) {
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
        setTense("is");
        setSeriesIds([]);
        setLayered(false);
        setSharedPostId(null);
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
  const placeholder = asking
    ? "Ask a question… Type @ to mention someone."
    : kind === "article"
      ? "Tell the story… Type @ to mention someone."
      : kind === "album"
        ? "Say something about this album (optional)…"
        : sharing
          ? "Say something about this memory…"
          : author.kind === "me"
          ? "What happened today? Type @ to mention someone."
          : `Write something as ${author.name}…`;
  const kindLabel = (k: PostKind) => (POST_KINDS.find((x) => x.kind === k)?.label ?? "Post").toLowerCase();
  const saveLabel = editing
    ? converting
      ? `Save as ${kindLabel(kind)}`
      : "Save changes"
    : { status: "Encrypt & Save", article: "Publish article", album: "Create album", milestone: "Encrypt & Save" }[kind];
  const hint = tooMany
    ? `${kind === "article" ? "Articles" : "Posts"} take up to ${MAX_MEDIA_PER_POST} photos and videos (this has ${attachments.items.length}): remove some, or keep it an album`
    : kind === "article" && !title.trim()
      ? "Add a title"
      : kind === "article" && !hasText
        ? "Write the article"
        : kind === "album" && !title.trim()
        ? "Name the album"
        : kind === "album" && attachments.mediaIds.length === 0
          ? "Add photos"
          : layerProblem
            ? layerProblem
            : attachments.failed
              ? "Remove the failed attachments first"
              : asking && !hasText
                ? "Ask a question for the poll"
                : (asking && poll.problem) || "⌘/Ctrl + Enter";

  // What a conversion does to the post, said before saving.
  const conversionNote =
    converting &&
    [
      `Saving turns this ${kindLabel(savedKind!)} into ${kind === "article" ? "an article" : kind === "album" ? "an album" : "a post"}.`,
      kind === "article" && "Give it a title and some text; the first photo becomes the cover and captions are kept. Place photos in the text with the photo button in the toolbar.",
      kind === "album" && "Name it; the text becomes the album's description and photos keep their captions.",
      kind === "status" && editing?.title && `Posts have no title, so “${editing.title}” will be dropped.`,
      kind !== "album" && editing?.layered && "Layers are for albums only, so the photos will show as a grid.",
      kind !== "status" && editing?.poll && "Its poll and votes will be removed.",
    ]
      .filter(Boolean)
      .join(" ");

  const kindTabs = (
    <div className="flex items-center gap-1">
      {editing && <span className="mr-1 text-sm font-semibold text-slate-600">Editing as</span>}
      {POST_KINDS.map(({ kind: k, label, icon: KindIcon }) => (
        <button
          key={k}
          type="button"
          onClick={() => setKind(k)}
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
      photos={kind === "article" ? { items: attachments.items, add: attachments.add } : undefined}
      autoFocus={!!editing && kind === "status"}
      expanded={fullScreen && kind !== "album"}
      onToggleExpand={kind === "status" && !lockedFull ? () => setExpanded((x) => !x) : undefined}
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
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      autoFocus={!editing}
      placeholder={kind === "article" ? "Article title" : "Album name"}
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
      onDropCapture={() => setDragging(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        attachments.add(e.dataTransfer.files);
      }}
    >
      {fullScreen && (
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
          {kindTabs}
          <button type="button" onClick={close} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <XIcon size={20} />
          </button>
        </div>
      )}
      {!fullScreen && <div className="-mt-1 mb-3">{kindTabs}</div>}

      <div className={fullScreen ? "thin-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6" : ""}>
        <div className={`flex gap-4 ${fullScreen ? `mx-auto w-full ${kind === "album" ? "max-w-5xl" : "max-w-3xl"} ${kind === "album" ? "" : "h-full"}` : ""}`}>
          {!editing && !fullScreen && <Avatar profile={author} />}
          <div className={`relative min-w-0 flex-1 ${fullScreen && kind !== "album" ? "flex flex-col" : ""}`}>
            {conversionNote && <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{conversionNote}</p>}
            {titleInput}
            {editorEl}

            {kind === "album" ? (
              <div className="mt-4">
                <LayersToggle on={layered} onChange={setLayered} />
                <AlbumEditor
                  layered={layered}
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
                  <p className="mt-2 text-xs text-slate-400">
                    Photos placed in the text show there. The first of the others is the cover, and the rest follow the article.
                  </p>
                )}
                <AttachmentStrip items={attachments.items} onRemove={attachments.remove} />
                {asking && <PollEditor draft={poll} />}
                {sharing &&
                  (props.sharing && props.sharing.id === sharedPostId ? (
                    <MemoryEmbed compact post={props.sharing} asOf={(when && fromDatetimeLocal(when)) || Date.now()} onRemove={() => setSharedPostId(null)} />
                  ) : (
                    <SharedMemory compact id={sharedPostId!} asOf={editing?.occurredAt ?? Date.now()} />
                  ))}
              </>
            )}
            <SeriesBadges post={{ id: editing?.id ?? "", seriesIds }} />
            <StoryEditor
              clauses={activities}
              onChange={setActivities}
              authorId={authorId}
              withIds={withIds}
              placeId={placeId}
              tense={tense}
              onTense={(t) => (setTense(t), setActivities((list) => list.map((c) => (kindOf(c) === "state" ? { ...c, tense: t === "was" ? ("was" as const) : undefined } : c))))}
              onAdd={() => setPicker("story")}
            />
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
                <DateTimeInput value={when} onChange={setWhen} />
                {when ? (
                  <button type="button" onClick={() => setWhen("")} className="text-slate-400 hover:text-slate-600 hover:underline">
                    Clear
                  </button>
                ) : (
                  <span className="text-slate-400">(leave empty for now)</span>
                )}
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
          <PasteButton
            onFiles={attachments.add}
            iconSize={20}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-500"
          />
          {kind === "status" && (
            <ToolButton title="Add a poll" active={poll.open} onClick={poll.start}>
              <ListChecksIcon size={20} />
            </ToolButton>
          )}
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
            <ToolButton title="Part of a series" active={seriesIds.length > 0} onClick={() => setPicker(picker === "series" ? null : "series")}>
              <BooksIcon size={20} />
            </ToolButton>
            {picker === "series" && <SeriesPicker selected={seriesIds} onChange={setSeriesIds} onClose={() => setPicker(null)} />}
          </div>
          <div className="relative">
            <ToolButton title="Check in" active={!!placeId} onClick={() => setPicker(picker === "place" ? null : "place")}>
              <MapPinIcon size={20} />
            </ToolButton>
            {picker === "place" && <CheckInPicker onPick={setPlaceId} onClose={() => setPicker(null)} />}
          </div>
          <div className="relative">
            <ToolButton title="Add to the story: feeling, doing, life event, as …" active={activities.length > 0} onClick={() => setPicker("story")}>
              <SmileyIcon size={20} />
            </ToolButton>
            {picker === "story" && <StoryPicker onAdd={addClause} onClose={() => setPicker(null)} />}
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

const pickClass = "rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none";

/**
 * Day, month, year and time, as "YYYY-MM-DDTHH:mm" ("" for now). Dropdowns
 * rather than the webview's calendar, which only steps a month at a time.
 * Picking any part of an empty date fills the rest from now.
 */
function DateTimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [date, time] = (value || toDatetimeLocal(Date.now())).split("T");
  const [y, m, d] = date.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const set = (year: number, month: number, day: number, hm = time) => {
    const days = new Date(year, month, 0).getDate();
    onChange(`${year}-${pad(month)}-${pad(Math.min(day, days))}T${hm}`);
  };
  const thisYear = new Date().getFullYear();
  const first = Math.min(1900, y);
  const years = Array.from({ length: Math.max(thisYear + 1, y) - first + 1 }, (_, i) => Math.max(thisYear + 1, y) - i);
  const days = new Date(y, m, 0).getDate();
  return (
    <span className={`flex items-center gap-1 ${value ? "" : "opacity-60"}`}>
      <select value={d} onChange={(e) => set(y, m, Number(e.target.value))} className={pickClass} aria-label="Day">
        {Array.from({ length: days }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select value={m} onChange={(e) => set(y, Number(e.target.value), d)} className={pickClass} aria-label="Month">
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select value={y} onChange={(e) => set(Number(e.target.value), m, d)} className={pickClass} aria-label="Year">
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <input
        type="time"
        value={time}
        onChange={(e) => e.target.value && set(y, m, d, e.target.value)}
        className={pickClass}
        aria-label="Time"
      />
    </span>
  );
}

/** Album or layers: layers stack the photos, in order, behind a slider. */
function LayersToggle(props: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Show photos as">
        {([
          [false, "Photos", ImagesSquareIcon],
          [true, "Layers", StackIcon],
        ] as const).map(([value, label, LabelIcon]) => (
          <button
            key={label}
            type="button"
            onClick={() => props.onChange(value)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              props.on === value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LabelIcon size={14} /> {label}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500">
        {props.on
          ? "Photos stack in order behind a slider: before and after, outside and inside. Name each layer in its caption."
          : "A grid of photos and videos."}
      </span>
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
