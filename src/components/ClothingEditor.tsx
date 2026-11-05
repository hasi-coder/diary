import { useState } from "react";
import { TShirtIcon } from "@phosphor-icons/react";
import type { Profile } from "../lib/api";
import type { Character } from "../lib/places/character";
import { CLOTHING_LAYERS, garment, outfitOf, type ClothingLayer } from "../lib/places/garments";
import { DressingRoom } from "./DressingRoom";

export function ClothingEditor({ profile, look, onChange }: { profile: Profile; look: Character; onChange: (patch: Partial<Character>) => void }) {
  const [openLayer, setOpenLayer] = useState<ClothingLayer | null>(null);
  const worn = outfitOf(look);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-800">Clothes</h3><p className="text-xs text-slate-500">{worn.length} pieces · Mix, colour and fit each layer</p></div><button type="button" onClick={() => setOpenLayer("base")} className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><TShirtIcon size={18} /> Change clothes</button></div>
      <div className="flex flex-wrap gap-1.5">{(Object.entries(CLOTHING_LAYERS) as [ClothingLayer, { label: string }][]).map(([id, info]) => {
        const count = worn.filter((item) => garment(item.garment)?.layer === id).length;
        return <button type="button" key={id} aria-label={`Edit ${info.label}`} onClick={() => setOpenLayer(id)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700">{info.label}{count ? ` · ${count}` : ""}</button>;
      })}</div>
      {openLayer && <DressingRoom profile={profile} look={look} initialLayer={openLayer} onApply={onChange} onClose={() => setOpenLayer(null)} />}
    </div>
  );
}
