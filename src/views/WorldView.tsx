// A place, full window: walk it as the diary author, open doors, sit, invite
// people from the journal, and save the moment as a post. Opened from a post,
// the people tagged in it are already there.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CameraIcon,
  CircleNotchIcon,
  CubeIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapTrifoldIcon,
  MusicNotesIcon,
  StopIcon,
  TagIcon,
  UserPlusIcon,
  WallIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api, errorMessage, type Post, type Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import type { Interaction } from "../lib/places/interaction";
import { INTERACTIONS, interactionsFor } from "../lib/places/interactions";
import { parseLayout, type Spot, type SpotRole } from "../lib/places/layout";
import { isPerson, peopleAt, ROLE_LABELS } from "../lib/places/people";
import { World, type Actor } from "../lib/places/world";
import { FaceImage } from "../components/world/FaceImage";
import { Minimap } from "../components/world/Minimap";
import { WorldScene, type WorldSceneHandle } from "../components/world/WorldScene";
import type { Pick, WallMode } from "../components/world/scene";

const WALL_LABELS: Record<WallMode, string> = { cut: "Walls cut away", up: "Walls up", down: "Walls down" };
const NEXT_WALLS: Record<WallMode, WallMode> = { cut: "up", up: "down", down: "cut" };

export function WorldView({ placeId, postId }: { placeId: string; postId?: string }) {
  const { profiles, snapshot, owner, back, navigate, refresh } = useJournal();
  const place = profiles.get(placeId);
  const floor = parseLayout(place?.layout)?.floors[0];
  const [post, setPost] = useState<Post | null | undefined>(postId ? undefined : null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    api.getPost(postId).then(setPost, (e) => (setLoadError(errorMessage(e)), setPost(null)));
  }, [postId]);

  // Build the world once the post (if any) is known: the author at the door,
  // people who live or work here at their spots, and the post's people where it happened.
  const world = useMemo(() => {
    if (!floor || post === undefined) return null;
    const w = new World(floor);
    w.addAuthor(owner);
    const added = new Set([owner.id]);
    const used: Record<SpotRole, number> = { home: 0, work: 0, visit: 0 };
    const spot = (role: SpotRole): Spot | undefined => floor.spots?.[role]?.[used[role]++];
    for (const { profile, role } of peopleAt(placeId, snapshot.profiles)) {
      if (added.has(profile.id) || (role !== "home" && role !== "work")) continue;
      added.add(profile.id);
      w.add(profile, role, spot(role));
    }
    for (const id of post ? [post.authorId, ...post.withIds] : []) {
      const p = profiles.get(id);
      if (!p || !isPerson(p) || added.has(id)) continue;
      added.add(id);
      w.add(p, "guest", spot("visit"));
    }
    return w;
    // Rebuild only for another place or post, not on every snapshot refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor === undefined, placeId, post]);

  if (!place || (!floor && post !== undefined)) {
    return (
      <Shell onExit={back}>
        <div className="m-auto max-w-sm rounded-xl bg-white/10 p-6 text-center text-white">
          <p className="mb-4">{place ? `${place.name} has no layout yet.` : "This place no longer exists."}</p>
          {place && (
            <button className="rounded-md bg-white px-3 py-1.5 font-semibold text-slate-800" onClick={() => navigate({ view: "profile", id: place.id, tab: "place" })}>
              Build its layout
            </button>
          )}
        </div>
      </Shell>
    );
  }
  if (!world) {
    return (
      <Shell onExit={back}>
        <CircleNotchIcon size={32} className="m-auto animate-spin text-white" />
      </Shell>
    );
  }
  return <Playing key={`${placeId}:${postId ?? ""}`} world={world} place={place} post={post ?? null} loadError={loadError} onExit={back} onSaved={refresh} />;
}

function Shell({ children, onExit }: { children: ReactNode; onExit: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onExit();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);
  return <div className="fixed inset-0 z-50 flex bg-[#1d232b]">{children}</div>;
}

function Playing(props: { world: World; place: Profile; post: Post | null; loadError: string | null; onExit: () => void; onSaved: () => Promise<void> }) {
  const { world, place, post, onExit } = props;
  const { snapshot, owner, navigate } = useJournal();
  const scene = useRef<WorldSceneHandle>(null);
  const [top, setTop] = useState(false);
  const [walls, setWalls] = useState<WallMode>("cut");
  const [rotation, setRotation] = useState(0);
  const [labels, setLabels] = useState(true);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [together, setTogether] = useState(false);
  /** Who to do something with, from the Together panel (the author always takes part). */
  const [partners, setPartners] = useState<Set<string> | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(props.loadError);
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);
  // Bumped when people come, go, or start or stop following.
  const [, setVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);

  useEffect(() => {
    world.onToast = setToast;
    const timer = setInterval(() => {
      setRoom(world.author ? world.roomOf(world.author) : "");
      const a = world.activity;
      setActivity(a ? `${a.def.emoji ?? ""} ${a.def.label}${a.state === "gathering" ? " · getting ready" : ""}`.trim() : null);
    }, 250);
    return () => clearInterval(timer);
  }, [world]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const me = world.author;
  const actor = (id: string) => world.actors.find((a) => a.id === id);
  const roles = useMemo(() => new Map(peopleAt(place.id, snapshot.profiles).map((r) => [r.profile.id, r.role])), [place.id, snapshot.profiles]);

  const tags = new Map<string, { text: string; color?: string }>();
  for (const a of world.actors) {
    if (a === me) continue;
    tags.set(a.id, { text: a.profile.name, color: a.following ? "rgba(24,119,242,0.92)" : undefined });
  }

  const start = (def: Interaction, people: Actor[]) => {
    setTogether(false);
    setSelected(null);
    if (world.startActivity(def, [me, ...people.filter((p) => p !== me)])) changed();
  };

  const onPick = (pick: Pick, at: { x: number; y: number }) => {
    setInviting(false);
    setTogether(false);
    if (pick.kind === "actor") {
      if (pick.id === me.id) return setSelected(null);
      return setSelected({ id: pick.id, ...at });
    }
    setSelected(null);
    if (pick.kind === "door") {
      world.toggleDoor(pick.door);
      if (!pick.door.locked) setToast(`${pick.door.name ?? "Door"} ${pick.door.open ? "opened" : "closed"}`);
    } else if (pick.kind === "item" && pick.item.spec.seat) {
      const seats = world.place.seats.filter((s) => s.item === pick.item).sort((a, b) => Math.hypot(a.x + 0.5 - pick.x, a.y + 0.5 - pick.y) - Math.hypot(b.x + 0.5 - pick.x, b.y + 0.5 - pick.y));
      const free = seats.find((s) => !s.occupant || s.occupant === me.id);
      if (!free) return setToast(`${actor(seats[0].occupant!)?.profile.name ?? "Someone"} is sitting there`);
      if (free.occupant !== me.id) {
        world.stopActivity();
        world.goTo(me, free.x, free.y, free);
      }
    } else {
      world.stopActivity();
      world.goNear(me, pick.x, pick.y);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (selected || inviting || together) {
          setSelected(null);
          setInviting(false);
          setTogether(false);
        } else if (world.activity) world.stopActivity();
        else onExit();
        return;
      }
      const step = ({ w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] } as Record<string, [number, number]>)[k];
      if (step) {
        e.preventDefault();
        world.stopActivity();
        world.step(me, step[0], step[1]);
      } else if (k === "t") setTop((v) => !v);
      else if (k === "q") setRotation((r) => (r + 3) % 4);
      else if (k === "e") setRotation((r) => (r + 1) % 4);
      else if (k === "l") setLabels((v) => !v);
      else if (k === "=" || k === "+") scene.current?.zoom(1.2);
      else if (k === "-") scene.current?.zoom(1 / 1.2);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [world, me, selected, inviting, together, onExit]);

  const saveMoment = async () => {
    setSaving(true);
    try {
      const blob = await scene.current?.capture();
      if (!blob) throw new Error("Couldn't take the picture.");
      const media = await api.stageMedia(new File([blob], `${place.name} moment.png`, { type: "image/png" }));
      await api.savePost({
        kind: "status",
        title: "",
        authorId: owner.id,
        content: "",
        mediaIds: [media.id],
        captions: {},
        withIds: world.actors.filter((a) => a !== me).map((a) => a.id),
        placeId: place.id,
        feeling: null,
        activities: [],
        eventType: "",
        alsoEventTypes: [],
        seriesIds: [],
        layered: false,
        poll: null,
      });
      await props.onSaved();
      setToast("Saved to your timeline");
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const present = new Set(world.actors.map((a) => a.id));
  const invitable = snapshot.profiles
    .filter((p) => isPerson(p) && !present.has(p.id))
    .sort((a, b) => Number(roles.has(b.id)) - Number(roles.has(a.id)) || a.name.localeCompare(b.name));
  const chosen = selected && actor(selected.id);

  return (
    <Shell onExit={onExit}>
      <WorldScene
        ref={scene}
        world={world}
        top={top}
        walls={walls}
        rotation={rotation}
        labels={labels}
        selectedId={selected?.id ?? null}
        tags={tags}
        onPick={onPick}
        className="absolute inset-0"
      />

      <div className="pointer-events-none absolute inset-0 text-sm text-white">
        <div className="pointer-events-auto absolute left-3 top-3 flex items-start gap-2">
          <HudButton onClick={onExit} title="Back to the diary (Esc)">
            <ArrowLeftIcon size={18} />
          </HudButton>
          <div className="rounded-xl border border-white/10 bg-slate-900/75 px-3 py-2 backdrop-blur">
            <button className="text-base font-bold hover:underline" onClick={() => navigate({ view: "profile", id: place.id, tab: "place" })}>
              {place.name}
            </button>
            <div className="text-white/70">{room || world.floor.name}</div>
          </div>
          {post && (
            <span className="mt-1 rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">
              From a post · {new Date(post.occurredAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>

        <div className="pointer-events-auto absolute right-3 top-3 flex flex-wrap justify-end gap-2">
          <HudButton on={!top} onClick={() => setTop(false)} title="Isometric view">
            <CubeIcon size={18} /> Iso
          </HudButton>
          <HudButton on={top} onClick={() => setTop(true)} title="Top view (T)">
            <MapTrifoldIcon size={18} /> Top
          </HudButton>
          <HudButton onClick={() => setRotation((r) => (r + 3) % 4)} title="Turn left (Q)">
            <ArrowCounterClockwiseIcon size={18} />
          </HudButton>
          <HudButton onClick={() => setRotation((r) => (r + 1) % 4)} title="Turn right (E)">
            <ArrowClockwiseIcon size={18} />
          </HudButton>
          <HudButton onClick={() => scene.current?.zoom(1.25)} title="Zoom in (+)">
            <MagnifyingGlassPlusIcon size={18} />
          </HudButton>
          <HudButton onClick={() => scene.current?.zoom(0.8)} title="Zoom out (−)">
            <MagnifyingGlassMinusIcon size={18} />
          </HudButton>
          <HudButton onClick={() => setWalls((w) => NEXT_WALLS[w])} title="Walls">
            <WallIcon size={18} /> {WALL_LABELS[walls]}
          </HudButton>
          <HudButton on={labels} onClick={() => setLabels((v) => !v)} title="Room names (L)">
            <TagIcon size={18} />
          </HudButton>
          <HudButton onClick={() => (setTogether((v) => !v), setInviting(false), setSelected(null))} title="Do something together">
            <MusicNotesIcon size={18} /> Together
          </HudButton>
          <HudButton onClick={() => (setInviting((v) => !v), setTogether(false), setSelected(null))} title="Invite someone">
            <UserPlusIcon size={18} /> Invite
          </HudButton>
          <HudButton onClick={() => void saveMoment()} title="Save this view as a post" disabled={saving}>
            {saving ? <CircleNotchIcon size={18} className="animate-spin" /> : <CameraIcon size={18} />} Save moment
          </HudButton>
        </div>

        {inviting && (
          <div className="pointer-events-auto absolute right-3 top-16 max-h-[60vh] w-72 overflow-y-auto rounded-xl bg-white p-2 text-slate-800 shadow-2xl">
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="font-bold">Invite to {place.name}</h3>
              <button onClick={() => setInviting(false)} className="text-slate-400 hover:text-slate-600">
                <XIcon />
              </button>
            </div>
            {invitable.length === 0 && <p className="px-2 py-3 text-slate-500">Everyone's here.</p>}
            {invitable.map((p) => (
              <button
                key={p.id}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
                onClick={() => {
                  world.invite(p);
                  setInviting(false);
                  changed();
                }}
              >
                <FaceImage profile={p} className="h-9 w-9" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[p.relationship, roles.has(p.id) ? ROLE_LABELS[roles.get(p.id)!] : ""].filter(Boolean).join(" · ") || "Journal person"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {together && (
          <TogetherPanel
            others={world.actors.filter((a) => a !== me)}
            chosen={partners}
            onChoose={setPartners}
            onStart={start}
            onClose={() => setTogether(false)}
          />
        )}

        {activity && (
          <div className="pointer-events-auto absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 py-1 pl-4 pr-1 backdrop-blur">
            <span className="font-semibold">{activity}</span>
            <button onClick={() => (world.stopActivity(), changed())} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20">
              <StopIcon weight="fill" /> Stop
            </button>
          </div>
        )}

        {chosen && selected && (
          <PersonMenu
            actor={chosen}
            at={selected}
            onClose={() => setSelected(null)}
            actions={{
              follow: () => ((chosen.following = true), world.follow(chosen), changed()),
              wait: () => (world.wait(chosen), changed()),
              leave: () => (world.remove(chosen), setSelected(null), changed(), setToast(`${chosen.profile.name} left`)),
              profile: () => navigate({ view: "profile", id: chosen.id }),
              together: (def) => start(def, [chosen]),
            }}
          />
        )}

        <div className="pointer-events-auto absolute bottom-3 left-3 flex max-w-[55%] flex-wrap gap-1.5">
          {world.actors.map((a) => (
            <button
              key={a.id}
              onClick={() => a !== me && setSelected({ id: a.id, ...(scene.current?.screenOf(a.id) ?? { x: 200, y: 200 }) })}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/75 py-0.5 pl-0.5 pr-3 backdrop-blur hover:bg-slate-800"
            >
              <FaceImage profile={a.profile} className="h-7 w-7" />
              <span>{a === me ? "You" : a.profile.name}</span>
              <span className="text-xs text-white/60">{a === me ? "" : a.following ? "following" : a.role === "home" ? "lives here" : a.role === "work" ? "works here" : "guest"}</span>
            </button>
          ))}
        </div>

        {!top && (
          <div className="pointer-events-auto absolute bottom-3 right-3 rounded-xl border border-white/10 bg-slate-900/80 p-1.5">
            <Minimap world={world} className="block h-36 w-48 cursor-pointer" onWalk={(x, y) => (world.stopActivity(), world.goNear(me, x, y))} />
          </div>
        )}

        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
          Click to walk · click a door to open or close it · click a seat to sit · Together to dance · drag to look around · W A S D to step · Q E to turn · T top view · Esc to leave
        </div>
        {toast && <div className="absolute left-1/2 top-28 -translate-x-1/2 rounded-lg bg-slate-900/90 px-4 py-2 font-medium shadow-lg">{toast}</div>}
      </div>
    </Shell>
  );
}

function HudButton(props: { children: ReactNode; onClick: () => void; title: string; on?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      disabled={props.disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold backdrop-blur transition-colors disabled:opacity-60 ${
        props.on ? "border-brand-500 bg-brand-600 text-white" : "border-white/10 bg-slate-900/75 text-white hover:bg-slate-800"
      }`}
    >
      {props.children}
    </button>
  );
}

function PersonMenu(props: {
  actor: Actor;
  at: { x: number; y: number };
  onClose: () => void;
  actions: { follow: () => void; wait: () => void; leave: () => void; profile: () => void; together: (def: Interaction) => void };
}) {
  const { actor, at, actions } = props;
  const item = "w-full rounded-md px-3 py-1.5 text-left font-medium hover:bg-slate-100";
  return (
    <div
      className="pointer-events-auto absolute w-60 rounded-xl bg-white p-2 text-slate-800 shadow-2xl"
      style={{ left: Math.max(8, Math.min(at.x + 12, window.innerWidth - 250)), top: Math.max(60, Math.min(at.y - 40, window.innerHeight - 220)) }}
    >
      <div className="mb-1 flex items-center gap-3 px-2 py-1">
        <FaceImage profile={actor.profile} className="h-10 w-10" />
        <div className="min-w-0">
          <div className="truncate font-bold">{actor.profile.name}</div>
          <div className="truncate text-xs text-slate-500">
            {[actor.profile.relationship, actor.seat ? "sitting" : actor.path.length ? "walking" : ""].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-2 gap-1 border-b border-slate-100 pb-2">
        {interactionsFor(2).map((def) => (
          <button key={def.id} title={def.description} onClick={() => actions.together(def)} className="truncate rounded-md bg-slate-50 px-2 py-1.5 text-left text-[13px] font-medium hover:bg-brand-50 hover:text-brand-700">
            {def.emoji} {def.label}
          </button>
        ))}
      </div>
      <button className={item} onClick={actions.follow}>
        {actor.following ? "✓ Following you" : "Follow me"}
      </button>
      <button className={item} onClick={actions.wait}>
        Wait here
      </button>
      <button className={item} onClick={actions.profile}>
        Open profile
      </button>
      <button className={`${item} text-rose-600`} onClick={actions.leave}>
        Send home
      </button>
    </div>
  );
}

/** Pick people (you're always in) and something to do together; only what fits the group can start. */
function TogetherPanel(props: {
  others: Actor[];
  chosen: Set<string> | null;
  onChoose: (ids: Set<string>) => void;
  onStart: (def: Interaction, people: Actor[]) => void;
  onClose: () => void;
}) {
  const { others } = props;
  // Everyone here, until chosen otherwise.
  const chosen = props.chosen ? others.filter((a) => props.chosen!.has(a.id)) : others;
  const count = chosen.length + 1;
  const toggle = (id: string) => {
    const next = new Set(chosen.map((a) => a.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    props.onChoose(next);
  };
  return (
    <div className="pointer-events-auto absolute right-3 top-16 max-h-[70vh] w-80 overflow-y-auto rounded-xl bg-white p-3 text-slate-800 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold">Do something together</h3>
        <button onClick={props.onClose} className="text-slate-400 hover:text-slate-600">
          <XIcon />
        </button>
      </div>
      {others.length === 0 ? (
        <p className="text-sm text-slate-500">You're on your own. Invite someone first.</p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1.5 rounded-full bg-brand-600 py-0.5 pl-0.5 pr-3 text-sm font-medium text-white">You</span>
          {others.map((a) => {
            const on = chosen.includes(a);
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-3 text-sm font-medium ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                <FaceImage profile={a.profile} className="h-6 w-6" /> {a.profile.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-1">
        {INTERACTIONS.map((def) => {
          const fits = count >= def.people.min && count <= def.people.max;
          const range = def.people.min === def.people.max ? `${def.people.min} people` : `${def.people.min}–${def.people.max} people`;
          return (
            <button
              key={def.id}
              disabled={!fits}
              onClick={() => props.onStart(def, chosen)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span className="text-xl leading-6">{def.emoji}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{def.label}</span>
                <span className="block text-xs text-slate-500">
                  {def.description} · {range}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
