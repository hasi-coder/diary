import { useState } from "react";
import { MagnifyingGlassIcon, ShoppingBagIcon } from "@phosphor-icons/react";
import { useJournal } from "../lib/journal";
import { ItemCard } from "../components/ItemCard";
import { Page } from "../components/Shell";
import { EmptyState } from "../components/ui";

export function MarketplaceView() {
  const { snapshot, profiles } = useJournal();
  const [showSold, setShowSold] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const items = snapshot.items.filter(
    (i) =>
      (showSold || i.status !== "sold") &&
      (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || profiles.get(i.shopId)?.name.toLowerCase().includes(q)),
  );

  return (
    <Page
      wide
      title={
        <>
          <ShoppingBagIcon className="text-brand-500" /> Marketplace
        </>
      }
      actions={
        <div className="relative hidden sm:block">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or shops"
            className="w-56 rounded-full bg-slate-100 py-1.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/30 focus:outline-none"
          />
        </div>
      }
    >
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-slate-500">Everything listed by shops and pages in this workspace.</p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Show sold
        </label>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBagIcon />} title="No items">
          {snapshot.items.length === 0
            ? "Create a Shop profile (or a Page with selling turned on) and list items from its Shop tab."
            : "Nothing matches. Try showing sold items or a different search."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} showShop />
          ))}
        </div>
      )}
    </Page>
  );
}
