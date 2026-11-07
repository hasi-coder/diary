import { useState } from "react";
import { api, errorMessage, type Profile } from "../lib/api";
import { RELATION_KINDS, relationLabel } from "../lib/catalog";
import { useJournal } from "../lib/journal";
import { Button, ErrorText, Field, inputClass, Modal } from "./ui";

type PersonChoice = { id: string; name: string };
const NEW = "new-person";
function PersonPicker({ label, people, choice, onChange, optional = false }: {
  label: string; people: Profile[]; choice: PersonChoice; onChange: (choice: PersonChoice) => void; optional?: boolean;
}) {
  return <div className="space-y-2">
    <Field label={label}>
      <select className={inputClass} value={choice.id} onChange={(e) => onChange({ ...choice, id: e.target.value })} required={!optional}>
        <option value="">{optional ? "Not recorded" : "Choose a person…"}</option>
        <option value={NEW}>Add a missing person…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isPlaceholder ? " · more details to add" : ""}</option>)}
      </select>
    </Field>
    {choice.id === NEW && <Field label="Name" hint="We'll create a linked profile for them."><input className={inputClass} value={choice.name} onChange={(e) => onChange({ ...choice, name: e.target.value })} required /></Field>}
  </div>;
}

export function FamilyMemberDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { snapshot, refresh } = useJournal();
  const [mode, setMode] = useState<"child" | "parent" | "partner">("child");
  const [kind, setKind] = useState("child");
  const [person, setPerson] = useState<PersonChoice>({ id: "", name: "" });
  const [otherParent, setOtherParent] = useState<PersonChoice>({ id: "", name: "" });
  const [parentKind, setParentKind] = useState("parent");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = snapshot.profiles.filter((p) => (p.kind === "person" || p.kind === "me") && p.id !== profile.id);
  const target = people.find((p) => p.id === person.id);
  const otherParentProfile = people.find((p) => p.id === otherParent.id);
  const valid = (p: PersonChoice) => !!p.id && (p.id !== NEW || !!p.name.trim());
  const identity = (p: PersonChoice) => p.id === NEW ? { name: p.name.trim() } : { id: p.id };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await api.importPerson({
        id: profile.id, isPlaceholder: profile.isPlaceholder,
        relationships: [{ ...identity(person), type: kind, notes,
          ...(mode === "child" && otherParent.id ? { otherParents: [{ ...identity(otherParent), type: parentKind }] } : {}),
        }],
      });
      await refresh(); onClose();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };
  const aliases = mode === "partner" ? [["husband", "Husband"], ["wife", "Wife"]] : mode === "child" ? [["son", "Son"], ["daughter", "Daughter"]] : [["father", "Father"], ["mother", "Mother"]];
  return <Modal title={`Add to ${profile.displayName || profile.name}'s family`} onClose={busy ? () => {} : onClose}>
    <form onSubmit={save} className="space-y-4">
      <Field label="Add a">
        <select className={inputClass} value={mode} onChange={(e) => { const next = e.target.value as typeof mode; setMode(next); setKind(next === "partner" ? "spouse" : next); }}>
          <option value="child">Child</option><option value="partner">Partner / former partner</option><option value="parent">Parent / caregiver</option>
        </select>
      </Field>
      <PersonPicker label={mode === "child" ? "Child" : mode === "parent" ? "Parent or caregiver" : "Partner"} people={people} choice={person} onChange={setPerson} />
      <Field label={`Their relationship to ${profile.displayName || profile.name}`}>
        <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {RELATION_KINDS.filter((k) => k.familyTree === mode).map((k) => <option key={k.kind} value={k.kind}>{relationLabel(k.kind, target)}</option>)}
          {aliases.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      {mode === "child" && <div className="space-y-3 rounded-xl bg-slate-50 p-4">
        <PersonPicker label="Child's other parent (optional)" people={people.filter((p) => p.id !== person.id)} choice={otherParent} onChange={setOtherParent} optional />
        {otherParent.id && <Field label="Other parent's role"><select className={inputClass} value={parentKind} onChange={(e) => setParentKind(e.target.value)}>
          {RELATION_KINDS.filter((k) => k.familyTree === "parent").map((k) => <option key={k.kind} value={k.kind}>{relationLabel(k.kind, otherParentProfile)}</option>)}
          <option value="mother">Mother</option><option value="father">Father</option>
        </select></Field>}
        <p className="text-xs text-slate-500">Choose the child's parent even if they are a former partner. Leaving this blank keeps the other parent unrecorded. Current partners are never assigned automatically.</p>
      </div>}
      <Field label="Notes (optional)"><textarea className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !valid(person) || (mode === "child" && !!otherParent.id && !valid(otherParent))}>{busy ? "Saving…" : "Add family member"}</Button></div>
    </form>
  </Modal>;
}
