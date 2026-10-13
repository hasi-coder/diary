import { useState } from "react";
import { DotsThreeIcon, PencilSimpleIcon, ShoppingBagIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Item } from "../lib/api";
import { useJournal } from "../lib/journal";
import { colorOf, formatPrice, STATUS } from "../lib/format";
import { ItemForm } from "./forms";
import { MenuItem } from "./PostCard";
import { MediaPreview } from "./Media";
import { ProductViewer } from "./Products";
import { Avatar, ConfirmDialog } from "./ui";

export function ItemCard({ item, showShop }: { item: Item; showShop?: boolean }) {
  const { profiles, navigate, refresh } = useJournal();
  const shop = profiles.get(item.shopId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState(false);
  const status = STATUS[item.status];

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ${item.status === "sold" ? "opacity-70" : ""}`}>
      <div className={`relative flex h-40 items-center justify-center bg-gradient-to-br ${colorOf(shop).cover}`}>
        <button type="button" onClick={() => setViewing(true)} className="absolute inset-0 flex items-center justify-center" aria-label={`View ${item.name}`}>
          {item.media[0] ? <MediaPreview media={item.media[0]} /> : <ShoppingBagIcon size={40} weight="duotone" className="text-white/90" />}
        </button>
        {item.media.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white">{item.media.length} photos</span>
        )}
        <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${status.className}`}>{status.label}</span>
        <div className="absolute right-2 top-2">
          <button className="rounded-full bg-white/70 p-1 text-slate-600 hover:bg-white" onClick={() => setMenuOpen((o) => !o)} aria-label="Item options">
            <DotsThreeIcon size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-md">
                <MenuItem onClick={() => (setEditing(true), setMenuOpen(false))}>
                  <PencilSimpleIcon /> Edit
                </MenuItem>
                <MenuItem danger onClick={() => (setConfirming(true), setMenuOpen(false))}>
                  <TrashIcon /> Move to Trash
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-base font-bold text-slate-800">{formatPrice(item.priceCents, item.currency)}</div>
        <button type="button" onClick={() => setViewing(true)} className="text-left font-medium text-slate-700 hover:underline">
          {item.name}
        </button>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.description}</p>}
        {showShop && shop && (
          <button className="mt-auto flex items-center gap-2 pt-3 text-left text-xs text-slate-500 hover:text-slate-800" onClick={() => navigate({ view: "profile", id: shop.id, tab: "shop" })}>
            <Avatar profile={shop} size="sm" /> {shop.name}
          </button>
        )}
      </div>

      {editing && <ItemForm shopId={item.shopId} item={item} onClose={() => setEditing(false)} />}
      {viewing && <ProductViewer item={item} onClose={() => setViewing(false)} />}
      {confirming && (
        <ConfirmDialog
          title="Move to the Trash?"
          message={<>Remove <b>{item.name}</b> from {shop?.name ?? "this shop"}? You can restore it from the Trash.</>}
          confirmLabel="Move to Trash"
          onConfirm={async () => {
            await api.deleteItem(item.id);
            await refresh();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
