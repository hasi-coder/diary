import { useCallback, useEffect, useState } from "react";
import { SearchPalette } from "./components/Search";
import { api, isTauri, type Snapshot } from "./lib/api";
import { JournalProvider, useJournal } from "./lib/journal";
import { Sidebar } from "./components/Shell";
import { UnlockScreen } from "./components/UnlockScreen";
import { GalleryView } from "./views/GalleryView";
import { MarketplaceView } from "./views/MarketplaceView";
import { ProfilesView } from "./views/ProfilesView";
import { PostView } from "./views/PostView";
import { ProfileView } from "./views/ProfileView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";
import { TimelineView } from "./views/TimelineView";

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [checking, setChecking] = useState(true);

  // After a frontend hot-reload the backend may still be unlocked.
  useEffect(() => {
    if (!isTauri()) return setChecking(false);
    api
      .getSnapshot()
      .then(setSnapshot)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const onLocked = useCallback(() => setSnapshot(null), []);

  if (checking) return null;
  if (!snapshot) return <UnlockScreen onUnlocked={setSnapshot} />;
  return (
    <JournalProvider key={snapshot.workspace.id} initial={snapshot} onLocked={onLocked}>
      <Workspace />
    </JournalProvider>
  );
}

function Workspace() {
  const { route } = useJournal();
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full w-full bg-slate-50">
      <Sidebar onSearch={() => setSearching(true)} />
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      {route.view === "timeline" && <TimelineView />}
      {route.view === "profiles" && <ProfilesView />}
      {route.view === "marketplace" && <MarketplaceView />}
      {route.view === "settings" && <SettingsView />}
      {route.view === "gallery" && <GalleryView />}
      {route.view === "search" && <SearchView key={route.query} initial={route.query} />}
      {route.view === "post" && <PostView key={route.id} id={route.id} />}
      {route.view === "profile" && <ProfileView key={route.id} id={route.id} tab={route.tab} />}
    </div>
  );
}
