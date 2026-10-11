// Change the workspace password, optionally rotating the encryption key.
import { useState } from "react";
import { CheckCircleIcon, CircleNotchIcon, KeyIcon, ShieldCheckIcon, WarningIcon } from "@phosphor-icons/react";
import { api, errorMessage, type PasswordChange } from "../lib/api";
import { useJournal } from "../lib/journal";
import { Button, ErrorText, Field, inputClass, Modal, PasswordStrength } from "./ui";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { snapshot, refresh } = useJournal();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rotate, setRotate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PasswordChange | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = !busy && current.length > 0 && next.length >= 8 && next === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.changePassword(current, next, rotate);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(result);
      await refresh(); // a rotation also completes pending migrations
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Password changed" onClose={onClose}>
        <div className="space-y-3 text-sm text-slate-600">
          <p className="flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircleIcon size={20} />
            {done.rotated ? `New key generated and ${done.filesRewritten} files re-encrypted.` : "The new password is in effect."}
          </p>
          <p>Commit the change so other copies of the repository pick it up:</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
            git add data_sources/{snapshot.workspace.id}
            {"\n"}git commit -m "Change journal password"
          </pre>
          <p className="text-slate-500">
            {done.rotated
              ? "Older commits in git history are still encrypted with the old key and still open with the old password. Everything from now on uses the new key only."
              : "Older commits still contain the previous key wrapping, so the old password keeps opening old copies of the repository."}
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Change password" onClose={busy ? () => {} : onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current password">
          <input type="password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </Field>
        <Field label="New password">
          <input type="password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
          <PasswordStrength password={next} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <span className="mt-1 block text-xs text-rose-600">Passwords don't match.</span>}
        </Field>

        <fieldset className="space-y-2">
          <Option
            checked={!rotate}
            onSelect={() => setRotate(false)}
            icon={<KeyIcon size={20} />}
            title="Change password"
            body="Instant. Only workspace.json changes. Old copies of the repository (including git history) still open with the old password, and so would anything you write later if someone has those old files."
          />
          <Option
            checked={rotate}
            onSelect={() => setRotate(true)}
            icon={<ShieldCheckIcon size={20} />}
            title="Change password and re-encrypt everything"
            body="Use this if someone may know the old password. Generates a new key and re-encrypts every entry, profile, item, photo and video. Takes longer with lots of media. Interrupted runs are finished automatically on the next unlock."
          />
        </fieldset>

        {rotate && (
          <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <WarningIcon size={16} className="mt-0.5 shrink-0" />
            Git history keeps the old encrypted files, which still open with the old password. Re-encrypting protects
            everything written from now on; removing old history requires rewriting or recreating the repository.
          </p>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? (
              <>
                <CircleNotchIcon className="animate-spin" /> {rotate ? "Re-encrypting…" : "Updating…"}
              </>
            ) : rotate ? (
              "Change password and re-encrypt"
            ) : (
              "Change password"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Option(props: { checked: boolean; onSelect: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
        props.checked ? "border-brand-500 bg-brand-50/60" : "border-slate-200 hover:bg-slate-50"
      }`}
    >
      <input type="radio" checked={props.checked} onChange={props.onSelect} className="mt-1 accent-brand-600" />
      <span className={props.checked ? "text-brand-700" : "text-slate-400"}>{props.icon}</span>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{props.title}</span>
        <span className="block text-xs text-slate-500">{props.body}</span>
      </span>
    </label>
  );
}
