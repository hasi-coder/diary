import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, CheckIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import { OUTFIT_COLORS, type Character } from "../lib/places/character";
import { CLOTHING_LAYERS, CLOTHING_STYLES, garment, garmentsFor, legacyFields, outfitOf, SLOTS, withSlot, type ClothingLayer, type ClothingStyle, type Garment, type Worn } from "../lib/places/garments";
import { CLOTHING_FIT_LIMITS, withClothingFit } from "../lib/places/clothingFit";
import { applyOutfit, OUTFITS } from "../lib/places/outfits";
import type { Facing } from "../lib/places/layout";
import { CharacterPreview } from "./world/CharacterPreview";
import { GarmentIcon } from "./GarmentIcon";

const VIEWS: { facing: Facing; label: string }[] = [{ facing: "SE", label: "Front" }, { facing: "E", label: "Front left" }, { facing: "NE", label: "Left" }, { facing: "N", label: "Back left" }, { facing: "NW", label: "Back" }, { facing: "W", label: "Back right" }, { facing: "SW", label: "Right" }, { facing: "S", label: "Front right" }];
const DRAG_TYPE = "application/x-my-diary-garment";
const LAYER_ICONS: Record<ClothingLayer, string> = { underwear: "🧺", base: "👕", mid: "🧶", outer: "🧥", footwear: "👟", accessories: "🎀" };

interface History { past: Character[]; current: Character; future: Character[] }
type Action = { type: "change"; wearing: Worn[] } | { type: "undo" } | { type: "redo" } | { type: "reset" };

function defaultColor(definition: Garment) {
  if (definition.slot === "feet") return "#292524";
  if (definition.slot === "socks" || definition.recipe?.detail === "uniform") return "#f8fafc";
  return { underwear: "#c4b5fd", base: "#38bdf8", mid: "#f0abfc", outer: "#881337", footwear: "#f8fafc", accessories: "#fbbf24" }[definition.layer];
}

export function DressingRoom({ profile, look, initialLayer, onApply, onClose }: { profile: Profile; look: Character; initialLayer: ClothingLayer; onApply: (patch: Partial<Character>) => void; onClose: () => void }) {
  const initial = useRef({ ...look, wearing: outfitOf(look) });
  const [history, dispatch] = useReducer((state: History, action: Action): History => {
    if (action.type === "undo") return state.past.length ? { past: state.past.slice(0, -1), current: state.past[state.past.length - 1], future: [state.current, ...state.future] } : state;
    if (action.type === "redo") return state.future.length ? { past: [...state.past, state.current], current: state.future[0], future: state.future.slice(1) } : state;
    const wearing = action.type === "reset" ? initial.current.wearing : action.wearing;
    const current = { ...state.current, wearing: outfitOf({ ...state.current, wearing }), ...legacyFields(wearing) };
    return JSON.stringify(current.wearing) === JSON.stringify(state.current.wearing) ? state : { past: [...state.past.slice(-59), state.current], current, future: [] };
  }, { past: [], current: initial.current, future: [] });
  const draft = history.current;
  const worn = outfitOf(draft);
  const [layer, setLayer] = useState(initialLayer);
  const [style, setStyle] = useState<ClothingStyle | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [spin, setSpin] = useState(false);
  const [framing, setFraming] = useState<"full" | "upper" | "lower">("full");
  const [inspect, setInspect] = useState(false);
  const [keepUnderwear, setKeepUnderwear] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const adjustments = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; view: number } | null>(null);
  const inLayer = worn.filter((item) => garment(item.garment)?.layer === layer);
  const selected = inLayer.find((item) => item.garment === selectedId) ?? inLayer.find((item) => garment(item.garment)?.slot === "top") ?? inLayer[0];
  const definition = selected && garment(selected.garment);
  const choices = garmentsFor(layer, style).filter((g) => `${g.label} ${g.category} ${SLOTS[g.slot].label}`.toLowerCase().includes(query.toLowerCase()));
  const preview = inspect ? { ...draft, wearing: outfitOf({ ...draft, wearing: worn.filter((item) => { const g = garment(item.garment)!; return g.layer === layer || g.layer === "underwear"; }) }) } : draft;
  const change = (wearing: Worn[]) => dispatch({ type: "change", wearing });
  const chooseLayer = (next: ClothingLayer) => { setLayer(next); setSelectedId(""); setQuery(""); };
  const tryOn = (id: string) => {
    const next = garment(id);
    if (!next) return;
    const current = worn.find((item) => item.garment === id);
    // Clicking a piece that is already on takes it off.
    if (current) { change(withSlot(worn, next.slot, null)); if (selectedId === id) setSelectedId(""); return; }
    change(withSlot(worn, next.slot, { garment: id, color: defaultColor(next) }));
    if (next.layer !== layer) chooseLayer(next.layer);
    setSelectedId(id);
  };

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter((element) => element.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey, true); previous?.focus(); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dressing-room-title" className="flex h-[94dvh] max-h-[920px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
          <div><h2 id="dressing-room-title" className="text-xl font-bold text-slate-800">Dressing room</h2><p className="text-xs text-slate-500">{profile.name} · Try on clothes, layer by layer</p></div>
          <button ref={closeButton} type="button" aria-label="Close dressing room" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><XIcon size={20} /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(220px,34vh)_minmax(0,1fr)] md:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] md:grid-rows-1">
          <section aria-label="Outfit preview" className="relative flex min-h-0 flex-col border-b border-slate-100 bg-gradient-to-b from-indigo-50 via-slate-50 to-rose-50 md:border-b-0 md:border-r">
            <div className="absolute left-3 top-3 z-10 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-slate-600">{inspect ? `${CLOTHING_LAYERS[layer].label} view` : "Complete outfit"}</div>
            <div role="group" aria-label="Character turntable" className={`relative min-h-0 flex-1 cursor-grab touch-none ${dragOver ? "ring-4 ring-inset ring-brand-400" : ""}`} onPointerDown={(e) => { if (e.button !== 0) return; drag.current = { x: e.clientX, view }; e.currentTarget.setPointerCapture(e.pointerId); setSpin(false); }} onPointerMove={(e) => { if (drag.current) setView(((drag.current.view + Math.round((drag.current.x - e.clientX) / 42)) % 8 + 8) % 8); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setDragOver(true); } }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); tryOn(e.dataTransfer.getData(DRAG_TYPE)); }}>
              <CharacterPreview profile={profile} look={preview} autoRotate={spin} view={VIEWS[view].facing} zoom={zoom} framing={framing} fitting className="absolute inset-0" />
              {dragOver && <span className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-brand-600 py-2 text-center text-sm font-bold text-white">Drop to try on</span>}
            </div>
            <div className="z-10 shrink-0 space-y-2 border-t border-white/70 bg-white/75 p-3">
              <div className="flex items-center justify-center gap-2">
                <button type="button" aria-label="Turn left" onClick={() => { setSpin(false); setView((v) => (v + 1) % 8); }} className="rounded-lg bg-white p-2 shadow-sm"><ArrowCounterClockwiseIcon size={18} /></button>
                <button type="button" onClick={() => { setSpin(false); setView(0); }} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm">Front</button>
                <button type="button" onClick={() => { setSpin(false); setView(4); }} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow-sm">Back</button>
                <button type="button" aria-label="Turn right" onClick={() => { setSpin(false); setView((v) => (v + 7) % 8); }} className="rounded-lg bg-white p-2 shadow-sm"><ArrowClockwiseIcon size={18} /></button>
                <button type="button" aria-pressed={spin} onClick={() => setSpin((v) => !v)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${spin ? "bg-brand-600 text-white" : "bg-white shadow-sm"}`}>Spin</button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600"><span>{VIEWS[view].label}</span><input aria-label="Preview zoom" type="range" min="0.8" max="1.8" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="min-w-0 flex-1 accent-brand-600" /><select aria-label="Preview framing" value={framing} onChange={(e) => setFraming(e.target.value as typeof framing)} className="rounded-md border border-slate-200 bg-white px-1 py-1"><option value="full">Full body</option><option value="upper">Upper body</option><option value="lower">Lower body</option></select></div>
              <label className="flex items-center justify-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={inspect} onChange={(e) => setInspect(e.target.checked)} /> Inspect this layer</label>
            </div>
          </section>
          <section className="flex min-h-0 flex-col overflow-y-auto">
            <div className="sticky top-0 z-10 shrink-0 space-y-3 border-b border-slate-100 bg-white p-3 sm:p-4">
              <div role="tablist" aria-label="Clothing layers" className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {(Object.entries(CLOTHING_LAYERS) as [ClothingLayer, { label: string }][]).map(([id, info]) => <button type="button" key={id} role="tab" aria-label={info.label} aria-selected={layer === id} onClick={() => chooseLayer(id)} className={`rounded-xl px-1 py-2 text-[11px] font-semibold ${layer === id ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}><span aria-hidden className="mb-0.5 block text-lg">{LAYER_ICONS[id]}</span>{info.label}</button>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-32 flex-1"><MagnifyingGlassIcon className="absolute left-2.5 top-2.5 text-slate-400" size={16} /><input aria-label="Search clothes" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a piece…" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2 text-sm" /></label>
                <select aria-label="Clothing style collection" value={style} onChange={(e) => setStyle(e.target.value as ClothingStyle | "all")} className="rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value="all">All styles</option>{Object.entries(CLOTHING_STYLES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              </div>
              <div className="flex flex-wrap items-center gap-2"><select aria-label="Outfit preset" defaultValue="" onChange={(e) => { const preset = OUTFITS.find((outfit) => outfit.id === e.target.value); if (preset) { change(applyOutfit(preset, keepUnderwear ? worn : undefined).wearing); setSelectedId(""); } e.target.value = ""; }} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"><option value="">Try a complete outfit…</option>{OUTFITS.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.label}</option>)}</select><label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={keepUnderwear} onChange={(e) => setKeepUnderwear(e.target.checked)} /> Keep underwear</label></div>
            </div>
            <div className="space-y-4 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-slate-800">{CLOTHING_LAYERS[layer].label}</h3><p className="text-xs text-slate-500">Click a piece or drag it onto your character.</p></div><div className="flex shrink-0 flex-col items-end gap-1">{selected && <button type="button" onClick={() => adjustments.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })} className="text-xs font-semibold text-brand-700">Adjust fit</button>}<button type="button" onClick={() => change(worn.filter((item) => garment(item.garment)?.layer !== layer))} className="text-xs font-semibold text-slate-500 hover:text-rose-600">Clear layer</button></div></div>
              <div className="flex flex-wrap gap-1.5" aria-label="Wearing in this layer">{inLayer.map((item) => <button type="button" key={item.garment} onClick={() => setSelectedId(item.garment)} className={`rounded-full border px-2 py-1 text-[11px] font-medium ${selected?.garment === item.garment ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>{garment(item.garment)?.label}<span role="button" aria-label={`Remove ${garment(item.garment)?.label}`} onClick={(e) => { e.stopPropagation(); change(withSlot(worn, garment(item.garment)!.slot, null)); }} className="ml-1.5 text-slate-400 hover:text-rose-600">×</span></button>)}{!inLayer.length && <span className="text-[11px] text-slate-400">Nothing worn in this layer</span>}</div>
              <div role="tabpanel" aria-label={CLOTHING_LAYERS[layer].label} className="grid max-h-[380px] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
                {choices.map((g) => {
                  const active = worn.find((item) => item.garment === g.id);
                  return <button type="button" key={g.id} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, g.id); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => tryOn(g.id)} aria-label={active ? `Take off ${g.label}` : `Try on ${g.label}`} aria-pressed={!!active} className={`group relative flex min-h-40 flex-col items-center rounded-xl border-2 p-2.5 text-center transition-colors ${active ? "border-brand-400 bg-brand-50" : "border-slate-100 bg-slate-50 hover:border-brand-200 hover:bg-white"}`}>
                    {active && <span className="absolute right-1.5 top-1.5 rounded-full bg-brand-600 p-0.5 text-white"><CheckIcon size={12} weight="bold" /></span>}
                    <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-gradient-to-b from-white/70 to-white/10"><GarmentIcon definition={g} color={active?.color ?? defaultColor(g)} className="h-24 w-24 max-w-full transition-transform duration-200 group-hover:scale-105" /></div>
                    <span className="text-xs font-semibold text-slate-700">{g.label}</span><span className="text-[10px] text-slate-400">{SLOTS[g.slot].label}</span>
                  </button>;
                })}
              </div>
              {!choices.length && <p className="py-6 text-center text-sm text-slate-500">No clothes match your search.</p>}
              {selected && definition && <div ref={adjustments} className="scroll-mt-48 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3" aria-label="Piece adjustments">
                <div className="flex items-start justify-between gap-2"><div><h4 className="text-sm font-bold text-slate-800">{definition.label}</h4><p className="text-[11px] text-slate-500">Colour &amp; fit</p></div><button type="button" aria-label={`Remove ${definition.label}`} onClick={() => change(withSlot(worn, definition.slot, null))} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-rose-600"><XIcon size={16} /></button></div>
                <div className="flex flex-wrap items-center gap-1.5">{OUTFIT_COLORS.map((color) => <button type="button" key={color} aria-label={`Piece colour ${color}`} onClick={() => change(worn.map((item) => item.garment === selected.garment ? { ...item, color } : item))} className={`h-6 w-6 rounded-full border-2 ${selected.color === color ? "border-slate-700" : "border-white"}`} style={{ background: color }} />)}<input aria-label="Piece custom colour" type="color" value={selected.color} onChange={(e) => change(worn.map((item) => item.garment === selected.garment ? { ...item, color: e.target.value } : item))} className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0" /></div>
                <label className="block text-xs text-slate-600"><span className="mb-1 flex justify-between"><span>Loosen fit</span><span>{Math.round((selected.fit?.ease ?? 0) * 1000)} mm</span></span><input aria-label="Piece fit ease" type="range" {...CLOTHING_FIT_LIMITS.ease} value={selected.fit?.ease ?? 0} onChange={(e) => change(withClothingFit(worn, selected.garment, { ...selected.fit, ease: Number(e.target.value) }))} className="w-full accent-brand-600" /></label>
                {definition.recipe?.kind !== "accessory" && (definition.slot !== "feet" || (definition.recipe?.length ?? 0) > 0) && <label className="block text-xs text-slate-600"><span className="mb-1 flex justify-between"><span>Hem &amp; sleeve length</span><span>{Math.round((selected.fit?.length ?? 1) * 100)}%</span></span><input aria-label="Piece fit length" type="range" {...CLOTHING_FIT_LIMITS.length} value={selected.fit?.length ?? 1} onChange={(e) => change(withClothingFit(worn, selected.garment, { ...selected.fit, length: Number(e.target.value) }))} className="w-full accent-brand-600" /></label>}
                <button type="button" onClick={() => change(withClothingFit(worn, selected.garment, null))} className="text-xs font-semibold text-brand-700 hover:underline">Reset this piece’s fit</button>
              </div>}
            </div>
          </section>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2"><button type="button" disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-35">Undo</button><button type="button" disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-35">Redo</button><button type="button" onClick={() => dispatch({ type: "reset" })} className="px-2 py-2 text-xs font-semibold text-slate-500">Start over</button></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => { onApply({ wearing: worn, ...legacyFields(worn) }); onClose(); }} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">Apply outfit</button></div>
        </footer>
      </div>
    </div>, document.body,
  );
}
