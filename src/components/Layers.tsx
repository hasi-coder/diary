// A layered album: photos of one subject (before and after, outside and inside)
// stacked in album order, with a horizontal slider to move through them. The
// slider stops at each layer and blends the two layers between stops, so a
// half-way position shows one "through" the other. Scrolling over the photo
// moves the slider too, and hands the scroll back to the page at either end.
// Each layer has its own tags: products (and people) pinned to a spot on it.
import { useEffect, useRef, useState } from "react";
import { ShoppingBagIcon, StackIcon, TagIcon, XIcon } from "@phosphor-icons/react";
import { api, errorMessage, mediaUrl, type MediaRef, type PhotoTag, type Post } from "../lib/api";
import { useJournal } from "../lib/journal";
import { TagChooser, Theater } from "./Media";
import { LookProducts, ProductCard } from "./Products";
import { ErrorText } from "./ui";

/** Scroll distance (px) that moves one layer. */
const WHEEL_PER_LAYER = 240;
/** Stops get their caption under the slider up to this many layers; past that only the current one is named. */
const MAX_LABELLED_STOPS = 6;
/** How close to a stop (in layers) the slider must be for that layer's tags to show. */
const TAGS_NEAR = 0.25;

export const layerName = (m: MediaRef, i: number) => m.caption.trim() || `Layer ${i + 1}`;

export function LayerViewer(props: {
  post: Post;
  className?: string;
  /** List the current layer's products under the slider (the album page). */
  withProducts?: boolean;
}) {
  const { post, className = "max-h-[28rem]", withProducts } = props;
  const { snapshot, profiles, refresh } = useJournal();
  const [tagOverrides, setTagOverrides] = useState<Record<string, PhotoTag[]>>({});
  const layers = post.media.filter((m) => m.kind === "image").map((m) => (tagOverrides[m.id] ? { ...m, tags: tagOverrides[m.id] } : m));
  const last = Math.max(layers.length - 1, 0);
  const [pos, setPos] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [tagging, setTagging] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const tween = useRef(0);
  const posRef = useRef(pos);
  posRef.current = pos;

  const clamp = (p: number) => Math.min(Math.max(p, 0), last);
  const stop = () => cancelAnimationFrame(tween.current);
  const moved = () => (setPending(null), setOpenProduct(null));
  const set = (p: number) => (stop(), moved(), setPos(clamp(p)));
  /** Eases to `to` (a stop, usually). */
  const glide = (to: number) => {
    stop();
    moved();
    const from = posRef.current;
    const target = clamp(to);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / 260, 1);
      setPos(from + (target - from) * (1 - (1 - t) ** 3));
      if (t < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  };
  useEffect(() => stop, []);
  // A fresh copy of the post (tags edited in the photo viewer, say) replaces local edits.
  useEffect(() => setTagOverrides({}), [post]);

  // The stage's size, to fit each layer in it (they may differ in shape) and pin tags on the picture.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wheel and trackpad scrolling move through the layers. React's onWheel is
  // passive, so listen directly to be able to keep the page from scrolling.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (pending) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const p = posRef.current;
      // At the first or last layer, let the page scroll on.
      if ((delta < 0 && p <= 0) || (delta > 0 && p >= last)) return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? delta * 16 : e.deltaMode === 2 ? delta * el.clientHeight : delta;
      set(p + px / WHEEL_PER_LAYER);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  if (layers.length === 0) return null;
  const lo = Math.floor(pos);
  const frac = pos - lo;
  const current = Math.round(pos);
  const layer = layers[current];
  const showTags = Math.abs(pos - current) < TAGS_NEAR;
  const products = layer.tags.filter((t) => t.itemId);
  const labelled = layers.length <= MAX_LABELLED_STOPS;
  const pct = (i: number) => (last === 0 ? 0 : (i / last) * 100);
  const product = openProduct ? snapshot.items.find((i) => i.id === openProduct) : undefined;

  /** Where a layer is drawn in the stage (percent), fitted like object-contain. */
  const fit = (m: MediaRef) => {
    const a = aspects[m.id];
    if (!a || !box.w || !box.h) return { left: "0%", top: "0%", width: "100%", height: "100%" };
    const wide = a > box.w / box.h;
    const width = wide ? 100 : ((box.h * a) / box.w) * 100;
    const height = wide ? ((box.w / a) / box.h) * 100 : 100;
    return { left: `${(100 - width) / 2}%`, top: `${(100 - height) / 2}%`, width: `${width}%`, height: `${height}%` };
  };

  const saveTags = async (media: MediaRef, next: PhotoTag[]) => {
    setError(null);
    try {
      const saved = await api.setPhotoTags(post.id, media.id, next);
      setTagOverrides((o) => ({ ...o, [media.id]: saved.media.find((m) => m.id === media.id)?.tags ?? next }));
      void refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return posRef.current;
    return ((clientX - r.left) / r.width) * last;
  };

  const startTagging = () => {
    setTagging((t) => !t);
    setPending(null);
    setOpenProduct(null);
    // Tags go on one layer: settle on the nearest.
    if (Math.abs(pos - current) > 1e-3) glide(current);
  };

  return (
    <div className="mt-4">
      <div
        ref={stage}
        className={`relative mx-auto w-full overflow-hidden rounded-xl bg-slate-900 ${className}`}
        style={{ aspectRatio: aspects[layers[0].id] ?? 4 / 3 }}
      >
        {layers.map((m, i) => (
          <div
            key={m.id}
            className="absolute"
            // The layer at or below the slider shows fully; the next one fades in over it.
            style={{ ...fit(m), opacity: i === lo ? 1 : i === lo + 1 ? frac : 0 }}
          >
            <img
              src={mediaUrl(m.id)}
              alt={layerName(m, i)}
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (h) setAspects((a) => ({ ...a, [m.id]: w / h }));
              }}
              className="h-full w-full select-none"
            />
          </div>
        ))}

        {/* Clicks open the photo, or pin a tag while tagging. */}
        <button
          type="button"
          onClick={(e) => {
            if (!tagging) return setOpen(current);
            const r = e.currentTarget.getBoundingClientRect();
            const f = fit(layer);
            const x = ((e.clientX - r.left) / r.width - parseFloat(f.left) / 100) / (parseFloat(f.width) / 100);
            const y = ((e.clientY - r.top) / r.height - parseFloat(f.top) / 100) / (parseFloat(f.height) / 100);
            if (x < 0 || x > 1 || y < 0 || y > 1) return;
            setOpenProduct(null);
            setPending({ x, y });
          }}
          className={`absolute inset-0 ${tagging ? "cursor-crosshair" : "cursor-zoom-in"}`}
          aria-label={tagging ? `Tag a spot on ${layerName(layer, current)}` : `Open ${layerName(layer, current)}`}
        />

        {/* The current layer's tags, over its picture. */}
        <div className={`pointer-events-none absolute transition-opacity ${showTags ? "opacity-100" : "opacity-0"}`} style={fit(layer)}>
          {showTags &&
            layer.tags.map((t) => {
              const name = t.itemId ? snapshot.items.find((i) => i.id === t.itemId)?.name : profiles.get(t.profileId ?? "")?.name;
              if (!name) return null;
              const key = t.itemId ?? t.profileId!;
              return (
                <div key={key} className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}>
                  {t.itemId ? (
                    <button
                      type="button"
                      onClick={() => (setPending(null), setOpenProduct(openProduct === t.itemId ? null : t.itemId!))}
                      title={name}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg ring-2 ring-brand-500 hover:scale-110"
                    >
                      <ShoppingBagIcon size={14} weight="fill" />
                    </button>
                  ) : (
                    <span className="block rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 shadow">{name}</span>
                  )}
                  {tagging && (
                    <button
                      type="button"
                      onClick={() => void saveTags(layer, layer.tags.filter((x) => x !== t))}
                      className="absolute -right-2 -top-2 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                      aria-label={`Remove tag ${name}`}
                    >
                      <XIcon size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          {pending && <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow-lg" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }} />}
        </div>

        <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          <StackIcon size={14} weight="fill" />
          {current + 1}/{layers.length} · {layerName(layer, current)}
        </span>
        <button
          type="button"
          onClick={startTagging}
          className={`absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-sm ${
            tagging ? "bg-white text-slate-900" : "bg-black/60 text-white hover:bg-black/75"
          }`}
        >
          <TagIcon size={14} /> {tagging ? "Done tagging" : "Tag products"}
        </button>
        {tagging && !pending && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            Click on {layerName(layer, current)} to tag a product
          </span>
        )}
        {pending && (
          <TagChooser
            tab="products"
            className="absolute left-1/2 top-12 -translate-x-1/2"
            exclude={layer.tags.map((t) => t.itemId ?? t.profileId ?? "")}
            onPick={(who) => {
              void saveTags(layer, [...layer.tags, { ...who, x: pending.x, y: pending.y }]);
              setPending(null);
            }}
            onCancel={() => setPending(null)}
          />
        )}
        {product && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-white p-3 shadow-2xl">
            <ProductCard item={product} row />
          </div>
        )}
      </div>
      {error && <ErrorText>{error}</ErrorText>}

      {layers.length > 1 && (
        <div className={`px-3 pt-4 ${labelled ? "pb-7" : "pb-2"}`}>
          <div
            ref={track}
            role="slider"
            tabIndex={0}
            aria-label="Layer"
            aria-valuemin={1}
            aria-valuemax={layers.length}
            aria-valuenow={current + 1}
            aria-valuetext={layerName(layer, current)}
            className="relative h-6 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              set(fromPointer(e.clientX));
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && set(fromPointer(e.clientX))}
            // Let go close to a stop (or while tagging, anywhere): settle on it.
            onPointerUp={() => (tagging || Math.abs(posRef.current - Math.round(posRef.current)) < 0.12) && glide(Math.round(posRef.current))}
            onKeyDown={(e) => {
              const to =
                e.key === "ArrowRight" || e.key === "ArrowUp"
                  ? Math.floor(pos + 1e-6) + 1
                  : e.key === "ArrowLeft" || e.key === "ArrowDown"
                    ? Math.ceil(pos - 1e-6) - 1
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? last
                        : null;
              if (to === null) return;
              e.preventDefault();
              glide(to);
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
            <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-500" style={{ width: `${pct(pos)}%` }} />
            {layers.map((m, i) => (
              <button
                key={m.id}
                type="button"
                tabIndex={-1}
                title={`${layerName(m, i)}${m.tags.some((t) => t.itemId) ? ` · ${m.tags.filter((t) => t.itemId).length} tagged` : ""}`}
                onPointerDown={(e) => (e.stopPropagation(), glide(i))}
                className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${i <= pos ? "bg-brand-500" : "bg-slate-300"}`}
                style={{ left: `${pct(i)}%` }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-500 bg-white shadow-md"
              style={{ left: `${pct(pos)}%` }}
            />
            {labelled &&
              layers.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => (e.stopPropagation(), glide(i))}
                  className={`absolute top-full mt-1.5 flex max-w-[8rem] items-center gap-1 text-xs ${i === current ? "font-semibold text-slate-800" : "text-slate-500 hover:text-slate-700"} ${
                    i === 0 ? "" : i === last ? "-translate-x-full" : "-translate-x-1/2"
                  }`}
                  style={{ left: `${pct(i)}%` }}
                >
                  <span className="truncate">{layerName(m, i)}</span>
                  {m.tags.some((t) => t.itemId) && <ShoppingBagIcon size={11} weight="fill" className="shrink-0 text-brand-500" />}
                </button>
              ))}
          </div>
        </div>
      )}

      {withProducts && (
        <section aria-label="In this layer" className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            In {layerName(layer, current)} · {products.length} product{products.length === 1 ? "" : "s"}
          </h3>
          <LookProducts tags={products} empty="No products tagged on this layer. Use “Tag products” on the photo." />
        </section>
      )}

      {open !== null && <Theater items={layers.map((m) => ({ media: m, post }))} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
