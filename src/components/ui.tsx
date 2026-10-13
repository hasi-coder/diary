// Small shared building blocks: avatar, modal, confirm dialog, buttons, fields.
import { useEffect, useState, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";
import { mediaUrl, type Profile } from "../lib/api";
import { colorOf, initials, KINDS } from "../lib/format";

const AVATAR_SIZES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
  xl: "w-[168px] h-[168px] text-5xl border-4 border-white",
};

export function Avatar({ profile, size = "md" }: { profile?: Profile; size?: keyof typeof AVATAR_SIZES }) {
  // Everyone and every page is a circle, as on Facebook.
  const shape = `${AVATAR_SIZES[size]} rounded-full shrink-0`;
  if (profile?.avatar) {
    return <img src={mediaUrl(profile.avatar.id)} alt="" draggable={false} className={`${shape} bg-slate-100 object-cover`} />;
  }
  return (
    <div className={`${shape} ${colorOf(profile).avatar} flex items-center justify-center font-bold select-none`} aria-hidden>
      {profile ? initials(profile.name) : "?"}
    </div>
  );
}

/** A profile's cover photo, or its colour gradient. */
export function CoverImage({ profile, className = "" }: { profile: Profile; className?: string }) {
  if (profile.cover) {
    return (
      <div className={`overflow-hidden bg-slate-200 ${className}`}>
        <img
          src={mediaUrl(profile.cover.id)}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={{ objectPosition: `50% ${profile.coverPosition}%` }}
        />
      </div>
    );
  }
  return <div className={`bg-gradient-to-r ${colorOf(profile).cover} ${className}`} />;
}

export function KindBadge({ profile }: { profile: Profile }) {
  const { icon: Icon, label } = KINDS[profile.kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      <Icon weight="bold" /> {label}
    </span>
  );
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; huge?: boolean }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/80 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={props.title}
        className={`max-h-full w-full ${props.huge ? "max-w-5xl" : props.wide ? "max-w-xl" : "max-w-md"} flex flex-col overflow-hidden rounded-lg bg-white shadow-[0_12px_28px_0_rgb(0_0_0/0.2),0_2px_4px_0_rgb(0_0_0/0.1)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center border-b border-slate-200 px-14 py-4">
          <h2 className="truncate text-xl font-bold text-slate-800">{props.title}</h2>
          <button
            onClick={onClose}
            className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            aria-label="Close"
          >
            <XIcon size={20} weight="bold" />
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
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  dark: "bg-slate-800 text-white hover:bg-slate-700",
  ghost: "text-slate-500 hover:bg-slate-50",
  outline: "bg-slate-100 text-slate-800 hover:bg-slate-200",
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
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
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
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</p>;
}

export function EmptyState(props: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg bg-white px-6 py-12 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
        {props.icon}
      </div>
      <h3 className="font-semibold text-slate-700">{props.title}</h3>
      {props.children && <div className="mt-1 text-sm text-slate-500">{props.children}</div>}
    </div>
  );
}

const COMMON_PASSWORDS = ["password", "12345678", "123456789", "qwerty", "letmein", "iloveyou", "admin123", "welcome1"];

/** Rough strength estimate from length and character variety. A guide, not a guarantee. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (pw.length < 8) return { score: 0, label: pw ? "Too short (8+ characters)" : "" };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9\s]/.test(pw) && /[\x21-\x7e]/.test(pw)) pool += 33;
  if (/\s/.test(pw)) pool += 1;
  if (/[^\x00-\x7f]/.test(pw)) pool += 100;
  let bits = pw.length * Math.log2(Math.max(pool, 2));
  const lower = pw.toLowerCase();
  if (COMMON_PASSWORDS.some((c) => lower.includes(c)) || /^(.)\1+$/.test(pw)) bits = Math.min(bits, 20);
  if (bits < 40) return { score: 1, label: "Weak" };
  if (bits < 60) return { score: 2, label: "Fair" };
  if (bits < 80) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}

const STRENGTH_COLORS = ["bg-slate-200", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

export function PasswordStrength({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i <= score ? STRENGTH_COLORS[score] : "bg-slate-200"}`} />
        ))}
      </div>
      <span className="w-40 text-right text-xs text-slate-500">{label}</span>
    </div>
  );
}
