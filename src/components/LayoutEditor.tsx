// Sets a place's layout: start from a template, or edit the JSON (the same shape
// agents send over MCP), with a picture of the result.
import { useMemo, useState } from "react";
import { CircleNotchIcon, TrashIcon } from "@phosphor-icons/react";
import { api, errorMessage, type Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import { layoutProblems, type Layout } from "../lib/places/layout";
import { TEMPLATES } from "../lib/places/templates";
import { placePicture } from "./world/thumbnail";
import { Button, ConfirmDialog, ErrorText, Modal } from "./ui";

export function LayoutEditor({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { refresh } = useJournal();
  const [text, setText] = useState(() => (profile.layout ? JSON.stringify(profile.layout, null, 2) : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const parsed = useMemo((): { layout: Layout | null; problems: string[] } => {
    if (!text.trim()) return { layout: null, problems: [] };
    try {
      const value = JSON.parse(text);
      const problems = layoutProblems(value);
      return { layout: problems.length ? null : (value as Layout), problems };
    } catch (e) {
      return { layout: null, problems: [`Not valid JSON: ${errorMessage(e)}`] };
    }
  }, [text]);
  const picture = useMemo(() => (parsed.layout ? placePicture(parsed.layout.floors[0], 720, 440) : null), [parsed.layout]);
  const thumbs = useMemo(() => new Map(TEMPLATES.map((t) => [t.id, placePicture(t.layout.floors[0], 320, 200, [], "#f1f5f9")])), []);

  const save = async (layout: Layout | null) => {
    setBusy(true);
    setError(null);
    try {
      await api.setProfileLayout(profile.id, layout);
      await refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Layout of ${profile.name}`} onClose={busy ? () => {} : onClose} huge>
      <h3 className="mb-2 text-sm font-semibold text-slate-600">Start from a template</h3>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setText(JSON.stringify({ ...t.layout, name: profile.name }, null, 2))}
            className="overflow-hidden rounded-xl border border-slate-200 text-left hover:border-brand-500 hover:ring-2 hover:ring-brand-500/20"
          >
            <img src={thumbs.get(t.id)} alt="" className="aspect-[16/10] w-full object-cover" />
            <div className="px-3 py-2">
              <div className="font-semibold text-slate-800">{t.label}</div>
              <div className="text-xs text-slate-500">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Layout JSON</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="Pick a template, or paste a layout."
            className="h-[26rem] w-full rounded-md border border-slate-300 p-3 font-mono text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            1 cell = 1 m; x grows right, y grows down. Doors sit on cell edges (<code>h:x:y</code> is the north side of a cell, <code>v:x:y</code> its west side). Leave room for groups:
            corridors 2 cells, cubicles and fitting rooms 2 × 2.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Preview</h3>
          {picture ? (
            <img src={picture} alt="" className="w-full rounded-xl bg-[#1d232b]" />
          ) : (
            <div className="flex aspect-[18/11] items-center justify-center rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500">
              {parsed.problems.length ? (
                <ul className="space-y-1 text-left text-rose-700">
                  {parsed.problems.slice(0, 6).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                "No layout yet."
              )}
            </div>
          )}
        </div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="mt-5 flex items-center gap-2">
        {profile.layout && (
          <Button variant="outline" className="text-rose-600" disabled={busy} onClick={() => setRemoving(true)}>
            <TrashIcon /> Remove layout
          </Button>
        )}
        <span className="flex-1" />
        {busy && <CircleNotchIcon className="animate-spin text-brand-500" size={20} />}
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void save(parsed.layout)} disabled={busy || !parsed.layout}>
          Save layout
        </Button>
      </div>
      {removing && (
        <ConfirmDialog
          title="Remove this layout?"
          message="The place stays; it just can't be entered until it has a layout again."
          confirmLabel="Remove"
          onConfirm={() => save(null)}
          onClose={() => setRemoving(false)}
        />
      )}
    </Modal>
  );
}
