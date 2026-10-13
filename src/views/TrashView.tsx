// The Trash: deleted posts, profiles and products (yours or an agent's), still
// encrypted on disk. Restore them, or delete them forever.
import { useEffect, useState } from "react";
import { ArrowCounterClockwiseIcon, NotebookIcon, ShoppingBagIcon, TrashIcon, UserIcon } from "@phosphor-icons/react";
import { api, errorMessage, type TrashEntry } from "../lib/api";
import { useJournal } from "../lib/journal";
import { Page } from "../components/Shell";
import { Button, ConfirmDialog, EmptyState, ErrorText } from "../components/ui";

const ICON = { post: NotebookIcon, profile: UserIcon, item: ShoppingBagIcon } as const;
const NOUN = { post: "post", profile: "profile", item: "product" } as const;

export function TrashView() {
  const { version, refresh } = useJournal();
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TrashEntry | "all" | null>(null);

  useEffect(() => {
    api.listTrash().then(setEntries).catch((e) => setError(errorMessage(e)));
  }, [version]);

  const act = async (f: () => Promise<unknown>) => {
    setError(null);
    try {
      await f();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Page
      title={
        <span className="flex items-center gap-2">
          <TrashIcon className="text-brand-500" /> Trash
        </span>
      }
      actions={
        entries && entries.length > 0 ? (
          <Button variant="outline" onClick={() => setConfirm("all")} className="text-rose-600">
            Empty trash
          </Button>
        ) : null
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        Deleted posts, profiles and products stay here (encrypted, with their photos) until you restore them or delete them forever. A deleted profile
        brings back its posts and products when restored. Agents can move pages and products here, but only you can empty it.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      {entries && entries.length === 0 ? (
        <EmptyState icon={<TrashIcon />} title="The Trash is empty" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
          {(entries ?? []).map((e) => {
            const Icon = ICON[e.kind];
            return (
              <li key={`${e.kind}:${e.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{e.title}</div>
                  <div className="text-xs text-slate-400">
                    <span className="capitalize">{e.subtitle === "status" ? "post" : e.subtitle}</span> · deleted {new Date(e.trashedAt).toLocaleString()}
                    {e.withCount > 0 && ` · with ${e.withCount} post${e.withCount === 1 ? "" : "s"} and product${e.withCount === 1 ? "" : "s"}`}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => act(() => api.restoreFromTrash(e.kind, e.id))}>
                  <ArrowCounterClockwiseIcon /> Restore
                </Button>
                <Button variant="ghost" className="text-rose-600" onClick={() => setConfirm(e)}>
                  Delete forever
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm === "all" ? "Empty the Trash?" : `Delete this ${NOUN[confirm.kind]} forever?`}
          message={
            confirm === "all"
              ? `Everything in the Trash (${entries?.length ?? 0} entries) and its photos and videos will be deleted for good.`
              : <>
                  <b>{confirm.title}</b>
                  {confirm.withCount > 0 && ` and the ${confirm.withCount} posts and products that went with it`} will be deleted for good, with its photos and videos.
                </>
          }
          onConfirm={() => act(() => (confirm === "all" ? api.emptyTrash() : api.purgeFromTrash(confirm.kind, confirm.id)))}
          onClose={() => setConfirm(null)}
        />
      )}
    </Page>
  );
}
