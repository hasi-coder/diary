import { useCallback, useEffect, useState } from "react";
import { api, isTauri, type Snapshot } from "./lib/api";
import { JournalProvider, useJournal } from "./lib/journal";
import { Sidebar } from "./components/Shell";
import { UnlockScreen } from "./components/UnlockScreen";
import { MarketplaceView } from "./views/MarketplaceView";
import { ProfilesView } from "./views/ProfilesView";
import { ProfileView } from "./views/ProfileView";
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
  return (
    <div className="flex h-full w-full bg-slate-50">
      <Sidebar />
      {route.view === "timeline" && <TimelineView />}
      {route.view === "profiles" && <ProfilesView />}
      {route.view === "marketplace" && <MarketplaceView />}
      {route.view === "profile" && <ProfileView key={route.id} id={route.id} tab={route.tab} />}
    </div>
  );
}
