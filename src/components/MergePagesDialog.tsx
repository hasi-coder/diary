import { useState } from "react";
import { api, errorMessage, type Profile } from "../lib/api";
import { canSell } from "../lib/format";
import { useJournal } from "../lib/journal";
import { Avatar, Button, ErrorText, Field, Modal } from "./ui";

export function MergePagesDialog({ source, onClose }: { source: Profile; onClose: () => void }) {
  const { snapshot, navigate, refresh } = useJournal();
  const candidates = snapshot.profiles
    .filter((p) => p.id !== source.id && (p.kind === "page" || p.kind === "shop") && (!canSell(source) || canSell(p)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = candidates.find((p) => p.id === targetId);
  const sourceCount = snapshot.items.filter((i) => i.shopId === source.id).length;
  const targetCount = snapshot.items.filter((i) => i.shopId === targetId).length;

  return (
    <Modal title={`Merge ${source.name}`} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!target || busy) return;
        setBusy(true);
        setError(null);
        try {
          await api.mergePages(source.id, target.id);
          await refresh();
          navigate({ view: "profile", id: target.id, tab: canSell(target) ? "shop" : "about" });
          onClose();
        } catch (err) {
          setError(errorMessage(err));
          await refresh().catch(() => {});
          setBusy(false);
        }
      }} className="space-y-4">
        <Field label="Page or shop to keep">
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" required>
            <option value="">Choose a page or shop…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {candidates.length === 0 && <p className="text-sm text-slate-600">There are no other compatible pages or shops to merge into.</p>}
        {target && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex items-center gap-3"><Avatar profile={target} size="sm" /><strong>{target.name}</strong></div>
            <p>{sourceCount} products from {source.name} will join {targetCount} products in {target.name}. Photos, posts and tags are kept. Product listings are not deduplicated.</p>
            <p>{target.name} keeps its details and photos. Empty fields are filled from {source.name}.</p>
            <p>The old profile goes to Trash. Restoring it will not undo the merge.</p>
          </div>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!target || busy}>{busy ? "Merging…" : "Merge"}</Button>
        </div>
      </form>
    </Modal>
  );
}
