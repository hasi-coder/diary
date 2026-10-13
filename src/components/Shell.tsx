// App chrome, laid out like Facebook: a top bar with the main destinations in
// the middle, a left menu (on list views), and the per-view page layout.
import type { ReactNode } from "react";
import {
  BookOpenIcon,
  BooksIcon,
  GearIcon,
  HouseIcon,
  ImagesIcon,
  MagnifyingGlassIcon,
  LockIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  TrashIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useJournal, type Route } from "../lib/journal";
import { SyncButton } from "./SyncParts";
import { Avatar } from "./ui";

const DESTINATIONS: { icon: Icon; label: string; view: Route["view"]; color: string }[] = [
  { icon: HouseIcon, label: "Home", view: "timeline", color: "text-brand-500" },
  { icon: UsersThreeIcon, label: "Profiles", view: "profiles", color: "text-sky-500" },
  { icon: ImagesIcon, label: "Media", view: "gallery", color: "text-emerald-500" },
  { icon: BooksIcon, label: "Series", view: "series", color: "text-violet-500" },
  { icon: StorefrontIcon, label: "Marketplace", view: "marketplace", color: "text-brand-500" },
];

/** Facebook's top bar: logo and search, destinations, account actions. */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { snapshot, owner, route, navigate, lock } = useJournal();
  return (
    <header className="relative z-20 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-white px-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={() => navigate({ view: "timeline" })}
          title={snapshot.workspace.name}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
        >
          <BookOpenIcon size={22} weight="fill" />
        </button>
        <button
          onClick={onSearch}
          className="flex h-10 min-w-0 items-center gap-2 rounded-full bg-slate-50 px-3 text-left text-[15px] text-slate-500 hover:bg-slate-100 xl:w-60"
        >
          <MagnifyingGlassIcon size={16} className="shrink-0" />
          <span className="hidden truncate xl:inline">Search My Diary</span>
        </button>
      </div>

      <nav className="flex h-14 items-stretch">
        {DESTINATIONS.map(({ icon: Icon, label, view }) => {
          const active = route.view === view;
          return (
            <button
              key={view}
              title={label}
              onClick={() => navigate({ view } as Route)}
              className={`relative flex w-16 items-center justify-center md:w-24 lg:w-28 ${active ? "text-brand-600" : "text-slate-500"}`}
            >
              <span className={`flex h-12 w-full items-center justify-center rounded-lg ${active ? "" : "hover:bg-slate-50"}`}>
                <Icon size={26} weight={active ? "fill" : "regular"} />
              </span>
              {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-brand-600" />}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center justify-end gap-2">
        <SyncButton round />
        <RoundButton title="Trash" active={route.view === "trash"} onClick={() => navigate({ view: "trash" })} badge={snapshot.trashCount}>
          <TrashIcon size={20} weight="fill" />
        </RoundButton>
        <RoundButton
          title="Settings"
          active={route.view === "settings"}
          onClick={() => navigate({ view: "settings" })}
          dot={snapshot.migration.pending.length > 0}
        >
          <GearIcon size={20} weight="fill" />
        </RoundButton>
        <RoundButton title="Lock" onClick={lock}>
          <LockIcon size={20} weight="fill" />
        </RoundButton>
        <button onClick={() => navigate({ view: "profile", id: owner.id })} title={owner.name} className="rounded-full hover:brightness-95">
          <Avatar profile={owner} size="md" />
        </button>
      </div>
    </header>
  );
}

export function RoundButton(props: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  badge?: number;
  dot?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${
        props.active ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-800 hover:bg-slate-200"
      }`}
    >
      {props.children}
      {!!props.badge && (
        <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-xs leading-5 font-semibold text-white">
          {props.badge > 99 ? "99+" : props.badge}
        </span>
      )}
      {props.dot && <span className="absolute top-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-amber-500" />}
    </button>
  );
}

/** Facebook's left menu: you, the destinations, then your pages as shortcuts. */
export function SideNav() {
  const { snapshot, owner, route, navigate } = useJournal();
  const shortcuts = snapshot.profiles
    .filter((p) => p.kind === "page" || p.kind === "shop")
    .sort((a, b) => (snapshot.stats[b.id]?.mentions ?? 0) - (snapshot.stats[a.id]?.mentions ?? 0))
    .slice(0, 10);

  return (
    <aside className="thin-scroll hidden h-full w-72 shrink-0 flex-col overflow-y-auto px-2 pt-4 pb-4 lg:flex xl:w-[360px]">
      <MenuRow onClick={() => navigate({ view: "profile", id: owner.id })} icon={<Avatar profile={owner} size="sm" />} label={owner.name} />
      {DESTINATIONS.map(({ icon: Icon, label, view, color }) => (
        <MenuRow
          key={view}
          active={route.view === view}
          onClick={() => navigate({ view } as Route)}
          icon={<Icon size={30} weight="fill" className={color} />}
          label={label}
        />
      ))}
      <MenuRow
        active={route.view === "trash"}
        onClick={() => navigate({ view: "trash" })}
        icon={<TrashIcon size={30} weight="fill" className="text-slate-500" />}
        label="Trash"
        extra={snapshot.trashCount || undefined}
      />
      <MenuRow
        active={route.view === "settings"}
        onClick={() => navigate({ view: "settings" })}
        icon={<GearIcon size={30} weight="fill" className="text-slate-500" />}
        label="Settings"
      />

      {shortcuts.length > 0 && (
        <>
          <hr className="mx-2 my-2 border-slate-300" />
          <h3 className="px-2 pt-1 pb-1 text-[17px] font-semibold text-slate-500">Your shortcuts</h3>
          {shortcuts.map((p) => (
            <MenuRow
              key={p.id}
              active={route.view === "profile" && route.id === p.id}
              onClick={() => navigate({ view: "profile", id: p.id })}
              icon={<Avatar profile={p} size="sm" />}
              label={p.name}
            />
          ))}
        </>
      )}

      <p className="mt-auto flex items-center gap-1.5 px-2 pt-6 text-[13px] text-slate-500">
        <ShieldCheckIcon className="text-brand-500" /> Private · AES-256-GCM · Argon2id · {snapshot.workspace.name}
      </p>
    </aside>
  );
}

function MenuRow(props: { icon: ReactNode; label: string; onClick: () => void; active?: boolean; extra?: number }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[15px] font-medium text-slate-800 transition-colors ${
        props.active ? "bg-slate-100" : "hover:bg-slate-100"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">{props.icon}</span>
      <span className="truncate">{props.label}</span>
      {props.extra && <span className="ml-auto rounded-full bg-slate-200 px-2 text-xs text-slate-600">{props.extra}</span>}
    </button>
  );
}

/** Title row + scrollable content + optional right column, on Facebook's grey page. */
export function Page(props: {
  title: ReactNode;
  actions?: ReactNode;
  rail?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  /** No title row: the content has its own header (profiles). */
  bare?: boolean;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1">
      <main id="main-scroll" className="thin-scroll relative h-full min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className={`mx-auto ${props.wide ? "max-w-5xl" : "max-w-[680px]"}`}>
          {!props.bare && (
            <div className="mb-4 flex min-h-10 items-center justify-between gap-4">
              <h1 className="flex min-w-0 items-center gap-2 truncate text-2xl font-bold text-slate-800">{props.title}</h1>
              {props.actions && <div className="flex items-center gap-2">{props.actions}</div>}
            </div>
          )}
          {props.children}
        </div>
      </main>
      {props.rail && <aside className="thin-scroll hidden h-full w-72 shrink-0 flex-col overflow-y-auto px-2 py-4 xl:flex xl:w-[360px]">{props.rail}</aside>}
    </div>
  );
}
