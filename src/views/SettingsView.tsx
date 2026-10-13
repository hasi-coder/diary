// Workspace details, what's visible in the repository, and storage migrations.
import { useEffect, useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, CheckCircleIcon, HardDrivesIcon, EyeIcon, EyeSlashIcon, GearIcon, ImageIcon, KeyIcon, ShieldCheckIcon, WarningIcon } from "@phosphor-icons/react";
import { loadPrefs, savePrefs, type UploadFormat, type UploadPrefs } from "../lib/uploads";
import { api, errorMessage, type StorageUsage } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useJournal } from "../lib/journal";
import { AgentAccessCard } from "../components/AgentAccessCard";
import { SyncCard } from "../components/SyncParts";
import { ChangePasswordDialog } from "../components/ChangePassword";
import { Page } from "../components/Shell";
import { Button, ErrorText } from "../components/ui";

export function SettingsView() {
  const { snapshot, owner } = useJournal();
  const { workspace, storage } = snapshot;
  const [changingPassword, setChangingPassword] = useState(false);

  return (
    <Page
      title={
        <>
          <GearIcon className="text-brand-500" /> Settings
        </>
      }
    >
      <div className="space-y-6">
        <MigrationCard />

        <StorageCard />

        <UploadsCard />

        <SyncCard />

        <AgentAccessCard />

        <Card title="Workspace">
          <Rows
            rows={[
              ["Name", workspace.name],
              ["Folder", <code key="f">{workspace.id}</code>],
              ["Location", <code key="l" className="break-all">{storage.path}</code>],
              ["Journal owner", owner.name],
            ]}
          />
        </Card>

        <Card title="Encryption" icon={<ShieldCheckIcon className="text-brand-500" />}>
          <Rows
            rows={[
              ["Records", `${storage.cipher}, a random nonce per write, bound to record kind and id`],
              ["Password", `${storage.kdf} (${storage.kdfMemoryKib / 1024} MiB, ${storage.kdfIterations} passes, ${storage.kdfParallelism} lane) unwraps a random data key`],
              ["Padding", `Plaintext padded to ${storage.padBlock / 1024} KiB blocks`],
              ["Decrypted cache", "In memory only, wiped on lock"],
            ]}
          />
        </Card>

        <Card title="Password" icon={<KeyIcon className="text-brand-500" />}>
          <p className="mb-4 text-sm text-slate-500">
            The password unlocks a random encryption key. Changing it only re-wraps that key, unless you also choose to
            re-encrypt everything with a new key.
          </p>
          <Button variant="outline" onClick={() => setChangingPassword(true)}>
            <KeyIcon /> Change password…
          </Button>
        </Card>

        <Card title="What the repository reveals">
          <div className="grid gap-4 sm:grid-cols-2">
            <List
              icon={<EyeSlashIcon className="text-emerald-600" />}
              title="Encrypted"
              items={["Workspace name and profiles", "Post text, dates, mentions and #tags", "Shop items and prices", "Which profile wrote what"]}
            />
            <List
              icon={<EyeIcon className="text-amber-600" />}
              title="Visible"
              items={[
                "Folder label",
                "Format version and KDF parameters",
                "Record kind and count (profile, post or item)",
                `Size, rounded to ${storage.padBlock / 1024} KiB`,
                "Git commit times",
              ]}
            />
          </div>
        </Card>
      </div>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </Page>
  );
}

function MigrationCard() {
  const { snapshot, replace } = useJournal();
  const m = snapshot.migration;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const files = m.staleFiles;
      replace(await api.runMigration());
      setDone(files);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Storage format" icon={<ArrowsClockwiseIcon className="text-brand-500" />}>
      <div className="mb-4 flex flex-wrap gap-6 text-sm">
        <Stat label="App writes" value={`v${m.currentSchema}`} />
        <Stat label="On disk" value={`v${m.diskSchema}`} />
        <Stat label="Files to rewrite" value={String(m.staleFiles)} />
      </div>

      {m.pending.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircleIcon size={18} />
          {done !== null ? `Migration complete. Rewrote ${done} files.` : "Everything is stored in the current format."}
        </p>
      ) : (
        <>
          <ol className="mb-4 space-y-3">
            {m.pending.map((s) => (
              <li key={s.version} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="text-sm font-semibold text-slate-800">
                  v{s.version}: {s.title}
                </div>
                <p className="mt-1 text-sm text-slate-600">{s.detail}</p>
              </li>
            ))}
          </ol>
          <p className="mb-4 text-sm text-slate-500">
            Your journal already works: older files are upgraded in memory when you unlock. Running the migration
            rewrites them on disk. Each file is replaced atomically, so you can safely run it again if it's interrupted.
          </p>
          <Button onClick={run} disabled={busy}>
            <ArrowsClockwiseIcon className={busy ? "animate-spin" : ""} /> {busy ? "Migrating…" : `Run migration (${m.staleFiles} files)`}
          </Button>
        </>
      )}
      {done !== null && (
        <p className="mt-3 text-sm text-slate-500">
          Review the change with <code>git status data_sources/</code>, then commit it.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}

/** Shown on the timeline while files on disk use an older format. */
export function MigrationBanner() {
  const { snapshot, navigate } = useJournal();
  const m = snapshot.migration;
  if (m.pending.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <WarningIcon size={20} className="shrink-0 text-amber-600" />
      <span className="flex-1">
        This workspace has {m.staleFiles} files in storage format v{m.diskSchema}. The app uses v{m.currentSchema}.
      </span>
      <Button variant="outline" onClick={() => navigate({ view: "settings" })}>
        Review migration
      </Button>
    </div>
  );
}

/** How photos are stored when uploaded or pasted: converted, resized, or kept as they are. */
function UploadsCard() {
  const [prefs, setPrefs] = useState<UploadPrefs>(loadPrefs);
  const set = (patch: Partial<UploadPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };
  const formats: { value: UploadFormat; label: string; detail: string }[] = [
    { value: "jpeg", label: "JPEG", detail: "Smallest files. Screenshots and PNGs become JPEGs." },
    { value: "png", label: "PNG", detail: "Lossless, larger files. Keeps transparency." },
    { value: "original", label: "Keep original", detail: "Stored exactly as uploaded." },
  ];
  return (
    <Card title="Photo uploads" icon={<ImageIcon className="text-brand-500" />}>
      <p className="mb-4 text-sm text-slate-500">
        Applies to photos you upload, drop or paste (⌘V / Ctrl+V) anywhere: posts, albums, products and profile photos. Conversion happens on this
        device before encryption. Converting also removes hidden photo data such as GPS location. Videos and GIFs are never converted.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {formats.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => set({ format: f.value })}
            className={`rounded-xl border px-3 py-2.5 text-left ${prefs.format === f.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
          >
            <span className={`block text-sm font-semibold ${prefs.format === f.value ? "text-brand-700" : "text-slate-700"}`}>{f.label}</span>
            <span className="block text-xs text-slate-500">{f.detail}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className={`block text-sm ${prefs.format === "jpeg" ? "" : "opacity-40"}`}>
          <span className="mb-1 flex justify-between font-medium text-slate-700">
            JPEG quality <span className="text-slate-500">{Math.round(prefs.quality * 100)}%</span>
          </span>
          <input
            type="range"
            min={50}
            max={100}
            value={Math.round(prefs.quality * 100)}
            disabled={prefs.format !== "jpeg"}
            onChange={(e) => set({ quality: Number(e.target.value) / 100 })}
            className="w-full accent-brand-600"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Resize to</span>
          <select value={prefs.maxDimension} onChange={(e) => set({ maxDimension: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value={0}>Original size</option>
            <option value={4096}>4096 px (4K)</option>
            <option value={2560}>2560 px</option>
            <option value={1920}>1920 px (Full HD)</option>
            <option value={1280}>1280 px</option>
          </select>
        </label>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={prefs.keepSmaller} onChange={(e) => set({ keepSmaller: e.target.checked })} className="h-4 w-4 accent-brand-600" />
        Keep the original when converting would make it bigger (flat-colour screenshots are often smaller as PNG)
      </label>
      <p className="mt-3 text-xs text-slate-400">Saved on this device. Photos already in the journal are not changed.</p>
    </Card>
  );
}

const STORAGE_PARTS: Record<StorageUsage["parts"][number]["key"], { label: string; color: string }> = {
  media: { label: "Photos & videos", color: "bg-brand-500" },
  posts: { label: "Posts, articles & albums", color: "bg-emerald-500" },
  items: { label: "Products", color: "bg-amber-500" },
  entities: { label: "Profiles & pages", color: "bg-violet-500" },
  series: { label: "Series", color: "bg-rose-500" },
  other: { label: "Workspace & key file", color: "bg-slate-400" },
};

/** Disk space per kind of record, from file sizes alone. */
function StorageCard() {
  const { version, snapshot, navigate } = useJournal();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  useEffect(() => void api.storageUsage().then(setUsage).catch(() => {}), [version]);
  if (!usage) return null;
  const parts = [...usage.parts].filter((p) => p.files > 0).sort((a, b) => b.bytes - a.bytes);
  const share = (bytes: number) => (usage.totalBytes ? (bytes / usage.totalBytes) * 100 : 0);
  return (
    <Card title="Storage" icon={<HardDrivesIcon className="text-brand-500" />}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold text-slate-800">{formatBytes(usage.totalBytes)}</span>
        <span className="text-sm text-slate-500">{usage.parts.reduce((n, p) => n + p.files, 0).toLocaleString()} encrypted files</span>
      </div>
      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {parts.map((p) => (
          <div key={p.key} className={STORAGE_PARTS[p.key].color} style={{ width: `${Math.max(share(p.bytes), 0.5)}%` }} title={STORAGE_PARTS[p.key].label} />
        ))}
      </div>
      <dl className="divide-y divide-slate-100">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-3 py-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${STORAGE_PARTS[p.key].color}`} />
            <dt className="flex-1 text-slate-700">{STORAGE_PARTS[p.key].label}</dt>
            <dd className="w-24 text-right text-slate-400">{p.files.toLocaleString()} {p.files === 1 ? "file" : "files"}</dd>
            <dd className="w-20 text-right font-medium text-slate-800">{formatBytes(p.bytes)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-400">
        Includes things in the Trash
        {snapshot.trashCount > 0 && (
          <>
            {" "}
            (
            <button className="text-brand-600 hover:underline" onClick={() => navigate({ view: "trash" })}>
              {snapshot.trashCount} {snapshot.trashCount === 1 ? "item" : "items"}
            </button>
            ); emptying it frees their space
          </>
        )}
        . Save &amp; Sync copies this much to each destination.
      </p>
    </Card>
  );
}

function Card(props: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-800">
        {props.icon} {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[9rem_1fr] gap-4 py-2.5 text-sm">
          <dt className="font-medium text-slate-500">{label}</dt>
          <dd className="text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function List(props: { icon: ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {props.icon} {props.title}
      </h3>
      <ul className="space-y-1 text-sm text-slate-600">
        {props.items.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value}</div>
    </div>
  );
}
