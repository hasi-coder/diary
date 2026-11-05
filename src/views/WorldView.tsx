// A place, full window: walk it as the diary author, open doors, sit, invite
// people from the journal, and save the moment as a post. Opened from a post,
// the people tagged in it are already there.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  CameraIcon,
  CircleNotchIcon,
  CubeIcon,
  GearSixIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MapTrifoldIcon,
  MusicNotesIcon,
  StopIcon,
  TagIcon,
  TShirtIcon,
  UserPlusIcon,
  WallIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api, errorMessage, type Post, type Profile } from "../lib/api";
import { useJournal } from "../lib/journal";
import type { Interaction } from "../lib/places/interaction";
import { ActionWheel, type WheelNode } from "../components/ActionWheel";
import { INTERACTIONS, categoryTree, enabledInteractions, interactionsFor, type CategoryNode } from "../lib/places/interactions";
import { interactionAccess } from "../lib/places/interactionPolicy";
import { FURNITURE_EMOJI, furnitureToUse } from "../lib/places/furnitureActions";
import { interactionSettingsRevision, subscribeInteractionSettings } from "../lib/interactionSettings";
import { applyOutfit, OUTFITS, type Outfit } from "../lib/places/outfits";
import { DressingRoom } from "../components/DressingRoom";
import type { Character } from "../lib/places/character";
import { parseLayout, type PlacedItem, type Spot, type SpotRole } from "../lib/places/layout";
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
  useSyncExternalStore(subscribeInteractionSettings, interactionSettingsRevision, interactionSettingsRevision);
  const scene = useRef<WorldSceneHandle>(null);
  const [top, setTop] = useState(false);
  const [walls, setWalls] = useState<WallMode>("cut");
  const [rotation, setRotation] = useState(0);
  const [labels, setLabels] = useState(true);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [together, setTogether] = useState(false);
  /** Where the action wheel opens: the click, or the middle of the window. */
  const [wheelAt, setWheelAt] = useState({ x: 400, y: 300 });
  const [itemTarget, setItemTarget] = useState<PlacedItem | null>(null);
  const [presentation, setPresentation] = useState<World["presentation"]>(null);
  const [activity, setActivity] = useState<string | null>(null);
  /** Whose clothes the bar at the bottom is changing, and whether their dressing room is open. */
  const [dressing, setDressing] = useState<{ id: string; room: boolean } | null>(null);
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
      setPresentation(world.presentation);
    }, 100);
    world.onOutfitChange = (actor) => {
      void api.setProfileCharacter(actor.id, actor.look).then(props.onSaved).catch((error) => setToast(`Outfit changed for this visit; couldn't save it: ${errorMessage(error)}`));
    };
    return () => { clearInterval(timer); world.onToast = undefined; world.onOutfitChange = undefined; };
  }, [world, props.onSaved]);
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

  const start = (def: Interaction, people: Actor[], outfit?: Outfit) => {
    const members = def.people.max === 1 ? [me] : [me, ...people.filter((p) => p !== me)];
    if (world.startActivity(def, members, { target: itemTarget ?? undefined, outfit })) {
      setTogether(false);
      setSelected(null);
      setItemTarget(null);
      changed();
    }
  };

  /** Dresses someone straight away and saves it to their profile; not while they're in the middle of an action. */
  const dress = (who: Actor, patch: Partial<Character>) => {
    if (world.activity?.members.some((m) => m.actor === who)) return setToast("Stop the action first, then change clothes.");
    who.look = { ...who.look, ...patch };
    changed();
    void api.setProfileCharacter(who.id, who.look).then(props.onSaved).catch((error) => setToast(`Changed for this visit; couldn't save it: ${errorMessage(error)}`));
  };

  // ── The action wheel's rings ───────────────────────────────────────────────
  const groupNodes = (defs: Interaction[], make: (def: Interaction) => WheelNode | null): WheelNode[] => {
    const build = (c: CategoryNode): WheelNode | null => {
      const all = [...c.children.map(build), ...c.defs.map(make)].filter((n): n is WheelNode => !!n);
      return all.length ? { id: c.id, label: c.label, emoji: c.emoji, hint: `${all.length} ${c.children.length ? "groups and actions" : `action${all.length === 1 ? "" : "s"}`}`, children: all } : null;
    };
    return categoryTree(defs).map(build).filter((n): n is WheelNode => !!n);
  };

  /** Actions the group's ages rule out are left off the wheel, or shown with a lock when Settings says so. */
  const ageLocked = (def: Interaction, people: Actor[]) => interactionAccess(def, people).reason;

  /** One action as a wheel node: chosen straight away, or after picking an outfit or who to do it with. */
  const defNode = (def: Interaction, others: Actor[], target?: PlacedItem): WheelNode | null => {
    const together = def.people.max > 1;
    const hidden = together && others.length ? others.every((a) => interactionAccess(def, [me, a]).state === "hidden") : interactionAccess(def, [me]).state === "hidden";
    if (hidden) return null;
    const base = { id: def.id, label: def.label, emoji: def.emoji ?? "✨", hint: def.description };
    const needed = def.people.min - 1;
    if (together && others.length < needed) return { ...base, disabled: `Invite ${needed === 1 ? "someone" : `${needed} people`} first` };
    const withOutfit = (people: Actor[]): WheelNode =>
      def.outfitAt !== undefined
        ? { ...base, children: OUTFITS.map((o) => ({ id: o.id, label: o.label, emoji: "👗", hint: o.description, onSelect: () => start(def, people, o) })) }
        : { ...base, onSelect: () => start(def, people) };
    const lockedBy = ageLocked(def, together ? [me, ...others.slice(0, def.people.max - 1)] : [me]);
    if (lockedBy) return { ...base, disabled: `🔒 ${lockedBy}` };
    const problem = world.activityProblem(def, together ? [me, ...others.slice(0, def.people.max - 1)] : [me], target);
    if (problem && (!together || others.length === 1 || others.length <= def.people.max - 1)) return { ...base, disabled: problem };
    if (!together || others.length === 1 || def.people.max > others.length + 1) return withOutfit(together ? others.slice(0, def.people.max - 1) : []);
    return {
      ...base,
      children: [
        ...others.map((a): WheelNode => ({ id: a.id, label: a.profile.name.split(" ")[0], emoji: "🙂", hint: `${def.label} with ${a.profile.name}`, disabled: world.activityProblem(def, [me, a], target) ?? undefined, onSelect: () => start(def, [a]) })),
        ...(def.people.max > 2 ? [{ id: "everyone", label: "Everyone", emoji: "👥", onSelect: () => start(def, others.slice(0, def.people.max - 1)) } as WheelNode] : []),
      ],
    };
  };

  /** Home: its own groups, plus the furniture actually in this place, each opening to what it offers. */
  const withHomeFurniture = (groups: WheelNode[]): WheelNode[] => {
    const furniture = furnitureToUse(world.place.items, enabledInteractions(), [me.x, me.y])
      .map((item): WheelNode => ({ id: `use-${item.kind}`, label: item.spec.label, emoji: FURNITURE_EMOJI[item.kind] ?? "🪑", hint: `Use the ${item.spec.label.toLowerCase()} here`, children: itemNodes(item) }))
      .filter((n) => n.children!.length > 0);
    if (!furniture.length) return groups;
    const home = groups.find((g) => g.id === "household");
    if (home) return groups.map((g) => (g === home ? { ...home, hint: `${(home.children?.length ?? 0) + furniture.length} groups and furniture`, children: [...furniture, ...(home.children ?? [])] } : g));
    return [{ id: "household", label: "Home", emoji: "🏠", hint: "Use the furniture here", children: furniture }, ...groups];
  };

  const selfNodes = (): WheelNode[] => [
    ...withHomeFurniture(groupNodes(enabledInteractions(), (def) => defNode(def, world.actors.filter((a) => a !== me)))),
    { id: "clothes", label: "Clothes", emoji: "👗", hint: "Change what you wear", onSelect: () => setDressing({ id: me.id, room: false }) },
    { id: "settings", label: "Settings", emoji: "⚙️", hint: "Action settings", onSelect: () => navigate({ view: "settings", section: "place-actions" }) },
  ];

  const itemNodes = (target: PlacedItem): WheelNode[] => [
    ...(target.spec.seat && target.kind !== "toilet"
      ? [{ id: "sit", label: "Sit here", emoji: "🪑", onSelect: () => {
          const seat = world.place.seats.find((s) => s.item === target && !s.occupant && !s.reserved);
          if (!seat) return setToast("All seats are taken.");
          world.stopActivity();
          world.goTo(me, seat.x, seat.y, seat);
        } } as WheelNode]
      : []),
    ...enabledInteractions().filter((def) => def.target?.kinds.includes(target.kind)).map((def) => defNode(def, world.actors.filter((a) => a !== me), target)).filter((n): n is WheelNode => !!n),
  ];

  const personNodes = (who: Actor): WheelNode[] => [
    ...groupNodes(interactionsFor(2), (def) => {
      if (interactionAccess(def, [me, who]).state === "hidden") return null;
      const locked = ageLocked(def, [me, who]);
      const problem = locked ? `🔒 ${locked}` : world.activityProblem(def, [me, who]);
      return { id: def.id, label: def.label, emoji: def.emoji ?? "✨", hint: def.description, disabled: problem ?? undefined, onSelect: () => start(def, [who]) };
    }),
    {
      id: "manage", label: who.profile.name.split(" ")[0], emoji: "👤", hint: "Clothes, follow, wait, profile, send home",
      children: [
        { id: "clothes", label: "Clothes", emoji: "👗", hint: "Change what they wear", onSelect: () => (setDressing({ id: who.id, room: false }), setSelected(null)) },
        { id: "follow", label: who.following ? "Following" : "Follow me", emoji: "🚶", hint: "Come along", onSelect: () => ((who.following = true), world.follow(who), changed()) },
        { id: "wait", label: "Wait here", emoji: "✋", hint: "Stay where they are", onSelect: () => (world.wait(who), changed()) },
        { id: "profile", label: "Profile", emoji: "📖", hint: "Open their profile", onSelect: () => navigate({ view: "profile", id: who.id }) },
        { id: "leave", label: "Send home", emoji: "🏠", hint: "They leave the place", onSelect: () => (world.remove(who), setSelected(null), changed(), setToast(`${who.profile.name} left`)) },
      ],
    },
  ];

  const onPick = (pick: Pick, at: { x: number; y: number }) => {
    setWheelAt(at);
    setInviting(false);
    setTogether(false);
    setItemTarget(null);
    if (pick.kind === "actor") {
      if (pick.id === me.id) { setSelected(null); setDressing(null); return setTogether(true); }
      return setSelected({ id: pick.id, ...at });
    }
    setSelected(null);
    if (pick.kind === "door") {
      world.toggleDoor(pick.door);
      if (!pick.door.locked) setToast(`${pick.door.name ?? "Door"} ${pick.door.open ? "opened" : "closed"}`);
    } else if (pick.kind === "item" && INTERACTIONS.some((def) => def.target?.kinds.includes(pick.item.kind))) {
      setItemTarget(pick.item);
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (selected || inviting || together || itemTarget) {
          setSelected(null);
          setInviting(false);
          setTogether(false);
          setItemTarget(null);
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
  }, [world, me, selected, inviting, together, itemTarget, onExit]);

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

      {presentation && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950 text-white" style={{ opacity: presentation.opacity }} aria-live="polite">
          <div className="w-64 text-center">
            <div className="mb-4 text-6xl">{presentation.emoji}</div>
            <p className="text-xl font-semibold">{presentation.label}</p>
            <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-rose-300" style={{ width: `${presentation.progress * 100}%` }} /></div>
          </div>
        </div>
      )}

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
          <HudButton onClick={() => (setWheelAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 }), setTogether((v) => !v), setInviting(false), setSelected(null), setItemTarget(null))} title="Everyday and together actions">
            <MusicNotesIcon size={18} /> Actions
          </HudButton>
          <HudButton onClick={() => navigate({ view: "settings", section: "place-actions" })} title="Open animation and age mappings in Settings">
            <GearSixIcon size={18} /> Action settings
          </HudButton>
          <HudButton onClick={() => (setInviting((v) => !v), setTogether(false), setSelected(null), setItemTarget(null))} title="Invite someone">
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

        {(together || itemTarget) && (
          <ActionWheel
            at={wheelAt}
            title={itemTarget ? itemTarget.spec.label : "You"}
            subtitle={itemTarget ? "Actions" : "Choose something to do"}
            face={!itemTarget ? <FaceImage profile={me.profile} className="h-8 w-8" /> : undefined}
            nodes={itemTarget ? itemNodes(itemTarget) : selfNodes()}
            onClose={() => (setTogether(false), setItemTarget(null))}
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
          <ActionWheel
            at={selected}
            title={chosen.profile.name.split(" ")[0]}
            subtitle={[chosen.profile.relationship, chosen.seat ? "sitting" : chosen.path.length ? "walking" : ""].filter(Boolean).join(" · ")}
            face={<FaceImage profile={chosen.profile} className="h-8 w-8" />}
            nodes={personNodes(chosen)}
            onClose={() => setSelected(null)}
          />
        )}

        {dressing && actor(dressing.id) && (
          <OutfitBar
            actor={actor(dressing.id)!}
            busy={!!world.activity?.members.some((m) => m.actor.id === dressing.id)}
            onPreset={(outfit) => dress(actor(dressing.id)!, applyOutfit(outfit, actor(dressing.id)!.look.wearing))}
            onRoom={() => setDressing({ ...dressing, room: true })}
            onClose={() => setDressing(null)}
          />
        )}
        {dressing?.room && actor(dressing.id) && (
          <DressingRoom
            profile={actor(dressing.id)!.profile}
            look={actor(dressing.id)!.look}
            initialLayer="base"
            onApply={(patch) => dress(actor(dressing.id)!, patch)}
            onClose={() => setDressing({ ...dressing, room: false })}
          />
        )}

        <div className="pointer-events-auto absolute bottom-3 left-3 flex max-w-[55%] flex-wrap gap-1.5">
          {world.actors.map((a) => (
            <button
              key={a.id}
              onClick={() => (a === me ? setDressing({ id: a.id, room: false }) : setSelected({ id: a.id, ...(scene.current?.screenOf(a.id) ?? { x: 200, y: 200 }) }))}
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

/** Sims-style bar at the bottom: pick a ready-made outfit for someone, or open their dressing room. Changes show at once and are saved. */
function OutfitBar(props: { actor: Actor; busy: boolean; onPreset: (outfit: Outfit) => void; onRoom: () => void; onClose: () => void }) {
  const { actor } = props;
  return (
    <div className="pointer-events-auto absolute bottom-16 left-1/2 flex w-[min(52rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-2 pr-3 text-white shadow-2xl backdrop-blur">
      <div className="flex shrink-0 items-center gap-2 border-r border-white/10 pr-3">
        <FaceImage profile={actor.profile} className="h-11 w-11" />
        <div className="min-w-0">
          <div className="max-w-28 truncate text-sm font-bold">{actor.profile.name}</div>
          <div className="text-[11px] text-white/60">{props.busy ? "Busy · stop the action" : "Outfits"}</div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1" aria-label="Outfits">
        {OUTFITS.map((outfit) => (
          <button
            key={outfit.id}
            disabled={props.busy}
            title={outfit.description}
            onClick={() => props.onPreset(outfit)}
            className="flex shrink-0 flex-col items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-40"
          >
            <span className="flex">
              {outfit.wearing.slice(-3).map((w, i) => <span key={i} className="-ml-1 h-3.5 w-3.5 rounded-full border border-slate-900 first:ml-0" style={{ background: w.color }} />)}
              {!outfit.wearing.length && <TShirtIcon size={14} />}
            </span>
            {outfit.label}
          </button>
        ))}
      </div>
      <button onClick={props.onRoom} disabled={props.busy} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-40">
        <TShirtIcon size={16} /> Dressing room
      </button>
      <button onClick={props.onClose} aria-label="Close outfit bar" className="shrink-0 text-white/60 hover:text-white">
        <XIcon />
      </button>
    </div>
  );
}
