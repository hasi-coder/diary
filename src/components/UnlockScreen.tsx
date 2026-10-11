// Pick a workspace and decrypt it, or create a new one.
import { useEffect, useState } from "react";
import { CircleNotchIcon, LockKeyIcon, LockKeyOpenIcon, PlusIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { api, errorMessage, isTauri, type Snapshot, type WorkspaceInfo } from "../lib/api";
import { PasswordStrength } from "./ui";

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const glassInput =
  "w-full rounded-xl border border-slate-200 bg-white/60 px-4 py-3 text-slate-800 placeholder-slate-400 transition-all focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none";

export function UnlockScreen({ onUnlocked }: { onUnlocked: (s: Snapshot) => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[] | null>(null);
  const [mode, setMode] = useState<"unlock" | "create">("unlock");
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("Personal");
  const [folder, setFolder] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setError("The journal backend isn't available. Start the app with `npm run tauri:dev`.");
      setWorkspaces([]);
      return;
    }
    api
      .listWorkspaces()
      .then((list) => {
        setWorkspaces(list);
        setSelected(list[0]?.id ?? "");
        if (list.length === 0) setMode("create");
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "create" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const snapshot =
        mode === "unlock" ? await api.unlockWorkspace(selected, password) : await api.createWorkspace(folder, name, ownerName, password);
      setPassword("");
      setConfirm("");
      onUnlocked(snapshot);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const current = workspaces?.find((w) => w.id === selected);
  const canUnlock = mode === "unlock" && !!selected && password.length > 0;
  const canCreate = mode === "create" && name.trim() && ownerName.trim() && password.length >= 8 && confirm.length > 0;

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 bg-[radial-gradient(ellipse_at_top,_#134e4a_0%,_#0f172a_60%)] p-4">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm">
          <LockKeyIcon size={32} className="text-brand-600" />
        </div>

        {mode === "unlock" ? (
          <>
            <h1 className="mb-2 text-2xl font-bold text-slate-800">Unlock Workspace</h1>
            <p className="mb-6 text-sm text-slate-500">
              Enter the root password to decrypt <span className="font-semibold text-slate-700">{current?.label ?? "your journal"}</span>.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-bold text-slate-800">New Workspace</h1>
            <p className="mb-6 text-sm text-slate-500">
              Everything is encrypted with this password. <span className="font-semibold text-slate-700">It can't be recovered</span> if you forget it.
            </p>
          </>
        )}

        <form onSubmit={submit} className="space-y-3 text-left">
          {mode === "unlock" ? (
            <>
              {workspaces && workspaces.length > 1 && (
                <select className={glassInput} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Workspace">
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              )}
              <input type="password" className={glassInput} placeholder="Master password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </>
          ) : (
            <>
              <input className={glassInput} placeholder="Workspace name (encrypted)" value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <input
                  className={glassInput}
                  placeholder={`Folder label (default: ${slugify(name) || "personal"})`}
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                />
                <p className="mt-1 px-1 text-xs text-slate-500">
                  The only name visible in the repo: <code>workspace_{slugify(folder) || slugify(name) || "…"}</code>. Pick something generic if the name is private.
                </p>
              </div>
              <input className={glassInput} placeholder="Your name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoFocus />
              <div>
                <input type="password" className={glassInput} placeholder="Master password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
                <PasswordStrength password={password} />
              </div>
              <input type="password" className={glassInput} placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </>
          )}

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || !(canUnlock || canCreate)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-medium text-white shadow-md shadow-brand-500/30 transition-all hover:bg-brand-500 disabled:opacity-50"
          >
            {busy ? (
              <>
                <CircleNotchIcon className="animate-spin" /> {mode === "unlock" ? "Decrypting…" : "Deriving key…"}
              </>
            ) : mode === "unlock" ? (
              <>
                <LockKeyOpenIcon /> Decrypt & Enter
              </>
            ) : (
              <>
                <ShieldCheckIcon /> Create encrypted workspace
              </>
            )}
          </button>
        </form>

        {workspaces && (
          <button
            onClick={() => {
              setMode(mode === "unlock" ? "create" : "unlock");
              setError(null);
              setPassword("");
              setConfirm("");
            }}
            disabled={mode === "create" && workspaces.length === 0}
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:hidden"
          >
            {mode === "unlock" ? (
              <>
                <PlusIcon /> Create a new workspace
              </>
            ) : (
              "Back to unlock"
            )}
          </button>
        )}

        <div className="mt-6 flex items-center justify-center gap-1 text-xs text-slate-400">
          <ShieldCheckIcon /> AES-256-GCM Zero-Knowledge
        </div>
      </div>
    </div>
  );
}
