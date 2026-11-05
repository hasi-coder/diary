// A place's walkable layout for the Places world: rooms on a 1 m grid, doors and
// partitions on cell edges, furniture on cells. Stored as `Profile.layout`; an
// agent can set it over MCP ("set_place_layout").
//
// x grows to the right and y grows DOWN, as on a drawing. An edge key names a
// cell side: `h:x:y` is the north side of cell (x, y), `v:x:y` its west side.
// Walls are wherever two rooms (or a room and the outside) meet; doors and
// arches replace them, and partitions add low walls inside a room (cubicles,
// fitting rooms).

export type Facing = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
export type ItemFacing = "N" | "S" | "E" | "W";
export type Cell = [number, number];

export interface Layout {
  version: 2;
  name?: string;
  floors: Floor[];
}

export interface Floor {
  name: string;
  width: number;
  depth: number;
  /** Where people come in. */
  entrance: Cell;
  /** Where the diary author starts. */
  spawn?: { at: Cell; facing?: Facing };
  rooms: Room[];
  doors: Door[];
  partitions?: string[];
  items: Item[];
  /** Where people go: residents (home), staff (work), and a post's group (visit). */
  spots?: Partial<Record<SpotRole, Spot[]>>;
}

export interface Room {
  name: string;
  /** [x1, y1, x2, y2], x2 and y2 exclusive. */
  rect: [number, number, number, number];
  floor?: string;
  /** Tiles: alternate cells a shade darker. */
  checker?: boolean;
}

export interface Door {
  edge: string;
  /** An arch is an opening with no leaf. */
  kind?: "door" | "arch";
  name?: string;
  locked?: boolean;
  /** A cubicle or fitting-room door: as high as its partitions. */
  partition?: boolean;
  /** The seat behind this door (a toilet, a fitting-room bench): it locks while someone uses it. */
  cubicle?: Cell;
}

export interface Item {
  kind: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** The way a seated person (or the item's front) faces. */
  facing?: ItemFacing;
  color?: string;
}

export type SpotRole = "home" | "work" | "visit";
export type Spot = { seat: Cell } | { cell: Cell; facing?: Facing };

// ── Catalogue ────────────────────────────────────────────────────────────────

/** [u0, v0, u1, v1, z0, z1, colour]: u across the item, v from its back (0) to its front (1), z up, in metres. */
export type Part = [number, number, number, number, number, number, string];

export interface ItemKind {
  label: string;
  group: string;
  color: string;
  /** What people do with it, for the catalogue. */
  act?: string;
  /** Seat height: every cell of the item is a seat. */
  seat?: number;
  /** Lies on the floor and doesn't block walking (rugs). */
  flat?: boolean;
  /** A round top at this height (plants). */
  blob?: number;
  /** The boxes it's made of; `length` is its width in cells along u. */
  parts: (color: string, length: number) => Part[];
}

const WOOD = "#a9784f";
const STEEL = "#57534e";

export const ITEM_KINDS: Record<string, ItemKind> = {
  chair: { label: "Chair", group: "Seating", seat: 0.47, color: "#c2410c", act: "sit", parts: (c) => [[0.42, 0.42, 0.58, 0.58, 0, 0.4, STEEL], [0.18, 0.18, 0.82, 0.82, 0.4, 0.47, c], [0.18, 0.1, 0.82, 0.22, 0.47, 0.98, c]] },
  armchair: { label: "Armchair", group: "Seating", seat: 0.42, color: "#0f766e", act: "sit", parts: (c) => [[0.06, 0.08, 0.94, 0.96, 0, 0.42, c], [0.06, 0.04, 0.94, 0.3, 0.42, 0.9, c], [0.06, 0.3, 0.22, 0.96, 0.42, 0.62, c], [0.78, 0.3, 0.94, 0.96, 0.42, 0.62, c]] },
  sofa: {
    label: "Sofa",
    group: "Seating",
    seat: 0.42,
    color: "#4f46e5",
    act: "sit, one per seat",
    parts: (c, length) => {
      const arm = 0.18 / length;
      return [[0.02, 0.08, 0.98, 0.96, 0, 0.42, c], [0.02, 0.04, 0.98, 0.3, 0.42, 0.9, c], [0.02, 0.3, 0.02 + arm, 0.96, 0.42, 0.62, c], [0.98 - arm, 0.3, 0.98, 0.96, 0.42, 0.62, c]];
    },
  },
  bench: { label: "Bench", group: "Seating", seat: 0.45, color: WOOD, act: "sit", parts: (c) => [[0.1, 0.35, 0.2, 0.65, 0, 0.4, STEEL], [0.8, 0.35, 0.9, 0.65, 0, 0.4, STEEL], [0.04, 0.25, 0.96, 0.75, 0.4, 0.47, c]] },
  table: { label: "Table", group: "Tables", color: WOOD, act: "sit at, with chairs", parts: (c) => [[0.12, 0.12, 0.2, 0.2, 0, 0.72, STEEL], [0.8, 0.12, 0.88, 0.2, 0, 0.72, STEEL], [0.12, 0.8, 0.2, 0.88, 0, 0.72, STEEL], [0.8, 0.8, 0.88, 0.88, 0, 0.72, STEEL], [0.04, 0.04, 0.96, 0.96, 0.72, 0.79, c]] },
  coffee: { label: "Coffee table", group: "Tables", color: "#78350f", parts: (c) => [[0.12, 0.15, 0.88, 0.85, 0, 0.36, c], [0.08, 0.1, 0.92, 0.9, 0.36, 0.42, c]] },
  desk: { label: "Desk", group: "Tables", color: "#d6c3a5", act: "sit and work", parts: (c) => [[0.04, 0.1, 0.3, 0.9, 0, 0.74, "#a8a29e"], [0.04, 0.06, 0.96, 0.94, 0.74, 0.8, c], [0.55, 0.2, 0.75, 0.35, 0.8, 1.15, "#111827"]] },
  counter: { label: "Counter", group: "Tables", color: "#64748b", act: "serve, queue", parts: (c) => [[0.02, 0.1, 0.98, 0.92, 0, 1, c], [0, 0.06, 1, 0.96, 1, 1.06, "#e5e7eb"]] },
  bed: { label: "Bed", group: "Bedroom", color: "#60a5fa", act: "lie, sit on the edge", parts: (c) => [[0.04, 0.02, 0.96, 0.98, 0, 0.32, WOOD], [0.04, 0, 0.96, 0.06, 0.32, 0.9, WOOD], [0.07, 0.05, 0.93, 0.96, 0.32, 0.5, "#f8fafc"], [0.15, 0.08, 0.85, 0.2, 0.5, 0.6, "#ffffff"], [0.07, 0.4, 0.93, 0.96, 0.5, 0.54, c]] },
  bedside: { label: "Bedside table", group: "Bedroom", color: WOOD, parts: (c) => [[0.15, 0.15, 0.85, 0.85, 0, 0.55, c], [0.4, 0.35, 0.6, 0.55, 0.55, 0.85, "#fde68a"]] },
  wardrobe: { label: "Wardrobe", group: "Bedroom", color: "#8b5e3c", act: "open", parts: (c) => [[0.04, 0.04, 0.96, 0.62, 0, 2, c]] },
  hbed: { label: "Hospital bed", group: "Health", color: "#7dd3fc", act: "lie", parts: (c) => [[0.08, 0.04, 0.92, 0.96, 0, 0.5, "#cbd5e1"], [0.08, 0.04, 0.92, 0.08, 0.5, 1, "#cbd5e1"], [0.1, 0.06, 0.9, 0.94, 0.5, 0.62, c]] },
  couch: { label: "Exam couch", group: "Health", color: "#38bdf8", act: "lie for a check-up", parts: (c) => [[0.15, 0.05, 0.85, 0.95, 0, 0.55, "#cbd5e1"], [0.1, 0.02, 0.9, 0.98, 0.55, 0.68, c], [0.1, 0.02, 0.9, 0.25, 0.68, 0.9, c]] },
  cooler: { label: "Water cooler", group: "Health", color: "#e0f2fe", act: "drink", parts: (c) => [[0.28, 0.28, 0.72, 0.72, 0, 1.05, c], [0.33, 0.33, 0.67, 0.67, 1.05, 1.45, "#7dd3fc"]] },
  cabinet: { label: "Medicine cabinet", group: "Health", color: "#f1f5f9", act: "open", parts: (c) => [[0.06, 0.04, 0.94, 0.45, 0, 1.6, c]] },
  toilet: { label: "Toilet", group: "Bathroom", seat: 0.42, color: "#ffffff", act: "sit (its cubicle locks)", parts: (c) => [[0.22, 0.04, 0.78, 0.28, 0, 0.85, "#f1f5f9"], [0.26, 0.28, 0.74, 0.86, 0, 0.42, c]] },
  sink: { label: "Sink", group: "Bathroom", color: "#ffffff", act: "wash hands", parts: (c) => [[0.4, 0.12, 0.6, 0.35, 0, 0.8, "#e2e8f0"], [0.18, 0.04, 0.82, 0.55, 0.8, 0.9, c]] },
  bath: { label: "Bath", group: "Bathroom", color: "#ffffff", act: "bathe", parts: (c) => [[0.03, 0.08, 0.97, 0.92, 0, 0.55, c], [0.1, 0.16, 0.9, 0.84, 0.55, 0.56, "#bae6fd"]] },
  shower: { label: "Shower", group: "Bathroom", color: "#bae6fd", act: "shower", parts: (c) => [[0.04, 0.04, 0.96, 0.96, 0, 0.08, "#f1f5f9"], [0.04, 0.04, 0.96, 0.1, 0.08, 2.1, c], [0.75, 0.08, 0.8, 0.35, 1.95, 2.0, STEEL], [0.65, 0.25, 0.9, 0.5, 1.9, 1.95, STEEL]] },
  fridge: { label: "Fridge", group: "Kitchen", color: "#f8fafc", act: "open", parts: (c) => [[0.08, 0.06, 0.92, 0.8, 0, 1.85, c]] },
  stove: { label: "Stove", group: "Kitchen", color: "#475569", act: "cook", parts: (c) => [[0.04, 0.08, 0.96, 0.92, 0, 0.88, c], [0.04, 0.08, 0.96, 0.92, 0.88, 0.92, "#1e293b"]] },
  kcounter: { label: "Kitchen unit", group: "Kitchen", color: "#e7e5e4", act: "prepare food", parts: (c) => [[0.02, 0.08, 0.98, 0.92, 0, 0.86, "#a8a29e"], [0, 0.04, 1, 0.96, 0.86, 0.92, c]] },
  tv: { label: "TV", group: "Living", color: "#111827", act: "watch, from a seat", parts: (c) => [[0.06, 0.35, 0.94, 0.7, 0, 0.48, WOOD], [0.1, 0.46, 0.9, 0.56, 0.48, 1.15, c]] },
  shelf: { label: "Bookshelf", group: "Living", color: "#92400e", act: "take a book", parts: (c) => [[0.04, 0.04, 0.96, 0.42, 0, 1.8, c]] },
  plant: { label: "Plant", group: "Living", color: "#16a34a", blob: 0.85, parts: () => [[0.32, 0.32, 0.68, 0.68, 0, 0.35, "#b45309"]] },
  rug: { label: "Rug", group: "Living", color: "#e11d48", flat: true, parts: (c) => [[0.02, 0.02, 0.98, 0.98, 0, 0.02, c]] },
  rack: {
    label: "Clothes rack",
    group: "Shop",
    color: "#94a3b8",
    act: "browse",
    parts: (c, length) => {
      // Two posts and a rail, with clothes hanging every 14 cm.
      const post = 0.06 / length;
      const clothes = ["#db2777", "#f59e0b", "#16a34a", "#2563eb", "#9333ea", "#ef4444", "#0d9488"];
      const n = Math.floor((length - 0.2) / 0.14);
      const hanging: Part[] = Array.from({ length: n }, (_, i) => {
        const u = (0.1 + i * 0.14) / length;
        return [u, 0.3, u + 0.09 / length, 0.7, 0.55, 1.45, clothes[i % clothes.length]];
      });
      return [[0.02, 0.45, 0.02 + post, 0.55, 0, 1.6, c], [0.98 - post, 0.45, 0.98, 0.55, 0, 1.6, c], [0.02, 0.47, 0.98, 0.53, 1.5, 1.55, c], ...hanging];
    },
  },
  mirror: { label: "Mirror", group: "Shop", color: "#bfdbfe", act: "check the fit", parts: (c) => [[0.1, 0.02, 0.9, 0.1, 0, 1.9, "#94a3b8"], [0.16, 0.1, 0.84, 0.13, 0.12, 1.8, c]] },
  till: { label: "Till counter", group: "Shop", color: "#334155", act: "pay", parts: (c) => [[0.02, 0.1, 0.98, 0.92, 0, 1, c], [0.3, 0.3, 0.7, 0.6, 1, 1.3, "#111827"]] },
};

export const ITEM_GROUPS = [...new Set(Object.values(ITEM_KINDS).map((k) => k.group))];

// ── Directions ───────────────────────────────────────────────────────────────

export const DIRS: Record<Facing, Cell> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };

export function dirOf(dx: number, dy: number): Facing | null {
  const d = (dy < 0 ? "N" : dy > 0 ? "S" : "") + (dx > 0 ? "E" : dx < 0 ? "W" : "");
  return (d || null) as Facing | null;
}

/** The edge between two cells side by side. */
export const edgeKey = (ax: number, ay: number, bx: number, by: number) => (ay === by ? `v:${Math.max(ax, bx)}:${ay}` : `h:${ax}:${Math.max(ay, by)}`);

export function parseEdge(key: string): { horizontal: boolean; x: number; y: number } {
  const [t, x, y] = key.split(":");
  return { horizontal: t === "h", x: Number(x), y: Number(y) };
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Problems that stop a layout from loading; [] when it's usable. */
export function layoutProblems(value: unknown): string[] {
  const out: string[] = [];
  const v = value as Partial<Layout> | null;
  if (!v || typeof v !== "object") return ["A layout is a JSON object."];
  if (!Array.isArray(v.floors) || v.floors.length === 0) return ["A layout needs a \"floors\" list with at least one floor."];
  v.floors.forEach((f, i) => {
    const name = `Floor ${i + 1}`;
    if (!(f?.width > 0 && f?.depth > 0 && f.width <= 80 && f.depth <= 80)) out.push(`${name}: width and depth must be 1 to 80 cells.`);
    if (!Array.isArray(f?.rooms) || f.rooms.length === 0) out.push(`${name}: add at least one room.`);
    if (!Array.isArray(f?.entrance)) out.push(`${name}: set an entrance cell.`);
    for (const r of f?.rooms ?? []) if (!Array.isArray(r.rect) || r.rect.length !== 4) out.push(`${name}: room "${r.name}" needs a rect [x1, y1, x2, y2].`);
    for (const d of f?.doors ?? []) if (!/^[hv]:\d+:\d+$/.test(d.edge ?? "")) out.push(`${name}: door edge "${d.edge}" should look like "h:3:12".`);
    for (const it of f?.items ?? []) if (!ITEM_KINDS[it.kind]) out.push(`${name}: unknown item "${it.kind}".`);
  });
  return out;
}

export function parseLayout(value: unknown): Layout | null {
  return layoutProblems(value).length ? null : (value as Layout);
}

// ── The built place: what walking and drawing work from ─────────────────────

export interface DoorState extends Door {
  open: boolean;
  locked: boolean;
  occupied: boolean;
  /** Opened by a click: stays open until clicked again. */
  manual: boolean;
  /** When someone last went through (seconds of world time). */
  t: number;
  /** A cubicle waiting for the people walking in before it locks. */
  pending: number | null;
  pendingBy?: string;
  /** Cubicles: the cells behind the door. */
  cells?: Cell[];
}

export interface Edge {
  type: "wall" | "door";
  /** Between a room and the outside. */
  exterior: boolean;
  partition: boolean;
  door?: DoorState;
}

export interface PlacedItem extends Required<Omit<Item, "color">> {
  color: string;
  spec: ItemKind;
}

export interface Seat {
  x: number;
  y: number;
  facing: ItemFacing;
  item: PlacedItem;
  z: number;
  /** Who sits there, and who is on the way. */
  occupant: string | null;
  reserved: string | null;
}

export interface Place {
  floor: Floor;
  width: number;
  depth: number;
  /** Room index per cell, -1 outside. */
  room: number[][];
  edges: Map<string, Edge>;
  doors: DoorState[];
  items: PlacedItem[];
  block: boolean[][];
  seats: Seat[];
}

export function buildPlace(floor: Floor): Place {
  const W = floor.width;
  const H = floor.depth;
  const room = Array.from({ length: H }, () => Array<number>(W).fill(-1));
  floor.rooms.forEach((r, i) => {
    const [x1, y1, x2, y2] = r.rect;
    for (let y = Math.max(0, y1); y < Math.min(H, y2); y++) for (let x = Math.max(0, x1); x < Math.min(W, x2); x++) room[y][x] = i;
  });
  const rid = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : room[y][x]);
  const edges = new Map<string, Edge>();
  for (let y = 0; y <= H; y++)
    for (let x = 0; x < W; x++) {
      const a = rid(x, y - 1);
      const b = rid(x, y);
      if (a !== b) edges.set(`h:${x}:${y}`, { type: "wall", exterior: a < 0 || b < 0, partition: false });
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x <= W; x++) {
      const a = rid(x - 1, y);
      const b = rid(x, y);
      if (a !== b) edges.set(`v:${x}:${y}`, { type: "wall", exterior: a < 0 || b < 0, partition: false });
    }
  for (const k of floor.partitions ?? []) edges.set(k, { type: "wall", exterior: false, partition: true });
  const doors: DoorState[] = (floor.doors ?? []).map((d) => ({ ...d, open: false, locked: !!d.locked, occupied: false, manual: false, t: 0, pending: null }));
  for (const d of doors) {
    const existing = edges.get(d.edge);
    if (d.kind === "arch") edges.delete(d.edge);
    else edges.set(d.edge, { type: "door", exterior: existing?.exterior ?? false, partition: !!d.partition, door: d });
  }
  const block = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
  const seats: Seat[] = [];
  const items: PlacedItem[] = [];
  for (const it of floor.items ?? []) {
    const spec = ITEM_KINDS[it.kind];
    if (!spec) continue;
    const placed: PlacedItem = { w: 1, h: 1, facing: "S", ...it, color: it.color ?? spec.color, spec };
    for (let y = placed.y; y < placed.y + placed.h; y++)
      for (let x = placed.x; x < placed.x + placed.w; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (spec.seat) seats.push({ x, y, facing: placed.facing, item: placed, z: spec.seat, occupant: null, reserved: null });
        else if (!spec.flat) block[y][x] = true;
      }
    items.push(placed);
  }
  return { floor, width: W, depth: H, room, edges, doors, items, block, seats };
}

export const seatAt = (place: Place, x: number, y: number) => place.seats.find((s) => s.x === x && s.y === y);
export const roomAt = (place: Place, x: number, y: number) => place.floor.rooms[place.room[y]?.[x] ?? -1];

/** Whether someone can stand in a cell. Seats only count as the end of a walk. */
export function walkable(place: Place, x: number, y: number, goal = false): boolean {
  if (x < 0 || y < 0 || x >= place.width || y >= place.depth || place.room[y][x] < 0 || place.block[y][x]) return false;
  const s = seatAt(place, x, y);
  if (s) return goal && !s.occupant;
  return true;
}

/** One step, straight or diagonal. Diagonals never cut a corner or squeeze past a wall or door. */
export function stepOK(place: Place, ax: number, ay: number, bx: number, by: number, goal = false): boolean {
  if (!walkable(place, bx, by, goal)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx && dy) {
    if (!walkable(place, ax + dx, ay) || !walkable(place, ax, ay + dy)) return false;
    return ![edgeKey(ax, ay, ax + dx, ay), edgeKey(ax, ay, ax, ay + dy), edgeKey(ax + dx, ay, bx, by), edgeKey(ax, ay + dy, bx, by)].some((k) => place.edges.has(k));
  }
  const e = place.edges.get(edgeKey(ax, ay, bx, by));
  return !e || (e.type === "door" && !e.door!.locked);
}

/** A* over cells; the path excludes the start. Null when there's no way. */
export function findPath(place: Place, sx: number, sy: number, tx: number, ty: number): Cell[] | null {
  const W = place.width;
  const key = (x: number, y: number) => y * W + x;
  const goal = key(tx, ty);
  const h = (x: number, y: number) => {
    const a = Math.abs(x - tx);
    const b = Math.abs(y - ty);
    return Math.max(a, b) + 0.41 * Math.min(a, b);
  };
  const g = new Map([[key(sx, sy), 0]]);
  const f = new Map([[key(sx, sy), h(sx, sy)]]);
  const from = new Map<number, number>();
  const open = new Set([key(sx, sy)]);
  const steps = Object.values(DIRS);
  while (open.size) {
    let k = -1;
    for (const o of open) if (k < 0 || f.get(o)! < f.get(k)!) k = o;
    open.delete(k);
    const x = k % W;
    const y = Math.floor(k / W);
    if (k === goal) {
      const path: Cell[] = [];
      for (let c = k; from.has(c); c = from.get(c)!) path.unshift([c % W, Math.floor(c / W)]);
      return path;
    }
    for (const [dx, dy] of steps) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = key(nx, ny);
      if (!stepOK(place, x, y, nx, ny, nk === goal)) continue;
      const ng = g.get(k)! + (dx && dy ? 1.41 : 1);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        from.set(nk, k);
        f.set(nk, ng + h(nx, ny));
        open.add(nk);
      }
    }
  }
  return null;
}

/** The door that closes the cubicle (or fitting room) a seat is in. */
export const cubicleOf = (place: Place, seat: Seat | null | undefined) =>
  seat ? place.doors.find((d) => d.cubicle && d.cubicle[0] === seat.x && d.cubicle[1] === seat.y) : undefined;

/** The cells behind a cubicle's door: everything reachable from its seat without crossing a wall or door. */
export function cubicleCells(place: Place, door: DoorState): Cell[] {
  if (door.cells) return door.cells;
  const start = door.cubicle!;
  const seen = new Set([start.join()]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= place.width || ny >= place.depth || place.room[ny][nx] < 0 || seen.has(`${nx},${ny}`) || place.edges.has(edgeKey(x, y, nx, ny))) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return (door.cells = [...seen].map((k) => k.split(",").map(Number) as Cell));
}

/** u/v in an item's own frame (u across, v back to front) → [x0, y0, x1, y1] on the plan. */
export function itemRect(it: PlacedItem, u0: number, v0: number, u1: number, v1: number): [number, number, number, number] {
  const { x, y, w, h, facing } = it;
  if (facing === "S") return [x + u0 * w, y + v0 * h, x + u1 * w, y + v1 * h];
  if (facing === "N") return [x + w - u1 * w, y + h - v1 * h, x + w - u0 * w, y + h - v0 * h];
  if (facing === "E") return [x + v0 * w, y + h - u1 * h, x + v1 * w, y + h - u0 * h];
  return [x + w - v1 * w, y + u0 * h, x + w - v0 * w, y + u1 * h];
}

/** An item's boxes on the plan: [x0, y0, x1, y1, z0, z1, colour]. */
export function itemBoxes(it: PlacedItem): Part[] {
  const length = it.facing === "S" || it.facing === "N" ? it.w : it.h;
  return it.spec.parts(it.color, length).map((p) => [...itemRect(it, p[0], p[1], p[2], p[3]), p[4], p[5], p[6]]);
}
