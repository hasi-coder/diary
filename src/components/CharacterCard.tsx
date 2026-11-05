// A person's character for the Places world (About tab): body, hair and outfit,
// a turning preview, and the four face views their head shows.
import { useMemo, useState } from "react";
import { CircleNotchIcon, SparkleIcon } from "@phosphor-icons/react";
import { api, errorMessage, mediaUrl, type PhotoSlot, type Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import {
  AGES,
  BUILDS,
  characterOf,
  FACE_DEFS,
  FACE_SLOTS,
  FACE_VIEWS,
  FIGURES,
  HAIR_COLORS,
  HAIR_STYLES,
  MONK_SKIN_TONES,
  type BodySliders,
  type Character,
  type FaceView,
} from "../lib/places/character";
import { ClothingEditor } from "./ClothingEditor";
import { PhotoDialog } from "./ProfileExtras";
import { presetSliders } from "./world/body";
import { CharacterPreview } from "./world/CharacterPreview";
import { drawnHead } from "./world/faces";
import { Button, ErrorText } from "./ui";

const SLIDERS: { key: keyof BodySliders; label: string; ends: [string, string]; min: number }[] = [
  { key: "shape", label: "Body", ends: ["Feminine", "Masculine"], min: 0 },
  { key: "weight", label: "Weight", ends: ["Thin", "Heavy"], min: -1 },
  { key: "muscle", label: "Muscle", ends: ["Soft", "Muscular"], min: -1 },
  { key: "height", label: "Height", ends: ["Shorter", "Taller"], min: -1 },
  { key: "bust", label: "Bust", ends: ["Smaller", "Larger"], min: -1 },
];


export function CharacterCard({ profile }: { profile: Profile }) {
  const { refresh } = useJournal();
  const saved = useMemo(() => characterOf(profile), [profile]);
  const [look, setLook] = useState<Character>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<PhotoSlot | null>(null);
  const dirty = JSON.stringify(look) !== JSON.stringify(saved);
  const set = (patch: Partial<Character>) => setLook((l) => ({ ...l, ...patch }));
  const sliders = { ...presetSliders(look), ...look.body };

  const save = async (character: Character | null) => {
    setBusy(true);
    setError(null);
    try {
      await api.setProfileCharacter(profile.id, character);
      await refresh();
      if (!character) setLook(characterOf({ ...profile, character: null }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xl font-bold text-slate-800">Character</h2>
        <span className="text-sm text-slate-500">How {profile.name} looks in Places</span>
      </div>
      <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
        <CharacterPreview profile={profile} look={look} className="h-64 rounded-xl bg-gradient-to-b from-slate-100 to-slate-200" />
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice label="Age" options={Object.fromEntries(Object.entries(AGES).map(([k, v]) => [k, v.label]))} value={look.age} onChange={(age) => set({ age: age as Character["age"] })} />
            <Choice label="Body shape" options={FIGURES} value={look.figure} onChange={(figure) => set({ figure: figure as Character["figure"], body: undefined })} />
            <Choice label="Build" options={BUILDS} value={look.build} onChange={(build) => set({ build: build as Character["build"], body: undefined })} />
            <Choice label="Hair" options={HAIR_STYLES} value={look.hair.style} onChange={(style) => set({ hair: { ...look.hair, style: style as Character["hair"]["style"] } })} />
          </div>
          <details className="rounded-lg bg-slate-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">Fine-tune the body</summary>
            <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {(look.age === "adult" || look.age === "elder") && <Choice label="Anatomy" options={{ auto: "Follow figure", none: "None", vulva: "Vulva", penis: "Penis" }} value={look.anatomy ?? "auto"} onChange={(anatomy) => set({ anatomy: anatomy as Character["anatomy"] })} />}
              {SLIDERS.map((s) => (
                <label key={s.key} className="text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="font-semibold">{s.label}</span>
                    <span>
                      {s.ends[0]} · {s.ends[1]}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="w-full accent-brand-600"
                    min={s.min}
                    max={1}
                    step={0.05}
                    value={sliders[s.key]}
                    onChange={(e) => set({ body: { ...look.body, [s.key]: Number(e.target.value) } })}
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <Swatches label="Skin" colors={MONK_SKIN_TONES} value={look.skin} onChange={(skin) => set({ skin })} />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <input type="color" value={look.skin} onChange={(e) => set({ skin: e.target.value })} className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0" /> Any colour
              </label>
            </div>
            <Swatches label="Hair colour" colors={HAIR_COLORS} value={look.hair.color} onChange={(color) => set({ hair: { ...look.hair, color } })} />
          </div>
          <ClothingEditor profile={profile} look={look} onChange={set} />
          <div className="flex flex-wrap gap-4 text-sm text-slate-700">
            {(["glasses", "beard"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!look[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {k === "glasses" ? "Glasses" : "Beard"}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={!dirty || busy} onClick={() => void save(look)}>
              Save character
            </Button>
            {profile.character && (
              <Button variant="ghost" disabled={busy} onClick={() => void save(null)}>
                Reset
              </Button>
            )}
            {busy && <CircleNotchIcon className="animate-spin text-brand-500" />}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </div>

      <h3 className="mb-2 mt-6 font-semibold text-slate-800">Face views</h3>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {FACE_VIEWS.map((view) => (
          <FaceSlot key={view} profile={profile} look={look} view={view} onEdit={() => setSlot(FACE_SLOTS[view])} />
        ))}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
        <SparkleIcon className="mt-0.5 shrink-0" />
        Make them from one photo with the generate-face-views skill (Codex): the first four are needed, the 45° and lying-down views are optional and fall back to the nearest one. It uploads them here over Agent access. Without photos, a drawn face is used.
      </p>
      {slot && <PhotoDialog profile={profile} slot={slot} onClose={() => setSlot(null)} />}
    </section>
  );
}

function FaceSlot({ profile, look, view, onEdit }: { profile: Profile; look: Character; view: FaceView; onEdit: () => void }) {
  const photo = profile.faces?.[view];
  const drawn = useMemo(() => (photo ? null : drawnHead(look, view, 160).toDataURL()), [photo, look, view]);
  return (
    <button onClick={onEdit} className="rounded-xl border border-dashed border-slate-300 p-2 text-center hover:border-brand-500">
      <img src={photo ? mediaUrl(photo.id) : drawn!} alt="" className="mx-auto aspect-square w-full rounded-lg bg-slate-50 object-cover" />
      <div className="mt-1 text-xs font-semibold text-slate-700">{FACE_DEFS[view].label}</div>
      <div className="text-xs text-brand-600">{photo ? "Replace" : "Add photo"}</div>
    </button>
  );
}

function Choice({ label, options, value, onChange }: { label: string; options: Record<string, string>; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(options).map(([k, text]) => (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${value === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onChange }: { label?: string; colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div>
      {label && <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>}
      <div className="flex gap-1">
        {colors.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-full border-2 border-white ${value === c ? "ring-2 ring-brand-500" : "ring-1 ring-slate-300"}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
