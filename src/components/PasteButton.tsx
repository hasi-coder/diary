// "Paste" for images on the clipboard (screenshots, copied photos). ⌘V works too.
import { useState } from "react";
import { ClipboardTextIcon } from "@phosphor-icons/react";
import { errorMessage } from "../lib/api";
import { readClipboardImages } from "../lib/uploads";

export function PasteButton(props: { onFiles: (files: File[]) => void; className?: string; label?: string; iconSize?: number }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        title="Paste an image from the clipboard (or press ⌘V / Ctrl+V)"
        onClick={async () => {
          setError(null);
          try {
            props.onFiles(await readClipboardImages());
          } catch (e) {
            setError(errorMessage(e));
            setTimeout(() => setError(null), 3500);
          }
        }}
        className={props.className ?? "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"}
      >
        <ClipboardTextIcon size={props.iconSize ?? 16} /> {props.label}
      </button>
      {error && (
        <span role="status" className="absolute bottom-full left-0 z-50 mb-1 w-60 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg">
          {error}
        </span>
      )}
    </span>
  );
}
