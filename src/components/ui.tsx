// Small shared building blocks: avatar, modal, confirm dialog, buttons, fields.
import { useEffect, useState, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { colorOf, initials, KINDS } from "../lib/format";

const AVATAR_SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
  xl: "w-36 h-36 text-4xl border-4 border-white shadow-md",
};

export function Avatar({ profile, size = "md" }: { profile?: Profile; size?: keyof typeof AVATAR_SIZES }) {
  // People are round; pages, shops and places are rounded squares (like Facebook pages).
  const round = !profile || profile.kind === "me" || profile.kind === "person";
  return (
    <div
      className={`${AVATAR_SIZES[size]} ${colorOf(profile).avatar} ${round ? "rounded-full" : "rounded-2xl"} flex shrink-0 items-center justify-center font-bold select-none`}
      aria-hidden
    >
      {profile ? initials(profile.name) : "?"}
    </div>
  );
}

export function KindBadge({ profile }: { profile: Profile }) {
  const { icon: Icon, label } = KINDS[profile.kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <Icon weight="bold" /> {label}
    </span>
  );
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={props.title}
        className={`max-h-full w-full ${props.wide ? "max-w-xl" : "max-w-md"} flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{props.title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <div className="thin-scroll overflow-y-auto p-5">{props.children}</div>
      </div>
    </div>
  );
}

/** Replacement for window.confirm, which the Tauri webview doesn't support everywhere. */
export function ConfirmDialog(props: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <div className="text-sm text-slate-600">{props.message}</div>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await props.onConfirm();
              props.onClose();
            } catch (e) {
              setError(String(e));
              setBusy(false);
            }
          }}
        >
          {props.confirmLabel ?? "Delete"}
        </Button>
      </div>
    </Modal>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-500 shadow-sm shadow-brand-500/30",
  dark: "bg-slate-800 text-white hover:bg-slate-700",
  ghost: "text-slate-600 hover:bg-slate-100",
  outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
};

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-xs text-slate-400">{props.hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</p>;
}

export function EmptyState(props: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
        {props.icon}
      </div>
      <h3 className="font-semibold text-slate-700">{props.title}</h3>
      {props.children && <div className="mt-1 text-sm text-slate-500">{props.children}</div>}
    </div>
  );
}
