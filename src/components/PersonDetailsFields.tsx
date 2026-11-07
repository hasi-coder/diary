import { useState } from "react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import type { Education, ProfileInput } from "../lib/api";
import { Button, Field, inputClass } from "./ui";

export function PersonDetailsFields({ form, set }: {
  form: ProfileInput;
  set: <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => void;
}) {
  const [languages, setLanguages] = useState(form.languages.join(", "));
  const changeEducation = (index: number, key: keyof Education, value: string) =>
    set("education", form.education.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  return (
    <details className="rounded-xl border border-slate-200 p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Work, education and contact</summary>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name"><input className={inputClass} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
          <Field label="Hometown"><input className={inputClass} value={form.hometown} onChange={(e) => set("hometown", e.target.value)} /></Field>
          <Field label="Occupation"><input className={inputClass} value={form.occupation} onChange={(e) => set("occupation", e.target.value)} /></Field>
          <Field label="Employer"><input className={inputClass} value={form.employer} onChange={(e) => set("employer", e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Education</span>
            <Button type="button" variant="ghost" disabled={form.education.length >= 50} onClick={() => set("education", [...form.education, { type: "college", name: "", program: "", years: "" }])}><PlusIcon /> Add school</Button>
          </div>
          <div className="space-y-3">
            {form.education.map((entry, i) => (
              <div key={i} className="space-y-3 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <select aria-label="Education type" className={inputClass} value={entry.type} onChange={(e) => changeEducation(i, "type", e.target.value)}>
                    <option value="college">College / university</option><option value="high_school">School</option><option value="other">Other</option>
                    {entry.type && !["college", "high_school", "other"].includes(entry.type) && <option value={entry.type}>{entry.type}</option>}
                  </select>
                  <Button type="button" variant="ghost" aria-label="Remove school" onClick={() => set("education", form.education.filter((_, index) => index !== i))}><TrashIcon /></Button>
                </div>
                <Field label="School or college"><input className={inputClass} value={entry.name} onChange={(e) => changeEducation(i, "name", e.target.value)} required /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Program / subject"><input className={inputClass} value={entry.program} onChange={(e) => changeEducation(i, "program", e.target.value)} /></Field>
                  <Field label="Years"><input className={inputClass} value={entry.years} onChange={(e) => changeEducation(i, "years", e.target.value)} placeholder="1972–1979 or Class of 1982" /></Field>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website"><input type="url" className={inputClass} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://…" /></Field>
          <Field label="Facebook profile"><input type="url" className={inputClass} value={form.facebookUrl} onChange={(e) => set("facebookUrl", e.target.value)} placeholder="https://www.facebook.com/…" /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><input type="tel" className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </div>
        <Field label="Languages" hint="Separate languages with commas."><input className={inputClass} value={languages} onChange={(e) => { setLanguages(e.target.value); set("languages", e.target.value.split(",").map((s) => s.trim()).filter(Boolean)); }} /></Field>
        <Field label="Notes"><textarea className={`${inputClass} min-h-20`} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isPlaceholder} onChange={(e) => set("isPlaceholder", e.target.checked)} /> More details to add</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active profile</label>
        </div>
        <Field label="Import key" hint="A stable name from imported family references. Keep it when changing the person's name."><input className={inputClass} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="e.g. sachini-saumya-hewaarachchi" /></Field>
      </div>
    </details>
  );
}
