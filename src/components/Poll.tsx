// Polls, as on Facebook: a status post's text is the question, and each option
// has text, a photo, or both. Anyone can vote (you, or as one of your people),
// so the journal can record what everyone picked.
import { useState } from "react";
import {
  CheckSquareIcon,
  CircleIcon,
  CircleNotchIcon,
  ImageIcon,
  ListChecksIcon,
  PlusIcon,
  RadioButtonIcon,
  SquareIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api, errorMessage, type Poll, type PollInput, type PollOption, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { useAttachments, type Attachment } from "./Attachments";
import { MediaPreview } from "./Media";
import { ActAsPicker } from "./PostFooter";
import { Avatar, inputClass } from "./ui";

// Mirrors MAX_POLL_OPTIONS in src-tauri/src/store.rs.
const MAX_OPTIONS = 10;

interface DraftOption {
  key: string;
  /** Set for options already on the poll, so they keep their votes. */
  id?: string;
  text: string;
  /** Its photo among the draft's uploads. */
  imageKey?: string;
}

const blank = (): DraftOption => ({ key: crypto.randomUUID(), text: "" });
const draftOf = (poll?: Poll): DraftOption[] =>
  poll ? poll.options.map((o) => ({ key: o.id, id: o.id, text: o.text, imageKey: o.image?.id })) : [blank(), blank()];

/** The composer's poll: its options and their photo uploads. */
export function usePollDraft(initial?: Poll) {
  const images = useAttachments(initial?.options.flatMap((o) => (o.image ? [o.image] : [])) ?? []);
  const [open, setOpen] = useState(!!initial);
  const [multiple, setMultiple] = useState(initial?.multiple ?? false);
  const [options, setOptions] = useState<DraftOption[]>(() => draftOf(initial));

  const patch = (key: string, p: Partial<DraftOption>) => setOptions((os) => os.map((o) => (o.key === key ? { ...o, ...p } : o)));
  const imageOf = (o: DraftOption): Attachment | undefined => (o.imageKey ? images.items.find((x) => x.key === o.imageKey) : undefined);
  const dropImage = (key: string) => {
    const imageKey = options.find((o) => o.key === key)?.imageKey;
    if (imageKey) images.remove(imageKey);
  };
  const reset = () => (setOptions([blank(), blank()]), setMultiple(false), setOpen(false));

  const filled = options.filter((o) => o.text.trim() !== "" || imageOf(o)?.status === "ready");
  const photos = options.flatMap((o) => imageOf(o) ?? []);
  const uploading = photos.some((x) => x.status === "uploading");
  const failed = photos.some((x) => x.status === "error");

  return {
    open,
    multiple,
    options,
    imageOf,
    start: () => setOpen(true),
    setMultiple,
    setText: (key: string, text: string) => patch(key, { text }),
    setImage: (key: string, file: File) => {
      dropImage(key);
      patch(key, { imageKey: images.add([file])[0] });
    },
    removeImage: (key: string) => (dropImage(key), patch(key, { imageKey: undefined })),
    addOption: () => setOptions((os) => (os.length < MAX_OPTIONS ? [...os, blank()] : os)),
    removeOption: (key: string) => (dropImage(key), setOptions((os) => os.filter((o) => o.key !== key))),
    /** Removes the poll from the draft. */
    close: () => {
      for (const o of options) if (o.imageKey) images.remove(o.imageKey);
      reset();
    },
    /** Call after the post was saved: the backend now owns the photos. */
    committed: () => (images.committed(), reset()),
    /** Why it can't be saved yet, if it can't. */
    problem: uploading ? "Wait for the poll photos" : failed ? "Remove the poll photos that failed" : filled.length < 2 ? "Add two poll options" : null,
    input: (): PollInput => ({
      multiple,
      options: filled.map((o) => ({ id: o.id, text: o.text, imageId: imageOf(o)?.media?.id ?? null })),
    }),
  };
}

export type PollDraft = ReturnType<typeof usePollDraft>;

/** Composer: edit the options, each with an optional photo. */
export function PollEditor({ draft }: { draft: PollDraft }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <ListChecksIcon size={18} /> Poll
        </span>
        <button type="button" onClick={draft.close} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Remove poll">
          <XIcon size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {draft.options.map((o, i) => (
          <div key={o.key} className="flex items-center gap-2">
            <OptionPhoto image={draft.imageOf(o)} onPick={(file) => draft.setImage(o.key, file)} onRemove={() => draft.removeImage(o.key)} />
            <input
              value={o.text}
              onChange={(e) => draft.setText(o.key, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={200}
              className={inputClass}
            />
            {draft.options.length > 2 && (
              <button type="button" onClick={() => draft.removeOption(o.key)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove option ${i + 1}`}>
                <XIcon size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {draft.options.length < MAX_OPTIONS ? (
          <button type="button" onClick={draft.addOption} className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <PlusIcon /> Add option
          </button>
        ) : (
          <span />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={draft.multiple} onChange={(e) => draft.setMultiple(e.target.checked)} />
          Allow multiple answers
        </label>
      </div>
    </div>
  );
}

/** An option's photo: pick one, see it upload, or remove it. */
function OptionPhoto({ image, onPick, onRemove }: { image?: Attachment; onPick: (file: File) => void; onRemove: () => void }) {
  if (!image) {
    return (
      <label title="Add a photo" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-brand-500 hover:text-brand-500">
        <ImageIcon size={18} />
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            e.target.value = "";
          }}
        />
      </label>
    );
  }
  return (
    <div className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-slate-100" title={image.error ?? image.name}>
      {image.media && <MediaPreview media={image.media} />}
      {image.status === "uploading" && (
        <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-slate-500">
          <CircleNotchIcon size={16} className="animate-spin" />
        </span>
      )}
      {image.status === "error" && (
        <span className="absolute inset-0 flex items-center justify-center bg-rose-50 text-rose-600">
          <WarningIcon size={16} />
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove photo"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}

/** Under a post's text: the options with their results; click one to vote. */
export function PollCard({ post, poll }: { post: Post; poll: Poll }) {
  const { owner, profiles, refresh } = useJournal();
  const [voterId, setVoterId] = useState(owner.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voter = profiles.get(voterId) ?? owner;
  const votes = poll.votes ?? [];
  const mine = votes.filter((v) => v.profileId === voter.id).map((v) => v.optionId);
  const people = new Set(votes.map((v) => v.profileId)).size;
  const pictures = poll.options.some((o) => o.image);

  const choose = async (optionId: string) => {
    if (busy) return;
    const next = mine.includes(optionId) ? mine.filter((id) => id !== optionId) : poll.multiple ? [...mine, optionId] : [optionId];
    setBusy(true);
    setError(null);
    try {
      await api.votePoll(post.id, voter.id, next);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const result = (o: PollOption) => {
    const voters = votes.filter((v) => v.optionId === o.id).map((v) => v.profileId);
    return { voters, percent: people ? Math.round((voters.length / people) * 100) : 0, chosen: mine.includes(o.id) };
  };

  return (
    <div className="mt-3">
      <div className={pictures ? "grid grid-cols-2 gap-2" : "space-y-2"}>
        {poll.options.map((o) =>
          pictures ? (
            <PictureOption key={o.id} option={o} {...result(o)} multiple={poll.multiple} onClick={() => void choose(o.id)} />
          ) : (
            <TextOption key={o.id} option={o} {...result(o)} multiple={poll.multiple} onClick={() => void choose(o.id)} />
          ),
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[13px] text-slate-500">
        <ActAsPicker value={voter} onChange={setVoterId} label="Vote as" />
        <span>
          {voter.id === owner.id ? "Voting as you" : `Voting as ${voter.name}`} · {people === 0 ? "No votes yet" : `${people} ${people === 1 ? "person" : "people"} voted`}
          {poll.multiple && " · Multiple answers allowed"}
        </span>
      </div>
      {error && <p className="pt-1 text-[13px] text-rose-600">{error}</p>}
    </div>
  );
}

interface OptionProps {
  option: PollOption;
  voters: string[];
  percent: number;
  chosen: boolean;
  multiple: boolean;
  onClick: () => void;
}

function Marker({ chosen, multiple }: { chosen: boolean; multiple: boolean }) {
  const Icon = multiple ? (chosen ? CheckSquareIcon : SquareIcon) : chosen ? RadioButtonIcon : CircleIcon;
  return <Icon size={20} weight={chosen ? "fill" : "regular"} className={chosen ? "text-brand-600" : "text-slate-400"} />;
}

function TextOption({ option, voters, percent, chosen, multiple, onClick }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors hover:bg-slate-50 ${chosen ? "border-brand-500" : "border-slate-300"}`}
    >
      <span className="absolute inset-y-0 left-0 bg-brand-50 transition-[width] duration-300" style={{ width: `${percent}%` }} />
      <span className="relative">
        <Marker chosen={chosen} multiple={multiple} />
      </span>
      <span className="relative min-w-0 flex-1 text-[15px] font-medium text-slate-800">{option.text}</span>
      <span className="relative flex items-center gap-2">
        <Voters ids={voters} />
        <span className="w-9 text-right text-[13px] font-semibold text-slate-600">{percent}%</span>
      </span>
    </button>
  );
}

function PictureOption({ option, voters, percent, chosen, multiple, onClick }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`overflow-hidden rounded-lg border text-left transition-colors hover:bg-slate-50 ${chosen ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-300"}`}
    >
      <div className="aspect-square bg-slate-100">
        {option.image ? (
          <MediaPreview media={option.image} />
        ) : (
          <span className="flex h-full items-center justify-center text-slate-300">
            <ImageIcon size={32} />
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="flex items-center gap-2">
          <Marker chosen={chosen} multiple={multiple} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-800">{option.text}</span>
          <span className="text-[13px] font-semibold text-slate-600">{percent}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        {voters.length > 0 && (
          <div className="mt-1.5">
            <Voters ids={voters} />
          </div>
        )}
      </div>
    </button>
  );
}

/** Up to three voters' faces, then "+N"; every name on hover. */
function Voters({ ids }: { ids: string[] }) {
  const { profiles, owner } = useJournal();
  if (ids.length === 0) return null;
  const names = ids.map((id) => (id === owner.id ? "You" : (profiles.get(id)?.name ?? "Someone")));
  return (
    <span className="flex items-center" title={names.join("\n")}>
      <span className="flex -space-x-1.5 [&>*]:ring-2 [&>*]:ring-white">
        {ids.slice(0, 3).map((id) => (
          <Avatar key={id} profile={profiles.get(id)} size="xs" />
        ))}
      </span>
      {ids.length > 3 && <span className="ml-1 text-[12px] text-slate-500">+{ids.length - 3}</span>}
    </span>
  );
}
