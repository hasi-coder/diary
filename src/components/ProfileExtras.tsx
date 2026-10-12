// Profile page extras: changing the profile/cover photo, relationships, and life events.
import { useMemo, useRef, useState } from "react";
import { CircleNotchIcon, FlagBannerIcon, PencilSimpleIcon, PlusIcon, TrashIcon, UploadSimpleIcon, UsersIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Profile, type Relation } from "../lib/api";
import { useJournal, usePosts } from "../lib/journal";
import { KINDS } from "../lib/format";
import { RELATION_GROUPS, RELATION_KINDS, relationLabel, relationsOf } from "../lib/catalog";
import { categoryOf } from "../lib/lifeEvents";
import { lifeEventsIn, storyOf } from "../lib/story";
import { MediaPreview } from "./Media";
import { PasteButton } from "./PasteButton";
import { prepareImage, usePasteImages } from "../lib/uploads";
import { Avatar, Button, ErrorText, Field, inputClass, Modal } from "./ui";

// ---- Profile and cover photos ----

/** Upload a photo, pick one already in the journal, or remove the current one. */
export function PhotoDialog({ profile, slot, onClose }: { profile: Profile; slot: "avatar" | "cover"; onClose: () => void }) {
  const { refresh } = useJournal();
  const { posts } = usePosts({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const current = slot === "avatar" ? profile.avatar : profile.cover;
  const noun = slot === "avatar" ? "profile picture" : "cover photo";

  const photos = useMemo(() => {
    const seen = new Set<string>();
    return (posts ?? []).flatMap((p) => p.media).filter((m) => m.kind === "image" && !seen.has(m.id) && seen.add(m.id));
  }, [posts]);

  const apply = async (stage: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      await api.setProfilePhoto(profile.id, slot, await stage());
      await refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  // Converted like any upload (Settings › Photo uploads); a pasted image works too.
  const upload = (f: File | undefined) => f && !busy && void apply(async () => (await api.stageMedia(await prepareImage(f))).id);
  usePasteImages((files) => upload(files.find((x) => x.type.startsWith("image/"))));

  return (
    <Modal title={`Update ${noun}`} onClose={busy ? () => {} : onClose} wide>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => file.current?.click()} disabled={busy}>
          <UploadSimpleIcon /> Upload photo
        </Button>
        {current && (
          <Button variant="outline" disabled={busy} onClick={() => apply(async () => null)} className="text-rose-600">
            <TrashIcon /> Remove
          </Button>
        )}
        {busy && <CircleNotchIcon className="animate-spin self-center text-brand-500" size={20} />}
        <PasteButton onFiles={(files) => upload(files[0])} label="Paste" />
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">Or choose from your photos</h3>
      {photos.length === 0 ? (
        <p className="text-sm text-slate-400">No photos in the journal yet.</p>
      ) : (
        <div className="grid max-h-80 grid-cols-4 gap-1.5 overflow-y-auto">
          {photos.map((m) => (
            <button
              key={m.id}
              disabled={busy}
              onClick={() => apply(async () => (await api.stageMediaCopy(m.id)).id)}
              className="aspect-square overflow-hidden rounded-lg ring-brand-500 hover:ring-2 disabled:opacity-50"
            >
              <MediaPreview media={m} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---- Relationships ----


/** Intro-card lines such as "Works at The Rusty Bean". */
export function RelationIntro({ profile }: { profile: Profile }) {
  const { snapshot, navigate } = useJournal();
  const lines = relationsOf(profile.id, snapshot.profiles).filter((v) => v.intro);
  if (lines.length === 0) return null;
  return (
    <ul className="space-y-2 text-sm text-slate-600">
      {lines.map((v) => (
        <li key={`${v.relation.id}-${v.other.id}`} className="flex items-center gap-2">
          <Avatar profile={v.other} size="sm" />
          <span>
            {v.intro}{" "}
            <button onClick={() => navigate({ view: "profile", id: v.other.id })} className="font-semibold text-slate-800 hover:underline">
              {v.other.name}
            </button>
            {v.relation.since && <span className="text-slate-400"> · since {v.relation.since}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RelationshipsSection({ profile }: { profile: Profile }) {
  const { snapshot, navigate, refresh } = useJournal();
  const [editing, setEditing] = useState<Relation | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const views = relationsOf(profile.id, snapshot.profiles);
  const groupOf = (kind: string) => RELATION_KINDS.find((k) => k.kind === kind)?.group ?? "Other";

  return (
    <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <UsersIcon className="text-brand-500" /> {profile.kind === "person" || profile.kind === "me" ? "Family and relationships" : "Connections"}
        </h2>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <PlusIcon /> Add
        </Button>
      </div>
      {views.length === 0 && <p className="text-sm text-slate-400">No relationships yet.</p>}
      {RELATION_GROUPS.map((group) => {
        const rows = views.filter((v) => groupOf(v.relation.kind) === group);
        if (rows.length === 0) return null;
        return (
          <div key={group} className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{group}</h3>
            <ul className="divide-y divide-slate-100">
              {rows.map((v) => (
                <li key={`${v.relation.id}-${v.other.id}`} className="flex items-center gap-3 py-2">
                  <button onClick={() => navigate({ view: "profile", id: v.other.id })}>
                    <Avatar profile={v.other} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => navigate({ view: "profile", id: v.other.id })} className="block truncate text-sm font-semibold text-slate-800 hover:underline">
                      {v.other.name}
                    </button>
                    <div className="text-xs text-slate-500">
                      {v.label}
                      {v.relation.since && ` · since ${v.relation.since}`}
                    </div>
                  </div>
                  {v.declarerId === profile.id && (
                    <button onClick={() => setEditing(v.relation)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Edit">
                      <PencilSimpleIcon />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      setError(null);
                      try {
                        await api.deleteRelation(v.declarerId, v.relation.id);
                        await refresh();
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                    aria-label="Remove"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {error && <ErrorText>{error}</ErrorText>}
      {editing && <RelationDialog profile={profile} relation={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function RelationDialog({ profile, relation, onClose }: { profile: Profile; relation?: Relation; onClose: () => void }) {
  const { snapshot, profiles, refresh } = useJournal();
  const [toId, setToId] = useState(relation?.toId ?? "");
  const [kind, setKind] = useState(relation?.kind ?? "friend");
  const [label, setLabel] = useState(relation?.label ?? "");
  const [inverseLabel, setInverseLabel] = useState(relation?.inverseLabel ?? "");
  const [since, setSince] = useState(relation?.since ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const other = profiles.get(toId);
  const info = RELATION_KINDS.find((k) => k.kind === kind);
  const forward = kind === "custom" ? label || "…" : relationLabel(kind, other);
  const backward = kind === "custom" ? inverseLabel || label || "…" : relationLabel(info?.inverse ?? kind, profile);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.saveRelation(profile.id, { id: relation?.id, toId, kind, label, inverseLabel, since });
      await refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={relation ? "Edit relationship" : "Add relationship"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Who">
          <select className={inputClass} value={toId} onChange={(e) => setToId(e.target.value)} required>
            <option value="">Choose a profile…</option>
            {(["me", "person", "page", "shop", "place"] as const).map((k) => {
              const group = snapshot.profiles.filter((p) => p.kind === k && p.id !== profile.id);
              return group.length === 0 ? null : (
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
        </Field>
        <Field label={`${other?.name ?? "They"} is ${profile.name}'s…`}>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {RELATION_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {RELATION_KINDS.filter((k) => k.group === g).map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {relationLabel(k.kind, other)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {kind === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${other?.name ?? "They"} is…`}>
              <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mentor" required />
            </Field>
            <Field label={`${profile.name} is…`}>
              <input className={inputClass} value={inverseLabel} onChange={(e) => setInverseLabel(e.target.value)} placeholder="e.g. Mentee" />
            </Field>
          </div>
        )}
        <Field label="Since (optional)">
          <input className={inputClass} value={since} onChange={(e) => setSince(e.target.value)} placeholder="e.g. 2019" />
        </Field>
        {other && (
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            On {profile.name}'s profile: <b className="text-slate-700">{other.name}</b> · {forward}
            <br />
            On {other.name}'s profile: <b className="text-slate-700">{profile.name}</b> · {backward}
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !toId}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Life events ----

/** "Life events" card for a profile's Posts tab: life events in posts it wrote or is tagged in. */
export function LifeEventsCard({ profile }: { profile: Profile }) {
  const { navigate } = useJournal();
  const { posts } = usePosts({ profileId: profile.id });
  const rows = (posts ?? []).flatMap((p) => lifeEventsIn(storyOf(p)).map((e, i) => ({ post: p, ...e, key: `${p.id}-${i}` })));
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800">
        <FlagBannerIcon className="text-brand-500" /> Life events
      </h2>
      <ol className="relative space-y-3 border-l-2 border-slate-100 pl-4">
        {rows.map(({ post, clause, template, key }) => (
          <li key={key}>
            <span className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm ring-2 ring-slate-100">{clause.emoji}</span>
            <button onClick={() => navigate({ view: "post", id: post.id })} className="text-left">
              <span className="block text-sm font-medium text-slate-800 first-letter:uppercase hover:underline">{clause.object}</span>
              <span className="block text-xs text-slate-400">
                {new Date(post.occurredAt).getFullYear()}
                {template && ` · ${categoryOf(template.category).label}`}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
