// App-wide state for an unlocked workspace: the snapshot, navigation, and refresh.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage, type Post, type PostFilter, type Profile, type Snapshot } from "./api";

export type Route =
  | { view: "timeline" }
  | { view: "profiles" }
  | { view: "marketplace" }
  | { view: "settings" }
  | { view: "gallery" }
  | { view: "series"; id?: string }
  | { view: "trash" }
  | { view: "search"; query: string }
  | { view: "post"; id: string }
  | { view: "profile"; id: string; tab?: "posts" | "about" | "media" | "shop" };

interface Journal {
  snapshot: Snapshot;
  profiles: Map<string, Profile>;
  owner: Profile;
  /** Bumped after every mutation so post lists refetch. */
  version: number;
  refresh: () => Promise<void>;
  /** Replace the snapshot directly (e.g. with the one a command returned). */
  replace: (snapshot: Snapshot) => void;
  route: Route;
  navigate: (route: Route) => void;
  /** Returns to the previous view, or the timeline. */
  back: () => void;
  lock: () => Promise<void>;
}

const JournalContext = createContext<Journal | null>(null);

export function JournalProvider(props: { initial: Snapshot; onLocked: () => void; children: ReactNode }) {
  const { onLocked } = props;
  const [snapshot, setSnapshot] = useState(props.initial);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<Route[]>([{ view: "timeline" }]);
  const route = history[history.length - 1];

  const refresh = useCallback(async () => {
    setSnapshot(await api.getSnapshot());
    setVersion((v) => v + 1);
  }, []);

  const replace = useCallback((s: Snapshot) => {
    setSnapshot(s);
    setVersion((v) => v + 1);
  }, []);

  const lock = useCallback(async () => {
    await api.lockWorkspace();
    onLocked();
  }, [onLocked]);

  const navigate = useCallback((r: Route) => {
    setHistory((h) => [...h.slice(-49), r]);
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : [{ view: "timeline" }])), []);

  const value = useMemo<Journal>(() => {
    const profiles = new Map(snapshot.profiles.map((p) => [p.id, p]));
    const owner = profiles.get(snapshot.workspace.ownerProfileId)!;
    return { snapshot, profiles, owner, version, refresh, replace, route, navigate, back, lock };
  }, [snapshot, version, refresh, replace, route, navigate, back, lock]);

  return <JournalContext.Provider value={value}>{props.children}</JournalContext.Provider>;
}

export function useJournal(): Journal {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error("useJournal must be used inside JournalProvider");
  return ctx;
}

export function usePosts(filter: PostFilter) {
  const { version } = useJournal();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filter);

  useEffect(() => {
    let cancelled = false;
    api
      .listPosts(JSON.parse(key) as PostFilter)
      .then((p) => !cancelled && (setPosts(p), setError(null)))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  return { posts, error };
}
