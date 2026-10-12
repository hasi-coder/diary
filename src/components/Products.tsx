// Products (shop items) as you see them in a look: a small gallery you can flip
// through in place, the price and the shop. Used beside a photo ("side by side"),
// over it (a popover on its tag), in an album's lookbook, and in the shop.
import { useState } from "react";
import { ShoppingBagIcon, StorefrontIcon } from "@phosphor-icons/react";
import { mediaUrl, type Item, type MediaRef, type PhotoTag } from "../lib/api";
import { useJournal } from "../lib/journal";
import { formatPrice, STATUS } from "../lib/format";
import { MediaPreview } from "./Media";
import { Modal } from "./ui";

/** The main photo with its thumbnails underneath; picking a thumbnail swaps it in place. */
export function ProductGallery({ item, large }: { item: Item; large?: boolean }) {
  const [index, setIndex] = useState(0);
  const current: MediaRef | undefined = item.media[Math.min(index, item.media.length - 1)];
  return (
    <div>
      <div className={`overflow-hidden rounded-xl bg-slate-100 ${large ? "aspect-[4/5]" : "aspect-square"}`}>
        {!current ? (
          <div className="flex h-full items-center justify-center text-slate-300">
            <ShoppingBagIcon size={large ? 64 : 36} weight="duotone" />
          </div>
        ) : current.kind === "video" ? (
          <video key={current.id} src={mediaUrl(current.id)} controls playsInline className="h-full w-full object-cover" />
        ) : (
          <img key={current.id} src={mediaUrl(current.id)} alt={item.name} className="h-full w-full object-cover" />
        )}
      </div>
      {item.media.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={(e) => (e.stopPropagation(), setIndex(i))}
              aria-label={`Photo ${i + 1} of ${item.name}`}
              className={`${large ? "h-14 w-14" : "h-8 w-8"} shrink-0 overflow-hidden rounded-md ring-2 ${i === index ? "ring-brand-500" : "ring-transparent opacity-70 hover:opacity-100"}`}
            >
              <MediaPreview media={m} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gallery, price, name and shop. `row` lays it out sideways for narrow lists. */
export function ProductCard({ item, row, onOpenShop }: { item: Item; row?: boolean; onOpenShop?: () => void }) {
  const { profiles, navigate } = useJournal();
  const shop = profiles.get(item.shopId);
  const status = STATUS[item.status];
  const details = (
    <div className="min-w-0">
      <div className="text-sm font-bold text-slate-800">{formatPrice(item.priceCents, item.currency)}</div>
      <div className="text-sm font-medium text-slate-700">{item.name}</div>
      {item.description && <p className="mt-0.5 line-clamp-3 text-xs text-slate-500">{item.description}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${status.className}`}>{status.label}</span>
        {shop && (
          <button
            type="button"
            onClick={() => (onOpenShop?.(), navigate({ view: "profile", id: shop.id, tab: "shop" }))}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 hover:underline"
          >
            <StorefrontIcon /> {shop.name}
          </button>
        )}
      </div>
    </div>
  );
  return row ? (
    <div className="grid grid-cols-[7rem_1fr] gap-3">
      <ProductGallery item={item} />
      {details}
    </div>
  ) : (
    <div className="space-y-2">
      <ProductGallery item={item} />
      {details}
    </div>
  );
}

/** The products tagged on a photo, as cards: the "dressing room" side of a look. */
export function LookProducts({ tags, onOpenShop, empty }: { tags: PhotoTag[]; onOpenShop?: () => void; empty?: string }) {
  const { snapshot } = useJournal();
  const items = tags.flatMap((t) => snapshot.items.filter((i) => i.id === t.itemId));
  if (items.length === 0) return empty ? <p className="text-sm text-slate-400">{empty}</p> : null;
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id}>
          <ProductCard item={item} row onOpenShop={onOpenShop} />
        </li>
      ))}
    </ul>
  );
}

/** A product on its own: big gallery beside its details. */
export function ProductViewer({ item, onClose }: { item: Item; onClose: () => void }) {
  return (
    <Modal title={item.name} onClose={onClose} huge>
      <div className="grid gap-6 md:grid-cols-[minmax(0,28rem)_1fr]">
        <ProductGallery item={item} large />
        <ProductCard item={{ ...item, media: [] }} onOpenShop={onClose} />
      </div>
    </Modal>
  );
}

/** A photo with its product (and people) tags as dots; a product dot opens its card over the photo. */
export function TaggedPhoto({ media, onOpen }: { media: MediaRef; onOpen?: () => void }) {
  const { snapshot, profiles } = useJournal();
  const [open, setOpen] = useState<string | null>(null);
  const item = open ? snapshot.items.find((i) => i.id === open) : undefined;
  return (
    // The wrapper hugs the image, so tag positions (0..1) land on the picture even when it's height-capped.
    <div className="relative mx-auto w-fit overflow-hidden rounded-xl bg-slate-100">
      <button type="button" onClick={onOpen} className="block" aria-label="Open photo">
        <img src={mediaUrl(media.id)} alt={media.caption || media.name} className="block max-h-[70vh] w-auto max-w-full" />
      </button>
      {media.tags.map((t) => {
        const name = t.itemId ? snapshot.items.find((i) => i.id === t.itemId)?.name : profiles.get(t.profileId ?? "")?.name;
        if (!name) return null;
        return t.itemId ? (
          <button
            key={t.itemId}
            type="button"
            onClick={() => setOpen(open === t.itemId ? null : t.itemId!)}
            title={name}
            className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-lg ring-2 ring-brand-500 hover:scale-110"
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
          >
            <ShoppingBagIcon size={14} weight="fill" />
          </button>
        ) : (
          <span
            key={t.profileId}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 shadow"
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
          >
            {name}
          </span>
        );
      })}
      {item && (
        <div className="absolute inset-x-3 bottom-3 rounded-xl bg-white p-3 shadow-2xl">
          <ProductCard item={item} row />
        </div>
      )}
    </div>
  );
}
