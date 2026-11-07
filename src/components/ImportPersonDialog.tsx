import { useMemo, useRef, useState } from "react";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { api, errorMessage, type PersonImport } from "../lib/api";
import { useJournal } from "../lib/journal";
import { Button, ErrorText, Field, inputClass, Modal } from "./ui";

export function ImportPersonDialog({ onClose }: { onClose: () => void }) {
  const { snapshot, refresh, navigate } = useJournal();
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState("");
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PersonImport | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const people = snapshot.profiles.filter((p) => p.kind === "person" || p.kind === "me");
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const data: unknown = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Use one person's JSON object.");
      const record = data as Record<string, unknown>;
      if (typeof record.name !== "string" || !record.name.trim()) throw new Error("The profile needs a name.");
      if (record.relationships != null && (!Array.isArray(record.relationships) || record.relationships.some((r) => !r || typeof r !== "object" || Array.isArray(r)))) throw new Error("Relationships must be a list of people and their relationship types.");
      if (Array.isArray(record.relationships) && record.relationships.some((r) => r.otherParents != null && (!Array.isArray(r.otherParents) || r.otherParents.some((p: unknown) => !p || typeof p !== "object" || Array.isArray(p))))) throw new Error("A child's otherParents must be a list of people.");
      return { data: record, error: null };
    } catch (e) { return { data: null, error: errorMessage(e) }; }
  }, [text]);
  const references = (parsed?.data?.relationships ?? []) as Record<string, unknown>[];
  const updateText = (value: string) => { setText(value); setMatches({}); setTargetId(""); setError(null); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed?.data) return;
    setBusy(true); setError(null);
    try {
      const input = { ...parsed.data, ...(targetId ? { id: targetId } : {}), relationships: references.map((r, i) => ({
        ...r, ...(matches[i] ? { id: matches[i] } : {}),
        ...(Array.isArray(r.otherParents) ? { otherParents: r.otherParents.map((p, j) => matches[`${i}:parent:${j}`] ? { ...p, id: matches[`${i}:parent:${j}`] } : p) } : {}),
      })) };
      const imported = await api.importPerson(input);
      setResult(imported);
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Import a family profile" onClose={busy ? () => {} : onClose} wide>
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">{result.created ? "Added" : "Updated"} <b>{result.profile.name}</b>.</p>
          {result.relatedPeople.length > 0 && <ul className="space-y-2 text-sm text-slate-600">{result.relatedPeople.map((p) => <li key={p.id}>{p.name} · {p.created ? "added, ready for more details" : "linked to existing profile"}</li>)}</ul>}
          {error && <ErrorText>{error}</ErrorText>}
          <Button onClick={() => { onClose(); navigate({ view: "profile", id: result.profile.id }); }}>Open profile</Button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-slate-500">Import their details and family links. Relatives who are missing get a profile you can fill in later. Add photos separately.</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => file.current?.click()}><UploadSimpleIcon /> Choose JSON file</Button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const chosen = e.target.files?.[0]; e.target.value = "";
            if (chosen) { try { updateText(await chosen.text()); } catch (err) { setError(errorMessage(err)); } }
          }} />
          <Field label="Profile JSON"><textarea className={`${inputClass} min-h-48 font-mono text-xs`} value={text} onChange={(e) => updateText(e.target.value)} disabled={busy} placeholder={'{"name": "…", "education": [], "relationships": []}'} /></Field>
          {parsed?.error && <ErrorText>{parsed.error}</ErrorText>}
          {parsed?.data && <>
            <Field label="Profile to update" hint="Choose an existing person if their name differs from the JSON.">
              <select className={inputClass} value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy}>
                <option value="">Match automatically, or create a profile</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isPlaceholder ? " · more details to add" : ""}</option>)}
              </select>
            </Field>
            {references.length > 0 && <div className="space-y-3 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Family references</p>
              <p className="text-xs text-slate-500">Match an existing profile when the names differ. Automatic matching uses the exact name or import key.</p>
              {references.map((r, i) => <div key={i} className="space-y-2"><Field label={`${String(r.name ?? r.slug ?? "Unnamed person")} · ${String(r.type ?? r.kind ?? "relationship")}`}>
                <select className={inputClass} value={matches[i] ?? ""} disabled={busy} onChange={(e) => setMatches((old) => ({ ...old, [i]: e.target.value }))}>
                  <option value="">Match automatically, or add missing person</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
                {Array.isArray(r.otherParents) && r.otherParents.map((parent, j) => <Field key={j} label={`Other parent: ${String(parent.name ?? parent.slug ?? "Unnamed person")}`}>
                  <select className={inputClass} value={matches[`${i}:parent:${j}`] ?? ""} disabled={busy} onChange={(e) => setMatches((old) => ({ ...old, [`${i}:parent:${j}`]: e.target.value }))}>
                    <option value="">Match automatically, or add missing parent</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>)}
              </div>)}
            </div>}
          </>}
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !parsed?.data}>{busy ? "Importing…" : "Import profile"}</Button></div>
        </form>
      )}
    </Modal>
  );
}
