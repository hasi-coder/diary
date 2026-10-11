// Create/edit dialogs for profiles and shop items.
import { useState } from "react";
import { api, errorMessage, type Item, type ItemStatus, type Profile, type ProfileInput, type ProfileKind } from "../lib/api";
import { useJournal } from "../lib/journal";
import { COLORS, KINDS, STATUS } from "../lib/format";
import { GENDER_SUGGESTIONS, PRONOUNS, RELATIONSHIP_STATUSES, TERMS, termsForPronouns } from "../lib/catalog";
import { XIcon } from "@phosphor-icons/react";
import { Button, ErrorText, Field, inputClass, Modal } from "./ui";

const NEW_KINDS: ProfileKind[] = ["person", "page", "shop", "place"];

const DEFAULT_COLOR: Record<ProfileKind, string> = {
  me: "teal",
  person: "pink",
  page: "violet",
  shop: "amber",
  place: "sky",
};

export function ProfileForm(props: { profile?: Profile; initialKind?: ProfileKind; onClose: () => void }) {
  const { refresh, navigate } = useJournal();
  const existing = props.profile;
  const [form, setForm] = useState<ProfileInput>(() =>
    existing
      ? { ...existing }
      : {
          kind: props.initialKind ?? "person",
          name: "",
          tagline: "",
          bio: "",
          relationship: "",
          category: "",
          location: "",
          color: DEFAULT_COLOR[props.initialKind ?? "person"],
          hasShop: false,
          genders: [],
          pronouns: "",
          terms: "neutral",
          relationshipStatus: "",
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveProfile(form);
      await refresh();
      props.onClose();
      if (!existing) navigate({ view: "profile", id: saved.id });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const kind = form.kind;
  return (
    <Modal title={existing ? `Edit ${existing.name}` : "New profile"} onClose={props.onClose} wide>
      <form onSubmit={save} className="space-y-4">
        {!existing && (
          <div className="grid grid-cols-4 gap-2">
            {NEW_KINDS.map((k) => {
              const { icon: Icon, label } = KINDS[k];
              const active = k === kind;
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => setForm((f) => ({ ...f, kind: k, color: DEFAULT_COLOR[k] }))}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
                    active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={22} /> {label}
                </button>
              );
            })}
          </div>
        )}

        <Field label="Name">
          <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus required />
        </Field>

        {kind === "person" && (
          <Field label="Relationship" hint="How they relate to you, e.g. Sister, Colleague, Neighbour.">
            <input className={inputClass} value={form.relationship} onChange={(e) => set("relationship", e.target.value)} />
          </Field>
        )}
        {(kind === "page" || kind === "shop" || kind === "place") && (
          <Field label="Category" hint={kind === "place" ? "e.g. Park, Lake, City" : "e.g. Coffee shop, Book club"}>
            <input className={inputClass} value={form.category} onChange={(e) => set("category", e.target.value)} />
          </Field>
        )}

        {(kind === "person" || kind === "me") && <IdentityFields form={form} set={set} />}

        <Field label="Tagline">
          <input className={inputClass} value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="A one-line intro" />
        </Field>
        <Field label="Bio">
          <textarea className={`${inputClass} min-h-[80px]`} value={form.bio} onChange={(e) => set("bio", e.target.value)} />
        </Field>
        <Field label={kind === "shop" || kind === "place" ? "Address / location" : "Location"}>
          <input className={inputClass} value={form.location} onChange={(e) => set("location", e.target.value)} />
        </Field>

        {kind === "page" && (
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={form.hasShop} onChange={(e) => set("hasShop", e.target.checked)} className="h-4 w-4 accent-brand-600" />
            This page sells items (adds a Shop tab)
          </label>
        )}

        <Field label="Colour">
          <div className="flex flex-wrap gap-2">
            {Object.entries(COLORS).map(([key, c]) => (
              <button
                type="button"
                key={key}
                title={key}
                onClick={() => set("color", key)}
                className={`h-7 w-7 rounded-full ${c.swatch} ${form.color === key ? "ring-2 ring-slate-800 ring-offset-2" : ""}`}
              />
            ))}
          </div>
        </Field>

        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !form.name.trim()}>
            {existing ? "Save" : "Create profile"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ItemForm(props: { shopId: string; item?: Item; onClose: () => void }) {
  const { refresh, snapshot } = useJournal();
  const item = props.item;
  const lastCurrency = snapshot.items.find((i) => i.shopId === props.shopId)?.currency ?? "USD";
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.priceCents != null ? (item.priceCents / 100).toFixed(2) : "");
  const [currency, setCurrency] = useState(item?.currency ?? lastCurrency);
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? "available");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = price.trim() === "" ? null : Number(price);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
      setError("Enter a valid price, or leave it empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveItem({
        id: item?.id,
        shopId: props.shopId,
        name,
        description,
        priceCents: amount === null ? null : Math.round(amount * 100),
        currency,
        status,
      });
      await refresh();
      props.onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? "Edit item" : "List an item"} onClose={props.onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Item name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="Description">
          <textarea className={`${inputClass} min-h-[80px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Price" hint="Leave empty for “price on request”.">
            <input className={inputClass} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Currency">
            <input className={`${inputClass} uppercase`} maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <div className="flex gap-2">
            {(Object.keys(STATUS) as ItemStatus[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setStatus(s)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium ${
                  status === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {STATUS[s].label}
              </button>
            ))}
          </div>
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {item ? "Save" : "List item"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const MAX_GENDERS = 10;

/** Gender (any number of free-form identities), pronouns, relationship words and status. */
function IdentityFields({ form, set }: { form: ProfileInput; set: <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => void }) {
  const [draft, setDraft] = useState("");
  const [termsTouched, setTermsTouched] = useState(form.terms !== "neutral" || !!form.pronouns);
  const addGender = (g: string) => {
    const value = g.trim();
    if (!value || form.genders.length >= MAX_GENDERS || form.genders.some((x) => x.toLowerCase() === value.toLowerCase())) return;
    set("genders", [...form.genders, value]);
    setDraft("");
  };
  const setPronouns = (p: string) => {
    set("pronouns", p);
    if (!termsTouched) set("terms", termsForPronouns(p));
  };
  const quick = ["Woman", "Man", "Non-binary"].filter((g) => !form.genders.includes(g));

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <Field label="Gender" hint={`Optional. Add up to ${MAX_GENDERS} — pick from the list or type your own.`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {form.genders.map((g) => (
            <span key={g} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-sm text-brand-700">
              {g}
              <button type="button" onClick={() => set("genders", form.genders.filter((x) => x !== g))} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Remove ${g}`}>
                <XIcon size={11} />
              </button>
            </span>
          ))}
          {quick.map((g) => (
            <button key={g} type="button" onClick={() => addGender(g)} className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-700">
              + {g}
            </button>
          ))}
        </div>
        {form.genders.length < MAX_GENDERS && (
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              list="gender-suggestions"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGender(draft);
                }
              }}
              placeholder="e.g. Genderqueer, Two-Spirit, Trans woman…"
            />
            <Button type="button" variant="outline" onClick={() => addGender(draft)} disabled={!draft.trim()}>
              Add
            </Button>
            <datalist id="gender-suggestions">
              {GENDER_SUGGESTIONS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pronouns">
          <input className={inputClass} list="pronoun-suggestions" value={form.pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="she/her, he/him, they/them…" />
          <datalist id="pronoun-suggestions">
            {PRONOUNS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Relationship status">
          <input
            className={inputClass}
            list="status-suggestions"
            value={form.relationshipStatus}
            onChange={(e) => set("relationshipStatus", e.target.value)}
            placeholder="Single, Married, Polyamorous…"
          />
          <datalist id="status-suggestions">
            {RELATIONSHIP_STATUSES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Words for family and relationships" hint="Used in relationship labels on other profiles.">
        <div className="grid grid-cols-3 gap-2">
          {TERMS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => (set("terms", t.value), setTermsTouched(true))}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                form.terms === t.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`block text-sm font-medium ${form.terms === t.value ? "text-brand-700" : "text-slate-700"}`}>{t.label}</span>
              <span className="block text-[11px] text-slate-400">{t.example}</span>
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}
