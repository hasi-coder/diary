// Save & Sync: the sidebar button, and the Settings card (git "latest version
// only" remote, backup folder, restore).
import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwiseIcon, CircleNotchIcon, CloudArrowUpIcon, FolderIcon, GitBranchIcon } from "@phosphor-icons/react";
import { api, errorMessage, type BackupInfo, type SyncReport, type SyncView } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useJournal } from "../lib/journal";
import { Button, ConfirmDialog, ErrorText, Field, inputClass } from "./ui";

const ago = (t: number | null) => {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};

function summary(r: SyncReport) {
  const parts: string[] = [];
  if (r.backup) parts.push(r.backup.snapshot ? "Backed up" : "Backup unchanged");
  if (r.git) parts.push(r.git.pushed ? "Pushed to git" : "Git up to date");
  return [...parts, ...r.errors].join(" · ") || "Nothing set up yet: see Settings › Save & Sync";
}

/** The sidebar button: back up and push now. */
export function SyncButton() {
  const { navigate, version } = useJournal();
  const [view, setView] = useState<SyncView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const load = useCallback(() => api.getSyncSettings().then(setView).catch(() => {}), []);
  useEffect(() => void load(), [load, version]);

  const configured = !!view && (view.settings.gitRemote || view.settings.backupDir);
  const sync = async (force = false) => {
    // Settings may have just changed in Settings: check the current ones.
    const fresh = await api.getSyncSettings().catch(() => view);
    setView(fresh);
    if (!fresh || (!fresh.settings.gitRemote && !fresh.settings.backupDir)) return navigate({ view: "settings" });
    setBusy(true);
    setMessage(null);
    try {
      const report = await api.syncNow(force);
      setMessage(summary(report));
      if (report.errors.some((e) => e.includes("didn't push"))) setConflict(true);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
      void load();
    }
  };
  const last = Math.max(view?.settings.lastGitAt ?? 0, view?.settings.lastBackupAt ?? 0) || null;
  const failed = !!view?.settings.lastError;

  return (
    <div>
      <button
        onClick={() => void sync()}
        disabled={busy}
        title={message ?? view?.settings.lastError ?? undefined}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-60"
      >
        {busy ? <CircleNotchIcon size={18} className="animate-spin text-brand-500" /> : <CloudArrowUpIcon size={18} />}
        <span className="flex-1 text-left">Save &amp; Sync</span>
        <span className={`text-[11px] ${failed ? "text-rose-500" : "text-slate-400"}`}>{configured ? (failed ? "failed" : ago(last)) : "set up"}</span>
      </button>
      {message && <p className="px-4 pb-1 text-[11px] leading-snug text-slate-500">{message}</p>}
      {conflict && (
        <ConfirmDialog
          title="Overwrite the remote snapshot?"
          message="The git remote has a snapshot this device didn't push, maybe from another computer. Overwriting replaces it with this device's journal (the remote keeps the latest version only)."
          confirmLabel="Overwrite remote"
          onConfirm={async () => {
            setConflict(false);
            await sync(true);
          }}
          onClose={() => setConflict(false)}
        />
      )}
    </div>
  );
}

/** Settings › Save & Sync. */
export function SyncCard() {
  const [view, setView] = useState<SyncView | null>(null);
  const [form, setForm] = useState({ gitRemote: "", gitBranch: "main", sshKey: "", backupDir: "", keep: 10, onLock: false, auto: false });
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);

  const load = useCallback(async () => {
    const v = await api.getSyncSettings();
    setView(v);
    setForm({ gitRemote: v.settings.gitRemote, gitBranch: v.settings.gitBranch || "main", sshKey: v.settings.sshKey ?? "", backupDir: v.settings.backupDir, keep: v.settings.keep || 10, onLock: v.settings.onLock, auto: v.settings.auto ?? false });
    if (v.settings.backupDir) setBackups(await api.listBackups().catch(() => []));
  }, []);
  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)));
  }, [load]);

  if (!view) return null;
  const s = view.settings;
  const dirty = form.gitRemote !== s.gitRemote || form.gitBranch !== (s.gitBranch || "main") || form.sshKey !== (s.sshKey ?? "") || form.backupDir !== s.backupDir || form.keep !== (s.keep || 10) || form.onLock !== s.onLock || form.auto !== (s.auto ?? false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveSyncSettings(form);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-800">
        <CloudArrowUpIcon className="text-brand-500" /> Save &amp; Sync
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Copies this workspace's encrypted files. Nothing is decrypted, so a copy is only as readable as your password is guessable. Settings are kept on
        this device. Use <b>Save &amp; Sync</b> in the sidebar, or sync automatically when you lock.
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <GitBranchIcon /> Git: latest version only
          </h3>
          <p className="text-xs text-slate-500">
            Each sync replaces the branch with a single new commit (no history), so the remote holds only the current state. Use a <b>private</b>{" "}
            repository, and one branch per workspace. Uses your git credentials (keychain, gh or SSH).
          </p>
          {!view.gitAvailable && <ErrorText>git isn't installed on this computer.</ErrorText>}
          <Field label="Remote">
            <input className={inputClass} value={form.gitRemote} onChange={(e) => setForm({ ...form, gitRemote: e.target.value })} placeholder="git@github.com:you/journal-data.git" />
          </Field>
          <Field label="Branch">
            <input className={inputClass} value={form.gitBranch} onChange={(e) => setForm({ ...form, gitBranch: e.target.value })} placeholder="main" />
          </Field>
          <Field label="SSH key (optional)" hint="For git@ remotes: the private key of the account that owns the repository. Leave empty to use your SSH defaults.">
            <input className={inputClass} value={form.sshKey} onChange={(e) => setForm({ ...form, sshKey: e.target.value })} placeholder="~/.ssh/id_ed25519" />
          </Field>
          <p className="text-xs text-slate-400">
            Last pushed: {ago(s.lastGitAt)}
            {s.lastPushedCommit && ` · ${s.lastPushedCommit.slice(0, 8)}`}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FolderIcon /> Backup folder
          </h3>
          <p className="text-xs text-slate-500">
            Versioned snapshots in any folder, e.g. one Google Drive, iCloud or Dropbox syncs. Unchanged files are stored once; restore any snapshot as a
            new workspace.
          </p>
          <Field label="Folder (full path)">
            <input className={inputClass} value={form.backupDir} onChange={(e) => setForm({ ...form, backupDir: e.target.value })} placeholder="~/Google Drive/My Drive/My Diary" />
          </Field>
          <Field label="Snapshots to keep">
            <input type="number" min={1} max={1000} className={inputClass} value={form.keep} onChange={(e) => setForm({ ...form, keep: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <p className="text-xs text-slate-400">Last backup: {ago(s.lastBackupAt)}</p>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.auto} onChange={(e) => setForm({ ...form, auto: e.target.checked })} />
        Save &amp; Sync automatically a minute after changes (yours or an agent's)
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.onLock} onChange={(e) => setForm({ ...form, onLock: e.target.checked })} />
        Save &amp; Sync automatically when I lock the journal
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={!dirty || busy} onClick={() => void save()}>
          Save settings
        </Button>
        <Button
          variant="outline"
          disabled={busy || dirty || (!s.gitRemote && !s.backupDir)}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              setNote(summary(await api.syncNow(false)));
              await load();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <CircleNotchIcon className="animate-spin" /> : <ArrowsClockwiseIcon />} Save &amp; Sync now
        </Button>
        {note && <span className="text-sm text-slate-600">{note}</span>}
      </div>
      {s.lastError && <ErrorText>{s.lastError}</ErrorText>}
      {error && <ErrorText>{error}</ErrorText>}

      {s.backupDir && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Backups</h3>
          {backups.length === 0 ? (
            <p className="text-sm text-slate-400">None yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {backups.map((b) => (
                <li key={b.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-slate-700">{new Date(b.createdAt).toLocaleString()}</span>
                  <span className="text-xs text-slate-400">
                    {b.files} files · {formatBytes(b.bytes)}
                  </span>
                  <Button variant="ghost" onClick={() => setRestoring(b)}>
                    Restore…
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {restoring && (
        <ConfirmDialog
          title="Restore this backup?"
          message="It's restored as a new workspace next to this one (nothing is overwritten). Lock the journal and open it from the workspace list, with the password it had then."
          confirmLabel="Restore"
          onConfirm={async () => {
            const id = await api.restoreBackup(restoring.name);
            setNote(`Restored as ${id}.`);
          }}
          onClose={() => setRestoring(null)}
        />
      )}
    </section>
  );
}
