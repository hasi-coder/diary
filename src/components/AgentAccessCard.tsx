// Settings › Agent access: lets coding agents (Claude Code, Codex, GitHub
// Copilot) manage pages and products over MCP while the journal is unlocked.
import { useEffect, useState } from "react";
import { ArrowsClockwiseIcon, CheckIcon, CopyIcon, EyeIcon, EyeSlashIcon, RobotIcon } from "@phosphor-icons/react";
import { api, errorMessage, type AgentAccess } from "../lib/api";
import { useJournal } from "../lib/journal";
import { Button, ConfirmDialog, ErrorText } from "./ui";

type Client = "claude" | "codex" | "vscode" | "stdio";
const CLIENTS: { id: Client; label: string; where: string }[] = [
  { id: "claude", label: "Claude Code", where: "Run in a terminal" },
  { id: "codex", label: "Codex", where: "Add to ~/.codex/config.toml" },
  { id: "vscode", label: "VS Code · Copilot", where: "Add to .vscode/mcp.json (or your user mcp.json)" },
  { id: "stdio", label: "Other (stdio)", where: "Any MCP client that launches a command" },
];

function snippet(client: Client, a: AgentAccess, token: string) {
  switch (client) {
    case "claude":
      return `claude mcp add --transport http my-diary ${a.url} --header "Authorization: Bearer ${token}"`;
    case "codex":
      return `[mcp_servers.my-diary]\ncommand = "${a.executable}"\nargs = ["--mcp-stdio"]\nenv = { MY_DIARY_MCP_TOKEN = "${token}", MY_DIARY_MCP_URL = "${a.url}" }`;
    case "vscode":
      return JSON.stringify({ servers: { "my-diary": { type: "http", url: a.url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
    case "stdio":
      return JSON.stringify({ mcpServers: { "my-diary": { command: a.executable, args: ["--mcp-stdio"], env: { MY_DIARY_MCP_TOKEN: token, MY_DIARY_MCP_URL: a.url } } } }, null, 2);
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
    >
      {done ? <CheckIcon /> : <CopyIcon />} {done ? "Copied" : "Copy"}
    </button>
  );
}

export function AgentAccessCard() {
  const { version } = useJournal();
  const [access, setAccess] = useState<AgentAccess | null>(null);
  const [port, setPort] = useState("");
  const [reveal, setReveal] = useState(false);
  const [client, setClient] = useState<Client>("claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = () =>
    api
      .getAgentAccess()
      .then((a) => (setAccess(a), setPort(String(a.port))))
      .catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, [version]);

  const apply = async (f: () => Promise<AgentAccess>) => {
    setBusy(true);
    setError(null);
    try {
      const a = await f();
      setAccess(a);
      setPort(String(a.port));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!access) return null;
  const token = reveal ? access.token : "•".repeat(16);
  const text = snippet(client, access, access.token);
  const shown = snippet(client, access, token);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
            <RobotIcon className="text-brand-500" /> Agent access (MCP)
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Lets coding agents (Claude Code, Codex, GitHub Copilot) publish <b>pages, shops and products</b> from a URL you give them. Only while
            the journal is unlocked, only from this computer, and only with the token below.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={access.enabled}
            disabled={busy}
            onChange={(e) => apply(() => api.setAgentAccess(e.target.checked))}
          />
          <span className="relative h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-brand-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
          {access.enabled ? "On" : "Off"}
        </label>
      </div>

      <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Agents can</div>
          <ul className="mt-1 list-disc pl-4 text-slate-600">
            <li>list and read pages, shops and products (metadata)</li>
            <li>create and update them, from details on a web page</li>
            <li>add photos (from image URLs or uploads)</li>
            <li>delete them, into your Trash</li>
          </ul>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Agents can't</div>
          <ul className="mt-1 list-disc pl-4 text-slate-600">
            <li>read or change posts, people, your profile or series</li>
            <li>see your password or encryption key</li>
            <li>empty the Trash or restore from it</li>
            <li>connect while the journal is locked</li>
          </ul>
        </div>
      </div>

      {access.enabled && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${access.running ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <span className={`h-2 w-2 rounded-full ${access.running ? "bg-emerald-500" : "bg-amber-500"}`} />
              {access.running ? `Listening on ${access.url}` : "Not running (is the port in use?)"}
            </span>
            <label className="flex items-center gap-1.5 text-slate-600">
              Port
              <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
            </label>
            {Number(port) !== access.port && (
              <Button variant="outline" disabled={busy || Number(port) < 1024 || Number(port) > 65535} onClick={() => apply(() => api.setAgentAccess(true, Number(port)))}>
                Save port
              </Button>
            )}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">Token</span>
            <code className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{token}</code>
            <button type="button" onClick={() => setReveal((r) => !r)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
              {reveal ? <EyeSlashIcon /> : <EyeIcon />} {reveal ? "Hide" : "Show"}
            </button>
            <Button variant="ghost" onClick={() => setRegenerating(true)}>
              <ArrowsClockwiseIcon /> New token
            </Button>
          </div>

          <div className="mb-1 flex flex-wrap gap-1">
            {CLIENTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClient(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${client === c.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs text-slate-500">{CLIENTS.find((c) => c.id === client)?.where}. Keep it out of shared repositories: the token lets an agent edit your pages and products.</p>
          <div className="relative rounded-xl bg-slate-900 p-3 pr-20">
            <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed text-slate-100">{shown}</pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={text} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Then ask your agent, for example: “Publish the shop at https://… and its products to My Diary.” The agent reads the page; My Diary
            stores what it sends, encrypted, and remembers the source URL so re-publishing updates instead of duplicating.
          </p>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent agent activity</h3>
              <button type="button" onClick={() => void load()} className="text-xs text-slate-500 hover:text-slate-800">
                Refresh
              </button>
            </div>
            {access.log.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing yet. (Kept in memory only, until the app closes.)</p>
            ) : (
              <ul className="thin-scroll max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
                {access.log.map((e, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-1.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${e.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <code className="w-36 shrink-0 truncate text-xs text-slate-500">{e.tool}</code>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{e.summary}</span>
                    <span className="shrink-0 text-xs text-slate-400">{new Date(e.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {regenerating && (
        <ConfirmDialog
          title="Make a new token?"
          message="Agents set up with the current token will stop working until you give them the new one."
          confirmLabel="New token"
          onConfirm={async () => {
            await apply(() => api.regenerateAgentToken());
          }}
          onClose={() => setRegenerating(false)}
        />
      )}
    </section>
  );
}
