import { useSyncExternalStore } from "react";
import { MusicNotesIcon } from "@phosphor-icons/react";
import { INTERACTIONS, categoriesOf } from "../lib/places/interactions";
import { actionAgeChoices, INTERACTION_SETTINGS, interactionSettingsRevision, setInteractionEnabled, setInteractionMinimumAge, setShowLockedActions, subscribeInteractionSettings } from "../lib/interactionSettings";

export function InteractionSettingsCard() {
  useSyncExternalStore(subscribeInteractionSettings, interactionSettingsRevision, interactionSettingsRevision);
  return (
    <section id="place-actions" className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-800"><MusicNotesIcon className="text-brand-500" /> Places animations &amp; actions</h2>
      <p className="mb-4 text-sm text-slate-500">Choose which actions are available and the age group for each one. These settings apply to every place and are saved on this device.</p>
      <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-lg bg-slate-100 p-3 text-sm font-semibold">
        <input type="checkbox" checked={INTERACTION_SETTINGS.enabled} onChange={(e) => setInteractionEnabled(null, e.target.checked)} className="h-4 w-4 accent-brand-600" />
        Enable Places animations and actions
      </label>
      <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-lg bg-slate-100 p-3 text-sm font-semibold">
        <input type="checkbox" checked={INTERACTION_SETTINGS.showLocked} onChange={(e) => setShowLockedActions(e.target.checked)} className="h-4 w-4 accent-brand-600" />
        Show age-locked actions with a lock instead of hiding them
      </label>
      <p className="mb-3 text-xs text-slate-500">{INTERACTIONS.length} animations in {categoriesOf(INTERACTIONS).length} groups. A new group is just a new <code>category</code> word on an action file.</p>
      {categoriesOf(INTERACTIONS).map((group) => (
        <div key={group.id} className="mb-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800"><span>{group.emoji}</span> {group.label} <span className="text-xs font-normal text-slate-400">{group.defs.length}</span></h3>
          <div className="divide-y divide-slate-100">
            {group.defs.map((def) => (
              <div key={def.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <label className="flex min-w-48 flex-1 cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" aria-label={`Enable ${def.label}`} checked={INTERACTION_SETTINGS.actions[def.id] ?? true} onChange={(e) => setInteractionEnabled(def.id, e.target.checked)} className="h-4 w-4 accent-brand-600" />
                  <span className="text-xl">{def.emoji}</span>
                  <span className="min-w-0"><span className="block font-medium text-slate-700">{def.label}</span><span className="block truncate text-xs text-slate-400">{def.people.min === def.people.max ? def.people.min : `${def.people.min}–${def.people.max}`} {def.people.max === 1 ? "person" : "people"}{def.target ? ` · ${def.target.kinds.join(" / ")}` : ""}</span></span>
                </label>
                <select aria-label={`Age group for ${def.label}`} value={INTERACTION_SETTINGS.minimumAges[def.id] ?? 0} onChange={(e) => setInteractionMinimumAge(def.id, Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700">
                  {actionAgeChoices(def.id).map((age) => <option key={age} value={age}>{age === 0 ? "Any age" : `${age}+`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
