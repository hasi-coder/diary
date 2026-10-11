// Workspace details, what's visible in the repository, and storage migrations.
import { useState, type ReactNode } from "react";
import { ArrowsClockwiseIcon, CheckCircleIcon, EyeIcon, EyeSlashIcon, GearIcon, KeyIcon, ShieldCheckIcon, WarningIcon } from "@phosphor-icons/react";
import { api, errorMessage } from "../lib/api";
import { useJournal } from "../lib/journal";
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

function Card(props: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
