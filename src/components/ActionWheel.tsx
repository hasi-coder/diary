// A radial action menu in the style of The Sims: a ring of round buttons around where you clicked.
// Groups open into their own ring (no scrolling, a few choices at a time, "More" turns the page),
// and the middle shows what you're pointing at.
import { useMemo, useState } from "react";
import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface WheelNode {
  id: string;
  label: string;
  emoji: string;
  /** Shown in the middle while pointing at it. */
  hint?: string;
  /** Why it can't be chosen right now; it stays on the wheel, dimmed. */
  disabled?: string;
  /** Opens a ring of its own. */
  children?: WheelNode[];
  /** Runs when chosen (a leaf). The wheel closes afterwards. */
  onSelect?: () => void;
}

const PER_RING = 10;

export function ActionWheel(props: { at: { x: number; y: number }; title: string; subtitle?: string; face?: ReactNode; nodes: WheelNode[]; onClose: () => void }) {
  const [path, setPath] = useState<WheelNode[]>([]);
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState<WheelNode | null>(null);
  const level = path.length ? path[path.length - 1].children! : props.nodes;
  // Long rings keep a button for the next page instead of crowding.
  const paged = level.length > PER_RING;
  const perPage = paged ? PER_RING - 1 : PER_RING;
  const pages = Math.ceil(level.length / perPage);
  const shown: (WheelNode | "more")[] = useMemo(() => {
    const slice = level.slice(page * perPage, page * perPage + perPage);
    return paged ? [...slice, "more"] : slice;
  }, [level, page, paged, perPage]);

  // More buttons on a ring push it wider so the labels never touch.
  const RADIUS = shown.length > 8 ? 134 : 112;
  const size = (RADIUS + 52) * 2;
  const left = Math.max(8, Math.min(props.at.x - size / 2, window.innerWidth - size - 8));
  const top = Math.max(56, Math.min(props.at.y - size / 2, window.innerHeight - size - 8));

  const choose = (node: WheelNode) => {
    if (node.disabled) return;
    if (node.children?.length) {
      setPath([...path, node]);
      setPage(0);
      setHover(null);
    } else if (node.onSelect) {
      node.onSelect();
      props.onClose();
    }
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-40" onClick={props.onClose}>
      <div className="absolute" style={{ left, top, width: size, height: size }} onClick={(e) => e.stopPropagation()} role="menu" aria-label={props.title}>
        <div className="absolute inset-0 rounded-full bg-slate-900/55 backdrop-blur-[2px]" />
        {shown.map((node, i) => {
          const angle = (-90 + (360 * i) / shown.length) * (Math.PI / 180);
          const x = size / 2 + Math.cos(angle) * RADIUS;
          const y = size / 2 + Math.sin(angle) * RADIUS;
          const more = node === "more";
          const item: WheelNode = more ? { id: "more", label: `More ${page + 1}/${pages}`, emoji: "➕" } : node;
          return (
            <button
              key={item.id}
              role="menuitem"
              aria-label={item.label}
              aria-disabled={!!item.disabled}
              onMouseEnter={() => setHover(item)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(item)}
              onClick={() => (more ? setPage((page + 1) % pages) : choose(item))}
              className={`absolute flex w-[76px] -translate-x-1/2 -translate-y-[26px] flex-col items-center text-center ${item.disabled ? "opacity-40" : ""}`}
              style={{ left: x, top: y }}
            >
              <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 text-2xl shadow-lg transition-transform ${item.disabled ? "border-slate-500 bg-slate-700" : "border-white/80 bg-white hover:scale-110 hover:border-brand-400"} ${item.children ? "ring-2 ring-brand-400/70" : ""}`}>
                {item.emoji}
              </span>
              <span className="mt-1 max-w-[76px] truncate text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">{item.label}</span>
            </button>
          );
        })}
        <div className="absolute left-1/2 top-1/2 flex h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/20 bg-slate-900/90 p-2 text-center text-white shadow-xl">
          {hover ? (
            <>
              <div className="text-xl leading-none">{hover.emoji}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-tight">{hover.label}</div>
              <div className="line-clamp-2 text-[9px] leading-tight text-white/60">{hover.disabled ?? hover.hint ?? ""}</div>
            </>
          ) : path.length ? (
            <button onClick={() => (setPath(path.slice(0, -1)), setPage(0))} className="flex flex-col items-center gap-1 text-xs font-semibold hover:text-brand-300">
              <CaretLeftIcon size={18} weight="bold" />
              {path[path.length - 1].label}
            </button>
          ) : (
            <>
              {props.face}
              <div className="mt-0.5 max-w-[80px] truncate text-[11px] font-bold">{props.title}</div>
              {props.subtitle && <div className="max-w-[80px] truncate text-[9px] text-white/60">{props.subtitle}</div>}
            </>
          )}
        </div>
        <button onClick={props.onClose} aria-label="Close menu" className="absolute right-2 top-2 rounded-full bg-slate-900/80 p-1 text-white/70 hover:text-white">
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
