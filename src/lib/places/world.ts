// The Places world as a simulation, independent of drawing: who is where, who
// walks where, doors that open as people pass and close behind them, seats, and
// cubicles that lock with everyone inside.
import type { Profile } from "../api";
import { AGES, characterOf, type Character } from "./character";
import { lengthOf, poseAt, type FullPose, type HeldItem, type Interaction, type Posture } from "./interaction";
import { interactionDressed, interactionPolicyProblem } from "./interactionPolicy";
import { applyOutfit, OUTFITS, type Outfit } from "./outfits";
import { garment, legacyFields, outfitOf, underwearOf } from "./garments";
import {
  buildPlace,
  cubicleCells,
  cubicleOf,
  DIRS,
  dirOf,
  edgeKey,
  findPath,
  parseEdge,
  seatAt,
  stepOK,
  walkable,
  type Cell,
  type DoorState,
  type Facing,
  type Floor,
  type Place,
  type PlacedItem,
  type Seat,
  type Spot,
} from "./layout";

/** Who someone is in this visit: the diary author, someone who lives or works here, or a guest. */
export type ActorRole = "author" | "home" | "work" | "guest";

export interface Actor {
  id: string;
  profile: Profile;
  look: Character;
  role: ActorRole;
  /** Centre of the actor, in cells (x + 0.5 is the middle of cell x). */
  x: number;
  y: number;
  facing: Facing;
  path: Cell[];
  seat: Seat | null;
  goalSeat: Seat | null;
  /** Following the author around, or staying put. */
  following: boolean;
  /** Doing something together: the pose to show and the way the body faces (radians, see `yawOf`), set every frame. */
  pose?: FullPose | null;
  yaw?: number | null;
  hidden?: boolean;
  /** Metres off the ground an action holds them at; stacks with the pose's bob. */
  lift?: number;
  held?: HeldItem | null;
  /** Resting on a surface, rotated about the hips rather than the feet. */
  rest?: { height: number; pitch: number } | null;
}

interface Placement {
  at: Vec;
  facing: Vec;
  exit: Vec;
  seat?: Seat;
  /** How the body rests on the furniture while the action plays (lying, sitting in a tub); none stands. */
  rest?: { height: number; pitch: number };
}

export interface ActivityOptions {
  target?: PlacedItem;
  outfit?: Outfit;
}

/** Something people are doing together, from walking to their spots to the last beat. */
export interface Activity {
  def: Interaction;
  members: { actor: Actor; role: string; index: number; start: [number, number] }[];
  /** Where the formation is centred, and the way its "forward" points (a unit vector on the plan). */
  anchor: [number, number];
  forward: [number, number];
  state: "gathering" | "playing";
  /** World time it started gathering, then playing. */
  since: number;
  target?: PlacedItem;
  placements?: Placement[];
  outfit?: Outfit;
  originalLooks?: Character[];
  outfitApplied?: boolean;
  wardrobeApplied?: boolean;
  /** Played clothed: someone is under the age its undressing needs. */
  dressed?: boolean;
}

type Vec = [number, number];
/** Turns a plan vector clockwise (as seen on the plan, y down) by `deg`. */
const rotate = ([x, y]: Vec, deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
/** A person's right, when facing `d`. */
const rightOf = ([x, y]: Vec): Vec => [-y, x];
/** The body angle for facing `d` (what the figure turns by). */
export const yawOf = ([x, y]: Vec) => Math.atan2(x, y);
const facingOfVec = ([x, y]: Vec) => dirOf(Math.abs(x) > 0.38 ? Math.sign(x) : 0, Math.abs(y) > 0.38 ? Math.sign(y) : 0) ?? "S";

const inCells = (cells: Cell[], x: number, y: number) => cells.some(([a, b]) => a === x && b === y);

export class World {
  readonly place: Place;
  actors: Actor[] = [];
  author!: Actor;
  /** Seconds since the world started. */
  t = 0;
  /** Short messages for the person playing ("Locked — with Maya"). */
  onToast?: (message: string) => void;
  onOutfitChange?: (actor: Actor) => void;
  /** What people are doing together, if anything. */
  activity: Activity | null = null;

  constructor(floor: Floor) {
    this.place = buildPlace(floor);
  }

  get floor() {
    return this.place.floor;
  }

  cellOf(a: Actor): Cell {
    return [Math.floor(a.x), Math.floor(a.y)];
  }

  roomOf(a: Actor): string {
    const [x, y] = this.cellOf(a);
    return this.floor.rooms[this.place.room[y]?.[x] ?? -1]?.name ?? "";
  }

  /** Adds someone at a spot (a seat or a cell), or at the entrance if it's taken. */
  add(profile: Profile, role: ActorRole, spot?: Spot): Actor {
    const a: Actor = { id: profile.id, profile, look: characterOf(profile), role, x: 0, y: 0, facing: "SE", path: [], seat: null, goalSeat: null, following: false };
    this.actors.push(a);
    if (spot && "seat" in spot) {
      const s = seatAt(this.place, spot.seat[0], spot.seat[1]);
      if (s && !s.occupant) {
        this.sit(a, s);
        a.x = s.x + 0.5;
        a.y = s.y + 0.5;
        this.lockCubicle(s);
        return a;
      }
    }
    const [x, y] = spot && "cell" in spot && !this.taken(spot.cell[0], spot.cell[1]) ? spot.cell : this.freeNear(this.floor.entrance, a) ?? this.floor.entrance;
    a.x = x + 0.5;
    a.y = y + 0.5;
    if (spot && "cell" in spot && spot.facing) a.facing = spot.facing;
    return a;
  }

  /** The author, at the spawn point. */
  addAuthor(profile: Profile): Actor {
    const [x, y] = this.floor.spawn?.at ?? this.floor.entrance;
    this.author = this.add(profile, "author", { cell: [x, y], facing: this.floor.spawn?.facing ?? "N" });
    return this.author;
  }

  /** Someone invited in: they come through the entrance and follow the author. */
  invite(profile: Profile): Actor {
    const a = this.add(profile, "guest");
    a.following = true;
    this.onToast?.(`${profile.name} is coming in`);
    this.follow(a);
    return a;
  }

  remove(a: Actor) {
    if (this.activity?.members.some((m) => m.actor === a)) this.stopActivity();
    this.stand(a);
    if (a.goalSeat) a.goalSeat.reserved = null;
    this.actors = this.actors.filter((o) => o !== a);
  }

  /** Whether a cell is someone's place, now or where they're heading. */
  taken(x: number, y: number, except?: Actor): boolean {
    if (this.activity?.placements?.some((placement, i) => this.activity!.members[i].actor !== except && Math.floor(placement.exit[0]) === x && Math.floor(placement.exit[1]) === y)) return true;
    return this.actors.some((o) => {
      if (o === except) return false;
      const [cx, cy] = o.path.length ? o.path[o.path.length - 1] : this.cellOf(o);
      return cx === x && cy === y;
    });
  }

  /** The nearest free cell within two steps, in the same room. */
  freeNear([ax, ay]: Cell, self?: Actor): Cell | null {
    const p = this.place;
    const room = p.room[ay]?.[ax];
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let y = ay - 2; y <= ay + 2; y++)
      for (let x = ax - 2; x <= ax + 2; x++) {
        if ((x === ax && y === ay) || !walkable(p, x, y) || p.room[y][x] !== room || this.taken(x, y, self)) continue;
        const d = Math.hypot(x - ax, y - ay);
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    return best;
  }

  private sit(a: Actor, s: Seat) {
    a.seat = s;
    s.occupant = a.id;
    a.facing = s.facing;
  }

  stand(a: Actor) {
    const s = a.seat;
    if (!s) return;
    s.occupant = null;
    a.seat = null;
    const cubicle = cubicleOf(this.place, s);
    if (cubicle) Object.assign(cubicle, { locked: false, occupied: false, open: true, t: this.t, pending: null });
  }

  private lockCubicle(s: Seat): DoorState | undefined {
    const d = cubicleOf(this.place, s);
    if (d) Object.assign(d, { open: false, locked: true, occupied: true, pending: null });
    return d;
  }

  /** Walks someone to a cell, or to a seat to sit on. False when there's no way there. */
  goTo(a: Actor, tx: number, ty: number, seat?: Seat): boolean {
    const step = a.path[0]; // finish the step under way
    const [sx, sy] = step ?? this.cellOf(a);
    this.stand(a);
    if (a.goalSeat) {
      a.goalSeat.reserved = null;
      a.goalSeat = null;
    }
    const path = findPath(this.place, sx, sy, tx, ty);
    if (!path) {
      if (a === this.author) this.onToast?.("Can't get there from here");
      return false;
    }
    a.path = step ? [step, ...path] : path;
    if (seat) {
      seat.reserved = a.id;
      a.goalSeat = seat;
    }
    return true;
  }

  /** Walks toward a cell that isn't walkable (a table): the nearest free cell beside it. */
  goNear(a: Actor, fx: number, fy: number) {
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    if (walkable(this.place, cx, cy)) return this.goTo(a, cx, cy);
    let best: Cell | null = null;
    let bestD = Infinity;
    for (const [dx, dy] of Object.values(DIRS)) {
      const x = cx + dx;
      const y = cy + dy;
      if (!walkable(this.place, x, y)) continue;
      const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy);
      if (d < bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    return best ? this.goTo(a, best[0], best[1]) : false;
  }

  /** A step with the keyboard, from where the author is (or is heading). */
  step(a: Actor, dx: number, dy: number) {
    const [x, y] = a.path.length ? a.path[a.path.length - 1] : this.cellOf(a);
    if (stepOK(this.place, x, y, x + dx, y + dy)) this.goTo(a, x + dx, y + dy);
  }

  /** Opens or closes a door by hand. Locked doors say why. */
  toggleDoor(d: DoorState) {
    if (d.locked) return this.onToast?.(d.occupied ? `${d.name ?? "Door"}: occupied` : `${d.name ?? "Door"}: locked`);
    d.open = !d.open;
    d.manual = d.open;
    d.t = this.t;
  }

  /** Leaves someone where they are. */
  wait(a: Actor) {
    a.following = false;
    a.path = a.path.slice(0, 1);
    if (a.goalSeat) {
      a.goalSeat.reserved = null;
      a.goalSeat = null;
    }
  }

  update(dt: number) {
    const p = this.place;
    const before = this.t;
    this.t += dt;
    for (const a of this.actors) {
      if (!a.path.length) continue;
      const [nx, ny] = a.path[0];
      const tx = nx + 0.5;
      const ty = ny + 0.5;
      const dx = tx - a.x;
      const dy = ty - a.y;
      const dist = Math.hypot(dx, dy);
      const [cx, cy] = this.cellOf(a);
      if (cx !== nx || cy !== ny) {
        const e = Math.abs(nx - cx) + Math.abs(ny - cy) === 1 ? p.edges.get(edgeKey(cx, cy, nx, ny)) : undefined;
        if (e?.door) {
          if (e.door.locked) continue;
          if (!e.door.open) e.door.manual = false;
          e.door.open = true;
          e.door.t = this.t;
        }
      }
      a.facing = dirOf(Math.sign(Math.round(dx * 4)), Math.sign(Math.round(dy * 4))) ?? a.facing;
      const speed = (a.look.age === "elder" ? 1.7 : a.look.age === "child" ? 2.3 : 2.6) * dt;
      if (dist <= speed) {
        a.x = tx;
        a.y = ty;
        a.path.shift();
        if (!a.path.length && a.goalSeat) this.arrive(a, a.goalSeat);
      } else {
        a.x += (dx / dist) * speed;
        a.y += (dy / dist) * speed;
      }
    }

    // A cubicle locks once everyone walking into it is inside.
    for (const d of p.doors) {
      if (d.pending == null || this.t - d.pending < 0.7) continue;
      const cells = cubicleCells(p, d);
      if (this.actors.some((o) => o.path.length && inCells(cells, ...o.path[o.path.length - 1]))) continue;
      Object.assign(d, { open: false, locked: true, occupied: true, pending: null });
      if (d.pendingBy === this.author?.id) {
        const inside = this.actors.filter((o) => o !== this.author && inCells(cells, ...this.cellOf(o)));
        this.onToast?.(inside.length ? `Locked — with ${inside.map((o) => o.profile.name).join(", ")}` : "Locked — occupied");
      }
    }

    // Doors close behind people, unless opened by hand.
    for (const d of p.doors) {
      if (!d.open || d.manual || d.kind === "arch" || this.t - d.t < 1.4) continue;
      const { horizontal, x, y } = parseEdge(d.edge);
      const a: Cell = horizontal ? [x, y - 1] : [x - 1, y];
      if (this.actors.some((o) => {
        const [cx, cy] = this.cellOf(o);
        return (cx === a[0] && cy === a[1]) || (cx === x && cy === y);
      })) {
        d.t = this.t;
        continue;
      }
      d.open = false;
    }

    if (this.activity) this.updateActivity();

    // Followers look around twice a second.
    if (Math.floor(this.t * 2) !== Math.floor(before * 2)) for (const a of this.actors) if (a.following) this.follow(a);
  }

  private arrive(a: Actor, s: Seat) {
    s.reserved = null;
    a.goalSeat = null;
    if (s.occupant) return;
    this.sit(a, s);
    const d = cubicleOf(this.place, s);
    if (d) {
      d.pending = this.t;
      d.pendingBy = a.id;
    }
  }

  /** What a follower does: come along, sit near the author, or step into their cubicle with them. */
  follow(a: Actor) {
    if (this.activity?.members.some((m) => m.actor === a)) return;
    const p = this.place;
    const me = this.author;
    const [ax, ay] = this.cellOf(me);
    const [cx, cy] = this.cellOf(a);
    const cubicle = cubicleOf(p, me.seat ?? me.goalSeat);
    if (cubicle && !cubicle.locked) {
      const cells = cubicleCells(p, cubicle);
      if (inCells(cells, cx, cy) || (a.path.length && inCells(cells, ...a.path[a.path.length - 1]))) return;
      const free = cells.find(([x, y]) => walkable(p, x, y) && !this.taken(x, y, a) && !(x === cubicle.cubicle![0] && y === cubicle.cubicle![1]));
      if (free) {
        this.goTo(a, free[0], free[1]);
        return;
      }
    }
    if (a.path.length) return;
    const myRoom = p.room[ay][ax];
    if (me.path.length) {
      if (Math.hypot(ax - cx, ay - cy) > 2.5) {
        const t = this.freeNear([ax, ay], a);
        if (t) this.goTo(a, t[0], t[1]);
      }
      return;
    }
    if (a.seat && p.room[a.seat.y][a.seat.x] === myRoom) return;
    if (me.seat) {
      const free = p.seats
        .filter((s) => !s.occupant && (!s.reserved || s.reserved === a.id) && p.room[s.y][s.x] === myRoom && !cubicleOf(p, s))
        .sort((s1, s2) => Math.hypot(s1.x - ax, s1.y - ay) - Math.hypot(s2.x - ax, s2.y - ay));
      if (free.length) {
        this.goTo(a, free[0].x, free[0].y, free[0]);
        return;
      }
    }
    if (p.room[cy][cx] !== myRoom || Math.hypot(ax - cx, ay - cy) > 2.5) {
      const t = this.freeNear([ax, ay], a);
      if (t) this.goTo(a, t[0], t[1]);
    }
  }

  // ── Doing things together ──────────────────────────────────────────────────

  /** Where each person stands at a beat, and which way they face, before their own steps. */
  private formationAt(act: Activity, beat: number): { at: Vec; facing: Vec }[] {
    if (act.placements) return act.placements;
    const { def, members, anchor, forward } = act;
    const f = def.formation;
    const spin = (f.type === "stay" ? 0 : f.spin ?? 0) * Math.max(0, beat);
    if (f.type === "stay") {
      const c: Vec = [members.reduce((s, m) => s + m.start[0], 0) / members.length, members.reduce((s, m) => s + m.start[1], 0) / members.length];
      return members.map((m) => {
        const d: Vec = [c[0] - m.start[0], c[1] - m.start[1]];
        const len = Math.hypot(...d);
        return { at: m.start, facing: len > 0.05 ? [d[0] / len, d[1] / len] : forward };
      });
    }
    if (f.type === "ring") {
      const n = members.length;
      const radius = f.radius ?? Math.max(0.75, 0.26 * n);
      return members.map((_, i) => {
        const out = rotate([0, -radius], (360 * i) / n + spin);
        return { at: [anchor[0] + out[0], anchor[1] + out[1]], facing: [-out[0] / radius, -out[1] / radius] };
      });
    }
    const right = rightOf(forward);
    const spots = members.map((_, i) => f.spots[i]);
    const at = spots.map((s): Vec => [anchor[0] + s.at[0] * right[0] + s.at[1] * forward[0], anchor[1] + s.at[0] * right[1] + s.at[1] * forward[1]]);
    const centre: Vec = [at.reduce((s, p) => s + p[0], 0) / at.length, at.reduce((s, p) => s + p[1], 0) / at.length];
    return spots.map((s, i) => {
      const off = rotate([at[i][0] - centre[0], at[i][1] - centre[1]], spin);
      return { at: [centre[0] + off[0], centre[1] + off[1]], facing: rotate(rotate(forward, s.facing), spin) };
    });
  }

  /** Whether a formation fits here: open floor under everyone, no wall between them. */
  private fits(points: Vec[], members: Actor[]): boolean {
    const p = this.place;
    const cells = points.map(([x, y]): Cell => [Math.floor(x), Math.floor(y)]);
    const room = p.room[cells[0][1]]?.[cells[0][0]];
    for (const [x, y] of cells) {
      if (!walkable(p, x, y) || p.room[y][x] !== room) return false;
      if (this.actors.some((o) => !members.includes(o) && this.cellOf(o)[0] === x && this.cellOf(o)[1] === y)) return false;
    }
    // No furniture, wall or partition inside the box the formation covers.
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++)
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        if (!walkable(p, x, y)) return false;
        if (x < Math.max(...xs) && p.edges.has(edgeKey(x, y, x + 1, y))) return false;
        if (y < Math.max(...ys) && p.edges.has(edgeKey(x, y, x, y + 1))) return false;
      }
    return true;
  }

  /** Reasons shown by both the general Actions panel and furniture menus. */
  activityProblem(def: Interaction, people: Actor[], target?: PlacedItem): string | null {
    const policy = interactionPolicyProblem(def, people);
    if (policy) return policy;
    if (people.length < def.people.min || people.length > def.people.max) return `Choose ${def.people.min === def.people.max ? def.people.min : `${def.people.min}–${def.people.max}`} people, including you.`;
    if (new Set(people).size !== people.length || people.some((person) => !this.actors.includes(person))) return "Choose people who are here.";
    if (def.target && !(target ? this.place.items.includes(target) && def.target.kinds.includes(target.kind) : this.place.items.some((item) => def.target!.kinds.includes(item.kind)))) {
      return `Needs ${def.target.kinds.map((kind) => kind === "bath" ? "a bath" : `a ${kind}`).join(" or ")} in this place.`;
    }
    return null;
  }

  /** Plan an approach before changing anyone's current activity. Each person
   * needs a reachable, distinct entry cell; surface positions are used only
   * after everyone arrives. A failed route never teleports people to furniture. */
  private furniturePlan(def: Interaction, people: Actor[], selected?: PlacedItem): { target: PlacedItem; placements: Placement[] } | null {
    const p = this.place;
    const spec = def.target!;
    const targets = (selected ? [selected] : p.items.filter((item) => spec.kinds.includes(item.kind)))
      .slice().sort((a, b) => Math.hypot(a.x - people[0].x, a.y - people[0].y) - Math.hypot(b.x - people[0].x, b.y - people[0].y));
    for (const target of targets) {
      const centre: Vec = [target.x + target.w / 2, target.y + target.h / 2];
      const seats = p.seats.filter((seat) => seat.item === target && (!seat.occupant || people.some((a) => a.id === seat.occupant)) && (!seat.reserved || people.some((a) => a.id === seat.reserved)));
      const seatEntries = seats.map((seat) => ({ cell: [seat.x, seat.y] as Cell, seat }));
      const edgeEntries: { cell: Cell; seat?: Seat }[] = [];
      const add = (x: number, y: number, ix: number, iy: number) => {
        if (walkable(p, x, y) && p.room[y][x] === p.room[iy]?.[ix] && !p.edges.has(edgeKey(x, y, ix, iy))) edgeEntries.push({ cell: [x, y] });
      };
      for (let x = target.x; x < target.x + target.w; x++) {
        add(x, target.y - 1, x, target.y);
        add(x, target.y + target.h, x, target.y + target.h - 1);
      }
      for (let y = target.y; y < target.y + target.h; y++) {
        add(target.x - 1, y, target.x, y);
        add(target.x + target.w, y, target.x + target.w - 1, y);
      }
      // Each role may use the furniture differently (lying on a bed, standing beside it).
      const roleOf = (index: number) => def.formation.type === "spots" ? def.formation.spots[index].role : def.formation.role;
      const postureOf = (index: number): Posture => spec.roles?.[roleOf(index)]?.posture ?? spec.posture;
      const lyingCount = people.filter((_, i) => postureOf(i) === "lie" || postureOf(i) === "inside").length;
      // Bodies lie along the furniture's long axis (a bath runs sideways to its facing).
      const longX = target.w > target.h, square = target.w === target.h;
      const facingVec: Vec = [...DIRS[target.facing]];
      const alongAxis: boolean = square || (longX ? Math.abs(facingVec[0]) > Math.abs(facingVec[1]) : Math.abs(facingVec[1]) > Math.abs(facingVec[0]));
      const bedFacing: Vec = alongAxis ? facingVec : longX ? [-1, 0] : [0, -1];
      const bedSide = rightOf(bedFacing);
      let lyingSeen = 0;
      const used = new Set<string>();
      const placements: Placement[] = [];
      for (const [index, person] of people.entries()) {
        const posture = postureOf(index);
        const place = spec.roles?.[roleOf(index)];
        // A role with a place of its own (beside the bed, off to one side of it) goes there.
        const lies = posture === "lie" || posture === "inside";
        const half = (Math.abs(bedFacing[0]) > Math.abs(bedFacing[1]) ? target.h : target.w) / 2 + 0.3;
        const sign = place?.side === "right" ? -1 : place?.side === "center" ? 0 : 1;
        const across = place?.across ?? (lies ? 0 : half);
        const along = place?.along ?? 0;
        const wanted: Vec | null = place && (!lies || place.across !== undefined || place.along !== undefined || place.side !== undefined)
          ? [centre[0] + bedSide[0] * sign * across + bedFacing[0] * along, centre[1] + bedSide[1] * sign * across + bedFacing[1] * along]
          : null;
        const entries = posture === "sit" && seatEntries.length ? seatEntries : edgeEntries;
        const currentIndex = this.activity?.members.findIndex((member) => member.actor === person) ?? -1;
        const currentExit = currentIndex >= 0 && this.activity?.state === "playing" ? this.activity.placements?.[currentIndex].exit : undefined;
        const [sx, sy] = currentExit ? currentExit.map(Math.floor) : person.path[0] ?? this.cellOf(person);
        const from: Vec = wanted && !lies ? wanted : [person.x, person.y];
        const entry = entries.slice().sort((a, b) => Math.hypot(a.cell[0] + 0.5 - from[0], a.cell[1] + 0.5 - from[1]) - Math.hypot(b.cell[0] + 0.5 - from[0], b.cell[1] + 0.5 - from[1])).find(({ cell: [x, y] }) => {
          if (used.has(`${x}:${y}`) || this.actors.some((a) => !people.includes(a) && this.cellOf(a)[0] === x && this.cellOf(a)[1] === y)) return false;
          if (spec.posture === "stand" && !spec.roles && placements.length && people.length === 2 && !this.fits([placements[0].exit, [x + 0.5, y + 0.5]], people)) return false;
          return findPath(p, sx, sy, x, y) !== null;
        });
        if (!entry) break;
        used.add(entry.cell.join(":"));
        const exit: Vec = [entry.cell[0] + 0.5, entry.cell[1] + 0.5];
        const toward: Vec = [centre[0] - exit[0], centre[1] - exit[1]];
        const length = Math.hypot(...toward) || 1;
        let at = exit;
        let facing: Vec = entry.seat ? [...DIRS[entry.seat.facing]] : [toward[0] / length, toward[1] / length];
        // Sitting on furniture with no seats (a bed's edge) or a role with its own rest: on the surface.
        const onSurface = lies || (posture === "sit" && !entry.seat) || !!place?.rest;
        if (lies) {
          facing = bedFacing;
          const offset = (lyingSeen++ - (lyingCount - 1) / 2) * 0.55;
          at = wanted ?? [centre[0] + bedSide[0] * offset, centre[1] + bedSide[1] * offset];
        } else if (onSurface) {
          // Sits facing out from the middle line, or along the furniture when on it.
          facing = sign ? [bedSide[0] * sign, bedSide[1] * sign] : bedFacing;
          at = wanted ?? centre;
        } else if (wanted && Math.hypot(wanted[0] - exit[0], wanted[1] - exit[1]) < 0.8) at = wanted;
        if (place?.facing !== undefined) facing = rotate(bedFacing, place.facing);
        const base = target.kind === "bed" ? 0.62 : 0.68;
        const custom = place?.rest ?? spec.rest;
        const rest = custom ? { height: custom.height, pitch: (custom.pitch * Math.PI) / 180 }
          : posture === "lie" ? { height: base, pitch: -Math.PI / 2 }
          : onSurface ? { height: base + 0.06, pitch: 0 } : undefined;
        placements.push({ at, facing, exit, seat: entry.seat, rest: onSurface ? rest : undefined });
      }
      if (placements.length !== people.length) continue;
      if (people.length === 2 && spec.posture === "stand") {
        for (let i = 0; i < 2; i++) {
          const [x, y] = placements[1 - i].at;
          const dx = x - placements[i].at[0], dy = y - placements[i].at[1];
          const length = Math.hypot(dx, dy) || 1;
          placements[i].facing = [dx / length, dy / length];
        }
      }
      return { target, placements };
    }
    return null;
  }

  /** The cutaway is derived from simulation time, shared with the renderer. */
  get presentation(): { opacity: number; label: string; emoji: string; progress: number } | null {
    const act = this.activity;
    if (!act || act.state !== "playing" || !act.def.cutaway) return null;
    const { from, to, label, emoji } = act.def.cutaway;
    const beat = (this.t - act.since) / act.def.beat;
    if (beat < from || beat > to) return null;
    const fade = Math.min(1, (to - from) / 3);
    const opacity = Math.max(0, Math.min(1, (beat - from) / fade, (to - beat) / fade));
    return { opacity, label, emoji: emoji ?? act.def.emoji ?? "✨", progress: (beat - from) / (to - from) };
  }

  /**
   * Starts an interaction with these people (the first starts it and takes the first spot).
   * They walk to an open space near the first person, then play it. False when it can't happen here.
   */
  startActivity(def: Interaction, people: Actor[], options: ActivityOptions = {}): boolean {
    const problem = this.activityProblem(def, people, options.target);
    if (problem) { this.onToast?.(problem); return false; }
    if (def.outfitAt !== undefined && !options.outfit) { this.onToast?.("Choose an outfit first."); return false; }
    if (def.wardrobe?.outfitId && !OUTFITS.some((outfit) => outfit.id === def.wardrobe!.outfitId)) { this.onToast?.("This scene's outfit is unavailable."); return false; }
    const furniture = def.target ? this.furniturePlan(def, people, options.target) : null;
    if (def.target && !furniture) { this.onToast?.("No reachable space at that furniture. Try clearing the approach."); return false; }
    this.stopActivity();
    const lead = people[0];
    const [lx, ly] = this.cellOf(lead);
    const members = people.map((actor, index) => ({
      actor,
      index,
      role: def.formation.type === "spots" ? def.formation.spots[index].role : def.formation.role,
      start: [actor.x, actor.y] as Vec,
    }));
    const act: Activity = { def, members, anchor: [lead.x, lead.y], forward: [0, -1], state: "gathering", since: this.t, dressed: interactionDressed(def, people) };
    if (furniture) {
      act.target = furniture.target;
      act.placements = furniture.placements;
      act.outfit = options.outfit;
      if (options.outfit || def.wardrobe) act.originalLooks = people.map((a) => a.look);
      for (const [i, { actor }] of members.entries()) {
        const { exit, seat } = furniture.placements[i];
        if (!this.goTo(actor, Math.floor(exit[0]), Math.floor(exit[1]), seat)) {
          this.activity = act;
          this.stopActivity();
          return false;
        }
        // A zero-length route still needs to claim its seat.
        if (!actor.path.length && seat) this.arrive(actor, seat);
      }
      this.activity = act;
      this.onToast?.(`${def.emoji ?? ""} ${def.label}`.trim());
      return true;
    }

    if (def.formation.type !== "stay") {
      // Face the second person if there is one, then try nearby cells and directions until it fits.
      const toward: Vec = people[1] ? [people[1].x - lead.x, people[1].y - lead.y] : [0, -1];
      const len = Math.hypot(...toward) || 1;
      const first: Vec = [toward[0] / len, toward[1] / len];
      const directions: Vec[] = [first, ...Object.values(DIRS).map(([x, y]): Vec => [x / Math.hypot(x, y), y / Math.hypot(x, y)])];
      let best: { anchor: Vec; forward: Vec; score: number } | null = null;
      for (let y = ly - 6; y <= ly + 6; y++)
        for (let x = lx - 6; x <= lx + 6; x++) {
          const anchor: Vec = [x + 0.5, y + 0.5];
          if (!walkable(this.place, x, y)) continue;
          directions.forEach((forward, di) => {
            const trial = { ...act, anchor, forward };
            // A turning formation is checked all the way round.
            const spin = def.formation.type === "stay" ? 0 : def.formation.spin ?? 0;
            const beats = spin ? [0, 0.25, 0.5, 0.75].map((q) => (q * 360) / Math.abs(spin)) : [0];
            const samples = beats.flatMap((b) => this.formationAt(trial, b).map((s) => s.at));
            if (!this.fits(samples, people)) return;
            const score = Math.hypot(x - lx, y - ly) + (di === 0 ? 0 : 0.6);
            if (!best || score < best.score) best = { anchor, forward, score };
          });
        }
      if (!best) {
        this.onToast?.(`Not enough room for ${def.label.toLowerCase()} here`);
        return false;
      }
      act.anchor = (best as { anchor: Vec }).anchor;
      act.forward = (best as { forward: Vec }).forward;
      const spots = this.formationAt(act, 0);
      for (const m of members) {
        const [sx, sy] = spots[m.index].at;
        this.stand(m.actor);
        const [cx, cy] = this.cellOf(m.actor);
        if (cx !== Math.floor(sx) || cy !== Math.floor(sy)) this.goTo(m.actor, Math.floor(sx), Math.floor(sy));
        else m.actor.path = [];
      }
    } else {
      for (const m of members) m.actor.path = m.actor.path.slice(0, 1);
    }
    this.activity = act;
    this.onToast?.(`${def.emoji ?? ""} ${def.label}`.trim());
    return true;
  }

  stopActivity(completed = false) {
    const act = this.activity;
    if (!act) return;
    this.activity = null;
    for (const [i, { actor }] of act.members.entries()) {
      actor.pose = null;
      actor.yaw = null;
      actor.hidden = false;
      actor.held = null;
      actor.lift = 0;
      actor.rest = null;
      if (act.placements) {
        actor.path = [];
        if (actor.goalSeat) { actor.goalSeat.reserved = null; actor.goalSeat = null; }
        if (act.state === "playing" && (act.def.target?.posture === "lie" || act.def.target?.posture === "inside" || Object.values(act.def.target?.roles ?? {}).length)) {
          [actor.x, actor.y] = act.placements[i].exit;
        }
        if (act.def.target?.leaveSeat && actor.seat) {
          const cell = this.cellOf(actor);
          this.stand(actor);
          const candidates: Cell[] = [];
          for (let y = cell[1] - 2; y <= cell[1] + 2; y++) for (let x = cell[0] - 2; x <= cell[0] + 2; x++) {
            if (walkable(this.place, x, y) && !this.taken(x, y, actor) && findPath(this.place, ...cell, x, y) !== null) candidates.push([x, y]);
          }
          candidates.sort((a, b) => Math.hypot(a[0] - cell[0], a[1] - cell[1]) - Math.hypot(b[0] - cell[0], b[1] - cell[1]));
          for (const exit of candidates) if (this.goTo(actor, ...exit)) break;
        }
      }
      if (act.def.wardrobe && act.originalLooks) actor.look = act.originalLooks[i];
      else if (act.outfitApplied) {
        if (completed) this.onOutfitChange?.(actor);
        else if (act.originalLooks) actor.look = act.originalLooks[i];
      }
    }
  }

  /** The camera framing the playing action asks for, with its focus resolved to a floor point. */
  get framing(): { zoom: number; height: number | null; offset: Vec; focus: Vec | null } | null {
    const act = this.activity;
    const cam = act?.state === "playing" ? act.def.camera : undefined;
    if (!act || !cam) return null;
    const focus: Vec | null = cam.focus === "target" && act.target ? [act.target.x + act.target.w / 2, act.target.y + act.target.h / 2]
      : cam.focus === "people" ? [act.members.reduce((n, m) => n + m.actor.x, 0) / act.members.length, act.members.reduce((n, m) => n + m.actor.y, 0) / act.members.length] : null;
    return { zoom: cam.zoom ?? 1, height: cam.height ?? null, offset: cam.offset ?? [0, 0], focus };
  }

  /** How big a body is next to an adult (1), from the age it is drawn as: sizes anchored distances. */
  private sizeOf(actor: Actor): number {
    return AGES[actor.look.age].height / AGES.adult.height;
  }

  /** The anchored roles' members, each after the one it is anchored to. */
  private anchorOrder(def: Interaction, members: Activity["members"]): Activity["members"] {
    const done: Activity["members"] = [];
    const todo = members.filter((m) => def.anchors?.[m.role]);
    for (let guard = 0; todo.length && guard < 16; guard++) {
      const i = todo.findIndex((m) => !todo.some((o) => o !== m && o.role === def.anchors![m.role].role));
      done.push(...todo.splice(i < 0 ? 0 : i, 1));
    }
    return done;
  }

  private updateActivity() {
    const act = this.activity!;
    const { def, members } = act;
    if (interactionPolicyProblem(def, members.map((m) => m.actor))) return this.stopActivity();
    if (act.state === "gathering") {
      const waiting = members.filter((m) => m.actor.path.length);
      if (act.placements && waiting.length && this.t - act.since >= 20) {
        this.onToast?.("Couldn't reach the furniture. Try again with a clear path.");
        return this.stopActivity();
      }
      // Start when everyone has arrived, or after 12 s without the stragglers.
      if (waiting.length && (act.placements || this.t - act.since < 12)) return;
      for (const m of waiting) m.actor.path = [];
      for (const m of members) m.start = [m.actor.x, m.actor.y];
      act.state = "playing";
      act.since = this.t;
      if (act.target) {
        for (const [i, { actor }] of members.entries()) {
          const rest = act.placements?.[i].rest;
          if (rest) actor.rest = { ...rest };
        }
      }
    }
    const elapsed = (this.t - act.since) / def.beat;
    const stagger = def.stagger ?? 0;
    if (!act.outfitApplied && act.outfit && def.outfitAt !== undefined && elapsed >= def.outfitAt) {
      for (const { actor } of members) actor.look = { ...actor.look, ...applyOutfit(act.outfit, actor.look.wearing) };
      act.outfitApplied = true;
    }
    if (def.wardrobe && act.originalLooks && !act.dressed) {
      const active = elapsed >= def.wardrobe.at && elapsed < def.wardrobe.restoreAt;
      if (active && !act.wardrobeApplied) {
        const outfit = def.wardrobe.outfitId ? OUTFITS.find((outfit) => outfit.id === def.wardrobe!.outfitId)! : null;
        for (const [i, { actor }] of members.entries()) {
          const previous = act.originalLooks[i];
          let look = previous;
          if (outfit) {
            const wearing = def.wardrobe.preferUnderlayers ? underwearOf(previous, outfit.wearing) : outfit.wearing;
            look = { ...previous, ...applyOutfit({ ...outfit, wearing }) };
          }
          if (def.wardrobe.remove) {
            const regions = def.wardrobe.remove;
            const wearing = outfitOf(look).filter((w) => !garment(w.garment)?.covers.some((region) => regions.includes(region)));
            look = { ...look, wearing, ...legacyFields(wearing) };
          }
          actor.look = look;
        }
      } else if (!active && act.wardrobeApplied) {
        for (const [i, { actor }] of members.entries()) actor.look = act.originalLooks[i];
      }
      act.wardrobeApplied = active;
    }
    if (!def.loop && elapsed > lengthOf(def) + stagger * (members.length - 1) + 0.3) return this.stopActivity(true);
    const spots = this.formationAt(act, elapsed);
    const settle = Math.min(1, (this.t - act.since) / 0.5);
    const placed = new Map<(typeof members)[number], { pos: Vec; face: Vec; pose: FullPose }>();
    for (const m of members) {
      const beat = elapsed - stagger * m.index;
      const pose = poseAt(def, m.role, def.loop ? beat : Math.max(0, beat));
      const { at, facing } = spots[m.index];
      const right = rightOf(facing);
      placed.set(m, { pos: [at[0] + pose.move[0] * right[0] + pose.move[1] * facing[0], at[1] + pose.move[0] * right[1] + pose.move[1] * facing[1]], face: rotate(facing, pose.turn), pose });
    }
    // Roles anchored to another role are placed after it, wherever it is this frame.
    const lifts = new Map<(typeof members)[number], number>();
    for (const m of this.anchorOrder(def, members)) {
      const spec = def.anchors![m.role];
      const base = members.find((o) => o !== m && o.role === spec.role);
      if (!base) continue;
      const from = placed.get(base)!, mine = placed.get(m)!;
      const f = from.face, r = rightOf(f);
      const distance = spec.distance ?? 0.28 * (this.sizeOf(m.actor) + this.sizeOf(base.actor));
      const side: Vec = { front: f, behind: [-f[0], -f[1]] as Vec, right: r, left: [-r[0], -r[1]] as Vec, over: [0, 0] as Vec }[spec.at];
      mine.pos = [from.pos[0] + side[0] * distance, from.pos[1] + side[1] * distance];
      mine.face = rotate(f, (spec.angle ?? (spec.at === "front" ? 180 : 0)) + mine.pose.turn);
      lifts.set(m, (spec.lift ?? 0) + (lifts.get(base) ?? 0));
    }
    for (const m of members) {
      const { pos, face, pose } = placed.get(m)!;
      const a = m.actor;
      a.x = m.start[0] + (pos[0] - m.start[0]) * settle;
      a.y = m.start[1] + (pos[1] - m.start[1]) * settle;
      a.facing = facingOfVec(face);
      a.yaw = yawOf(face);
      a.lift = lifts.get(m) ?? 0;
      a.pose = pose;
      a.held = pose.held || null;
      a.hidden = (this.presentation?.opacity ?? 0) >= 1;
    }
  }
}
