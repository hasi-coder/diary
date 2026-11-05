// App-wide state for an unlocked workspace: the snapshot, navigation, and refresh.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, errorMessage, isTauri, type Post, type PostFilter, type Profile, type Snapshot } from "./api";

export type Route =
  | { view: "timeline" }
  | { view: "profiles" }
  | { view: "marketplace" }
  | { view: "settings"; section?: "place-actions" }
  | { view: "gallery" }
  | { view: "series"; id?: string }
  | { view: "trash" }
  | { view: "search"; query: string }
  | { view: "post"; id: string }
  | { view: "profile"; id: string; tab?: "posts" | "about" | "media" | "shop" | "place" }
  | { view: "places" }
  /** Full window: walk a place, optionally with the people from a post. */
  | { view: "world"; placeId: string; postId?: string };

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
  /** Goes to the view `back` left, if any. */
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  lock: () => Promise<void>;
}

const JournalContext = createContext<Journal | null>(null);

export function JournalProvider(props: { initial: Snapshot; onLocked: () => void; children: ReactNode }) {
  const { onLocked } = props;
  const [snapshot, setSnapshot] = useState(props.initial);
  const [version, setVersion] = useState(0);
  // Views visited, and which one is showing: back and forward move `at`; going somewhere new drops what's ahead.
  const [history, setHistory] = useState<{ routes: Route[]; at: number }>({ routes: [{ view: "timeline" }], at: 0 });
  const route = history.routes[history.at];

  const refresh = useCallback(async () => {
    setSnapshot(await api.getSnapshot());
    setVersion((v) => v + 1);
  }, []);

  // Changes made outside this window (an agent over MCP) arrive as `journal-changed`
  // events: refresh, batching a burst of calls into one reload.
  useEffect(() => {
    if (!isTauri()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("journal-changed", () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh().catch(() => {}), 300);
    })
      .then((stop) => (cancelled ? stop() : (unlisten = stop)))
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unlisten?.();
    };
  }, [refresh]);

  const replace = useCallback((s: Snapshot) => {
    setSnapshot(s);
    setVersion((v) => v + 1);
  }, []);

  const lock = useCallback(async () => {
    await api.lockWorkspace();
    onLocked();
  }, [onLocked]);

  const navigate = useCallback((r: Route) => {
    setHistory(({ routes, at }) => {
      const kept = [...routes.slice(0, at + 1), r].slice(-50);
      return { routes: kept, at: kept.length - 1 };
    });
    document.getElementById("main-scroll")?.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(
    () =>
      setHistory((h) =>
        h.at > 0 ? { ...h, at: h.at - 1 } : h.routes[0].view === "timeline" ? h : { routes: [{ view: "timeline" }, ...h.routes], at: 0 },
      ),
    [],
  );
  const forward = useCallback(() => setHistory((h) => (h.at < h.routes.length - 1 ? { ...h, at: h.at + 1 } : h)), []);
  const canBack = history.at > 0 || route.view !== "timeline";
  const canForward = history.at < history.routes.length - 1;

  const value = useMemo<Journal>(() => {
    const profiles = new Map(snapshot.profiles.map((p) => [p.id, p]));
    const owner = profiles.get(snapshot.workspace.ownerProfileId)!;
    return { snapshot, profiles, owner, version, refresh, replace, route, navigate, back, forward, canBack, canForward, lock };
  }, [snapshot, version, refresh, replace, route, navigate, back, forward, canBack, canForward, lock]);

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
