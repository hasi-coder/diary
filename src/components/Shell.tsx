// App chrome: left navigation sidebar and the per-view page layout.
import type { ReactNode } from "react";
import {
  BookOpenIcon,
  GearIcon,
  LockIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  TimerIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useJournal, type Route } from "../lib/journal";
import { Avatar } from "./ui";

export function Sidebar() {
  const { snapshot, owner, route, navigate } = useJournal();
  const shortcuts = snapshot.profiles
    .filter((p) => p.kind === "page" || p.kind === "shop")
    .sort((a, b) => (snapshot.stats[b.id]?.mentions ?? 0) - (snapshot.stats[a.id]?.mentions ?? 0))
    .slice(0, 6);

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            <BookOpenIcon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500">Workspace</div>
            <div className="truncate text-sm font-semibold leading-tight text-slate-800">{snapshot.workspace.name}</div>
          </div>
        </div>
      </div>

      <nav className="thin-scroll flex-1 space-y-1 overflow-y-auto p-4">
        <NavLink icon={TimerIcon} label="Timeline" target={{ view: "timeline" }} active={route.view === "timeline"} />
        <NavLink icon={UsersThreeIcon} label="Profiles" target={{ view: "profiles" }} active={route.view === "profiles"} />
        <NavLink icon={ShoppingBagIcon} label="Marketplace" target={{ view: "marketplace" }} active={route.view === "marketplace"} />

        <div className="pt-5">
          <button
            onClick={() => navigate({ view: "profile", id: owner.id })}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              route.view === "profile" && route.id === owner.id ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Avatar profile={owner} size="sm" />
            <span className="truncate">{owner.name}</span>
          </button>
        </div>

        {shortcuts.length > 0 && (
          <div className="pt-4">
            <h3 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pages & shops</h3>
            {shortcuts.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate({ view: "profile", id: p.id })}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  route.view === "profile" && route.id === p.id ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Avatar profile={p} size="sm" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="space-y-2 border-t border-slate-100 p-4">
        <button
          onClick={() => navigate({ view: "settings" })}
          className={`flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm transition-colors ${
            route.view === "settings" ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <GearIcon size={18} /> Settings
          {snapshot.migration.pending.length > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-amber-500" title="Migration available" />}
        </button>
        <div className="flex items-center gap-1.5 px-4 text-xs text-slate-400">
          <ShieldCheckIcon className="text-brand-500" /> AES-256-GCM · Argon2id
        </div>
      </div>
    </aside>
  );
}

function NavLink(props: { icon: Icon; label: string; target: Route; active: boolean }) {
  const { navigate } = useJournal();
  const Icon = props.icon;
  return (
    <button
      onClick={() => navigate(props.target)}
      className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 font-medium transition-colors ${
        props.active ? "bg-brand-50 text-brand-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon size={20} /> {props.label}
    </button>
  );
}

/** Header + scrollable content + optional right rail. */
export function Page(props: { title: ReactNode; actions?: ReactNode; rail?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { lock } = useJournal();
  return (
    <div className="flex h-full min-w-0 flex-1">
      <main className="relative flex h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md">
          <h2 className="flex min-w-0 items-center gap-2 truncate text-lg font-semibold text-slate-800">{props.title}</h2>
          <div className="flex items-center gap-3">
            {props.actions}
            <button
              onClick={lock}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
            >
              <LockIcon /> Lock
            </button>
          </div>
        </header>
        <div id="main-scroll" className="thin-scroll flex-1 overflow-y-auto p-4 md:p-8">
          <div className={`mx-auto ${props.wide ? "max-w-5xl" : "max-w-2xl"}`}>{props.children}</div>
        </div>
      </main>
      {props.rail && (
        <aside className="thin-scroll hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-6 lg:flex">
          {props.rail}
        </aside>
      )}
    </div>
  );
}
