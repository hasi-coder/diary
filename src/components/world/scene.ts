// three.js for the Places world: a place as smooth low-poly meshes (floors,
// walls that drop when they'd hide you, doors that swing, furniture), and
// people as small bodies with a head image that turns to the camera.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AGES, type FaceView } from "../../lib/places/character";
import { DIRS, itemBoxes, parseEdge, type DoorState, type Place, type PlacedItem } from "../../lib/places/layout";
import type { Actor } from "../../lib/places/world";
import { outfitOf } from "../../lib/places/garments";
import { Body, loadBody, loadedBody, shapeOf, type Limbs } from "./body";
import { drawnHead, photoHead } from "./faces";

export const WALL = 2.4;
const LOW = 0.3;
const PARTITION = 1.9;
const DOOR = 2.05;
const THICK = 0.1;

export type WallMode = "cut" | "up" | "down";

/** What a click landed on. */
export type Pick =
  | { kind: "actor"; id: string }
  | { kind: "door"; door: DoorState }
  | { kind: "item"; item: PlacedItem; x: number; y: number }
  | { kind: "floor"; x: number; y: number };

// ── Materials and geometry, shared ──────────────────────────────────────────

const materials = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(extra);
  let m = materials.get(key);
  if (!m) materials.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra })));
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function rounded(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = Math.min(0.035, w / 2.2, h / 2.2, d / 2.2);
  return r < 0.006 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
}

function shadowed<T extends THREE.Object3D>(o: T, cast = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** A text label on a canvas, as a sprite that always faces the camera. */
export function textSprite(text: string, opts: { height?: number; bg?: string; fg?: string; weight?: number } = {}): THREE.Sprite {
  const { height = 0.42, bg = "rgba(17,24,39,0.62)", fg = "#ffffff", weight = 600 } = opts;
  const px = 44;
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d")!;
  c.font = `${weight} ${px}px Inter, -apple-system, "Segoe UI", sans-serif`;
  const w = Math.ceil(c.measureText(text).width) + px;
  canvas.width = w;
  canvas.height = Math.round(px * 1.6);
  c.font = `${weight} ${px}px Inter, -apple-system, "Segoe UI", sans-serif`;
  c.fillStyle = bg;
  c.beginPath();
  c.roundRect(0, 0, w, canvas.height, canvas.height / 2);
  c.fill();
  c.fillStyle = fg;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, w / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set((height * w) / canvas.height, height, 1);
  sprite.renderOrder = 10;
  sprite.raycast = () => {};
  return sprite;
}

// ── The place ────────────────────────────────────────────────────────────────

interface WallView {
  horizontal: boolean;
  x: number;
  y: number;
  full: number;
  exterior: boolean;
  /** The wall itself, or a door's posts and lintel. */
  pieces: { mesh: THREE.Mesh; from: number; to: number | "top" }[];
  door?: { state: DoorState; pivot: THREE.Group; leaf: THREE.Mesh; light: THREE.Mesh; angle: number };
}

export interface PlaceView {
  group: THREE.Group;
  labels: THREE.Group;
  /** Lowers walls between the camera and the author; swings doors. */
  update(opts: { walls: WallMode; author: [number, number] | null; azimuth: number; dt: number }): void;
  dispose(): void;
}

function shadeHex(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  return "#" + (f >= 0 ? c.lerp(new THREE.Color("#ffffff"), f) : c.multiplyScalar(1 + f)).getHexString();
}

export function buildPlace(place: Place): PlaceView {
  const group = new THREE.Group();
  const { width: W, depth: H, floor } = place;

  // Floors: one mesh, a coloured square per cell (tiles alternate).
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = place.room[y][x];
      if (r < 0) continue;
      const room = floor.rooms[r];
      const base = room.floor ?? "#d6d3d1";
      color.set(room.checker && (x + y) % 2 ? shadeHex(base, -0.05) : base);
      for (const [px, pz] of [[x, y], [x, y + 1], [x + 1, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        positions.push(px, 0, pz);
        colors.push(color.r, color.g, color.b);
      }
    }
  const floorGeometry = new THREE.BufferGeometry();
  floorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  floorGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  floorGeometry.computeVertexNormals();
  const floorMesh = new THREE.Mesh(floorGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  floorMesh.receiveShadow = true;
  floorMesh.userData.pick = "floor";
  group.add(floorMesh);
  // A slab under the building, so it reads as a model on a table.
  const slab = new THREE.Mesh(unitBox, material("#8a6a52"));
  slab.scale.set(W + 0.2, 0.25, H + 0.2);
  slab.position.set(W / 2, -0.126, H / 2);
  group.add(slab);

  // Walls and doors, one view per edge.
  const walls: WallView[] = [];
  const box = (c: string) => {
    const m = new THREE.Mesh(unitBox, material(c));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  for (const [key, edge] of place.edges) {
    const { horizontal, x, y } = parseEdge(key);
    const full = edge.partition ? PARTITION : WALL;
    const c = edge.partition ? "#d1d5db" : edge.exterior ? "#c08463" : "#efe7da";
    const view: WallView = { horizontal, x, y, full, exterior: edge.exterior, pieces: [] };
    if (edge.type === "wall") {
      view.pieces.push({ mesh: box(c), from: 0, to: 1 });
    } else {
      const d = edge.door!;
      view.pieces.push({ mesh: box(c), from: 0, to: 0.06 }, { mesh: box(c), from: 0.94, to: 1 }, { mesh: box(c), from: 0.06, to: "top" });
      const pivot = new THREE.Group();
      pivot.position.set(x, 0, y);
      const leaf = new THREE.Mesh(unitBox, material("#9a6b43"));
      leaf.castShadow = true;
      leaf.userData.pick = d;
      pivot.add(leaf);
      group.add(pivot);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), material("#22c55e", { emissive: "#16a34a", emissiveIntensity: 0.6 }));
      light.userData.pick = d;
      group.add(light);
      view.door = { state: d, pivot, leaf, light, angle: 0 };
    }
    walls.push(view);
  }

  // Furniture.
  for (const it of place.items) {
    const g = new THREE.Group();
    for (const [x0, y0, x1, y1, z0, z1, c] of itemBoxes(it)) {
      const m = new THREE.Mesh(rounded(x1 - x0, Math.max(0.01, z1 - z0), y1 - y0), material(c));
      m.position.set((x0 + x1) / 2, (z0 + z1) / 2 + (it.spec.flat ? 0.004 : 0), (y0 + y1) / 2);
      g.add(m);
    }
    if (it.spec.blob) {
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), material(it.color, { flatShading: true }));
      leaves.position.set(it.x + 0.5, it.spec.blob, it.y + 0.5);
      g.add(leaves);
    }
    g.userData.pick = it;
    group.add(shadowed(g, !it.spec.flat));
  }

  // Room names on the floor.
  const labels = new THREE.Group();
  for (const r of floor.rooms) {
    const [x1, y1, x2, y2] = r.rect;
    const s = textSprite(r.name, { height: 0.42 });
    s.position.set((x1 + x2) / 2, 0.1, (y1 + y2) / 2);
    labels.add(s);
  }
  group.add(labels);

  const red = material("#ef4444", { emissive: "#dc2626", emissiveIntensity: 0.7 });
  const green = material("#22c55e", { emissive: "#16a34a", emissiveIntensity: 0.6 });
  const leafWood = material("#9a6b43");
  const leafBusy = material("#b45353");

  return {
    group,
    labels,
    update({ walls: mode, author, azimuth, dt }) {
      const sx = Math.cos(azimuth) >= 0 ? 1 : -1;
      const sz = Math.sin(azimuth) >= 0 ? 1 : -1;
      const [ax, ay] = author ?? [-99, -99];
      for (const w of walls) {
        const front = author !== null && (w.horizontal ? (sz > 0 ? w.y > ay : w.y <= ay) : sx > 0 ? w.x > ax : w.x <= ax);
        const h = mode === "up" ? w.full : mode === "down" ? (w.exterior && !front ? w.full : LOW) : front ? LOW : w.full;
        const thick = w.full === PARTITION ? THICK * 0.6 : THICK;
        const doorTop = Math.min(DOOR, h);
        for (const p of w.pieces) {
          const from = p.to === "top" ? doorTop : 0;
          const to = h;
          const along0 = p.to === "top" ? 0.06 : p.from;
          const along1 = p.to === "top" ? 0.94 : p.to;
          const len = along1 - along0 + (p.to === 1 && p.from === 0 ? thick : 0);
          const height = Math.max(0.001, to - from);
          p.mesh.visible = to - from > 0.01;
          const mid = (along0 + along1) / 2;
          if (w.horizontal) {
            p.mesh.scale.set(len, height, thick);
            p.mesh.position.set(w.x + mid, from + height / 2, w.y);
          } else {
            p.mesh.scale.set(thick, height, len);
            p.mesh.position.set(w.x, from + height / 2, w.y + mid);
          }
        }
        if (w.door) {
          const { state, pivot, leaf, light } = w.door;
          const leafH = doorTop * 0.98;
          leaf.scale.set(0.88, leafH, 0.05);
          leaf.position.set(0.44, leafH / 2, 0);
          leaf.material = state.occupied ? leafBusy : leafWood;
          // Closed, the leaf lies along the edge; open, it swings 90° into the cell south (or east) of it.
          const closed = w.horizontal ? 0 : -Math.PI / 2;
          const target = state.open ? closed + (w.horizontal ? -Math.PI / 2 : Math.PI / 2) : closed;
          w.door.angle += (target - w.door.angle) * Math.min(1, dt * 10);
          if (Math.abs(target - w.door.angle) < 0.001) w.door.angle = target;
          pivot.rotation.y = w.door.angle;
          pivot.position.set(w.horizontal ? w.x + 0.06 : w.x, 0, w.horizontal ? w.y : w.y + 0.06);
          light.visible = state.locked || !!state.cubicle;
          light.material = state.locked ? red : green;
          light.position.set(w.horizontal ? w.x + 0.5 : w.x, Math.min(h, 1.95) + 0.2, w.horizontal ? w.y : w.y + 0.5);
        }
      }
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== unitBox) m.geometry.dispose();
        if ((o as THREE.Sprite).isSprite) {
          const sm = (o as THREE.Sprite).material;
          sm.map?.dispose();
          sm.dispose();
        }
      });
      floorMesh.material.dispose();
    },
  };
}

// ── People ───────────────────────────────────────────────────────────────────

/** Which head image shows: the angle between where someone faces and where the camera is. */
export function viewFor(facingAngle: number, azimuth: number): FaceView {
  let d = facingAngle - azimuth;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const deg = (d * 180) / Math.PI;
  if (Math.abs(deg) <= 30) return "front";
  if (Math.abs(deg) >= 120) return "back";
  return deg < 0 ? "right" : "left";
}


export class Figure {
  readonly group = new THREE.Group();
  /** The MakeHuman body once body.glb has loaded; until then (or if it can't load) the box body. */
  private skinned: Body | null = null;
  private disposed = false;
  private body = new THREE.Group();
  /** Torso, arms and neck: leans and tilts at the hips. */
  private upper = new THREE.Group();
  private thighs: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private head: THREE.Sprite;
  private textures = new Map<FaceView, THREE.Texture>();
  private tag: THREE.Sprite | null = null;
  private tagText = "";
  private emote: THREE.Sprite | null = null;
  private emoteText = "";
  /** Head height above the hips, and the forward stoop people stand with (elders). */
  private neckLength: number;
  private stoop: number;
  private ring: THREE.Mesh;
  private legLength: number;
  private angle = 0;
  private phase = Math.random() * 6;

  constructor(readonly actor: Actor) {
    const look = actor.look;
    const H = AGES[look.age].height;
    const s = H / 1.74;
    const leg = H * 0.45;
    const torso = H * 0.3;
    const headR = look.age === "child" ? 0.19 : look.age === "teen" ? 0.18 : 0.17;
    const bw = { slim: 0.3, average: 0.35, broad: 0.43 }[look.build] * (look.age === "child" ? 0.85 : 1) * (look.figure === "masculine" ? 1.06 : look.figure === "feminine" ? 0.95 : 1);
    this.legLength = leg;
    const skin = material(look.skin);
    const top = material(look.top);
    const bottom = material(look.bottom);
    const shoe = material("#292524");
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * bw * 0.24, leg, 0);
      const upper = new THREE.Mesh(rounded(0.12 * s, leg * 0.52, 0.13 * s), bottom);
      upper.position.y = -leg * 0.26;
      const knee = new THREE.Group();
      knee.position.y = -leg * 0.5;
      const lower = new THREE.Mesh(rounded(0.11 * s, leg * 0.5, 0.12 * s), bottom);
      lower.position.y = -leg * 0.25;
      const foot = new THREE.Mesh(rounded(0.12 * s, 0.07, 0.2 * s), shoe);
      foot.position.set(0, -leg * 0.48, 0.04);
      knee.add(lower, foot);
      thigh.add(upper, knee);
      this.thighs.push(thigh);
      this.knees.push(knee);
      this.body.add(thigh);
    }
    this.upper.position.y = leg;
    this.body.add(this.upper);
    const chest = new THREE.Mesh(rounded(bw, torso, 0.22 * s), top);
    chest.position.y = torso / 2;
    this.upper.add(chest);
    if (look.skirt) {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.48, bw * 0.66, leg * 0.5, 12), bottom);
      skirt.position.y = leg - leg * 0.22;
      this.body.add(skirt);
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * (bw / 2 + 0.05 * s), torso - 0.05, 0);
      // Forward first, then out to the side.
      arm.rotation.order = "ZXY";
      const sleeve = new THREE.Mesh(rounded(0.09 * s, torso * 0.85, 0.1 * s), top);
      sleeve.position.y = -torso * 0.42;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), skin);
      hand.position.y = -torso * 0.88;
      arm.add(sleeve, hand);
      this.arms.push(arm);
      this.upper.add(arm);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.08, 8), skin);
    neck.position.y = torso + 0.03;
    this.upper.add(neck);
    this.stoop = look.age === "elder" ? 0.08 : 0;
    this.neckLength = torso + headR * 0.95;
    shadowed(this.body);
    this.body.traverse((o) => (o.userData.pick = actor.id));

    this.head = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.head.scale.setScalar(headR / 0.36);
    this.head.position.y = leg + torso + headR * 0.95;
    this.head.userData.pick = actor.id;
    for (const view of ["front", "left", "right", "back"] as FaceView[]) {
      const t = new THREE.CanvasTexture(drawnHead(look, view, 128));
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(view, t);
      const photo = actor.profile.faces?.[view];
      if (photo)
        void photoHead(photo.id).then((canvas) => {
          if (!canvas) return;
          const pt = new THREE.CanvasTexture(canvas);
          pt.colorSpace = THREE.SRGBColorSpace;
          this.textures.get(view)?.dispose();
          this.textures.set(view, pt);
        });
    }

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 28), new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.016;
    this.group.add(shadow, this.ring, this.body, this.head);
    const ready = loadedBody();
    if (ready) this.useBody(new Body(ready));
    else
      loadBody().then(
        (asset) => !this.disposed && this.useBody(new Body(asset)),
        () => {},
      );
  }

  private useBody(body: Body) {
    const look = this.actor.look;
    body.setSkin(look.skin);
    const shape = shapeOf(look, this.actor.profile.birthday);
    body.setShape(shape);
    body.wear(outfitOf(look));
    body.showHead(false);
    // Scaled to the age's height (MakeHuman's children and teens run short), a
    // little taller toward masculine, and up to 10% either way by the height slider.
    const scale = (AGES[look.age].height * (0.97 + 0.06 * shape.shape) * (1 + 0.1 * shape.height)) / body.top;
    body.root.scale.setScalar(scale);
    // The box body goes for good; the raycaster would still hit it hidden.
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== unitBox) m.geometry.dispose();
    });
    this.body.clear();
    this.body.add(body.root);
    body.root.traverse((o) => {
      o.userData.pick = this.actor.id;
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.legLength = body.hipHeight * scale;
    this.head.scale.setScalar(body.headLength * scale * 4.2);
    this.skinned = body;
  }

  /** Moves and poses the figure; `azimuth` is where the camera is, for the head. */
  update(azimuth: number, t: number, opts: { selected: boolean; tag: string | null; tagColor?: string }) {
    const a = this.actor;
    const pose = a.pose;
    const walking = a.path.length > 0 && !pose;
    // Seated people (cheering from a chair) keep sitting and move their upper body.
    const sitting = !!a.seat && !walking;
    const rise = (sitting ? a.seat!.z - this.legLength + 0.02 : 0) + (pose?.bob ?? 0);
    this.group.position.set(a.x, rise, a.y);
    const [fx, fy] = DIRS[a.facing];
    const want = a.yaw ?? Math.atan2(fx, fy);
    let d = want - this.angle;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    // Poses are already smooth; follow them closely, ease into walking turns.
    this.angle += d * (pose ? 0.6 : 0.25);
    this.body.rotation.y = this.angle;
    const deg = Math.PI / 180;
    // Index 0 is the right side (−x when facing +z), 1 the left.
    const half = Math.PI / 2;
    const limbs: Limbs = { legs: [0, 0], knees: [0, 0], arms: [[0, 0], [0, 0]], lean: this.stoop, tilt: 0 };
    if (pose) {
      limbs.legs = sitting ? [half, half] : [pose.legR * deg, pose.legL * deg];
      limbs.knees = sitting ? [half, half] : [pose.kneeR * deg, pose.kneeL * deg];
      limbs.arms = [
        [pose.armR[0] * deg, pose.armR[1] * deg],
        [pose.armL[0] * deg, pose.armL[1] * deg],
      ];
      limbs.lean += pose.lean * deg;
      limbs.tilt = pose.tilt * deg;
    } else {
      const swing = walking ? Math.sin((t + this.phase) * 11) * 0.55 : 0;
      const bend = Math.max(0, Math.abs(swing) * 0.5);
      limbs.legs = sitting ? [half, half] : [swing, -swing];
      limbs.knees = sitting ? [half, half] : [bend, bend];
      limbs.arms = sitting ? [[0.5, 0], [0.5, 0]] : [[-swing * 0.7, 0], [swing * 0.7, 0]];
    }
    const { lean, tilt } = limbs;
    if (this.skinned) {
      // Arms hang just clear of the hips.
      limbs.arms = limbs.arms.map(([f, o]) => [f, Math.max(o, 0.12)]) as Limbs["arms"];
      this.skinned.pose(limbs);
      this.group.updateMatrixWorld(true);
      this.head.position.copy(this.group.worldToLocal(this.skinned.headPosition(new THREE.Vector3())));
    } else {
      this.thighs.forEach((g, i) => (g.rotation.x = -limbs.legs[i]));
      this.knees.forEach((g, i) => (g.rotation.x = limbs.knees[i]));
      this.arms[0].rotation.set(-limbs.arms[0][0], 0, -limbs.arms[0][1]);
      this.arms[1].rotation.set(-limbs.arms[1][0], 0, limbs.arms[1][1]);
      this.upper.rotation.set(lean, 0, tilt);
      // The head is a sprite, so it follows the lean by hand.
      const lx = -this.neckLength * Math.sin(tilt);
      const lz = this.neckLength * Math.sin(lean);
      const ly = this.neckLength * Math.cos(lean) * Math.cos(tilt);
      this.head.position.set(lx * Math.cos(this.angle) + lz * Math.sin(this.angle), this.legLength + ly, -lx * Math.sin(this.angle) + lz * Math.cos(this.angle));
    }
    // Shadow stays on the floor.
    this.group.children[0].position.y = 0.012 - rise;
    this.ring.visible = opts.selected;
    this.ring.position.y = this.group.children[0].position.y + 0.004;

    const facingAngle = Math.atan2(Math.sin(Math.PI / 2 - this.angle), Math.cos(Math.PI / 2 - this.angle));
    const view = viewFor(facingAngle, azimuth);
    const map = this.textures.get(view)!;
    if (this.head.material.map !== map) {
      this.head.material.map = map;
      this.head.material.needsUpdate = true;
    }

    const text = opts.tag ? `${opts.tag}|${opts.tagColor ?? ""}` : "";
    if (text !== this.tagText) {
      if (this.tag) {
        this.group.remove(this.tag);
        this.tag.material.map?.dispose();
        this.tag.material.dispose();
        this.tag = null;
      }
      if (opts.tag) {
        this.tag = textSprite(opts.tag, { height: 0.3, bg: opts.tagColor ?? "rgba(17,24,39,0.78)" });
        this.group.add(this.tag);
      }
      this.tagText = text;
    }
    if (this.tag) this.tag.position.set(this.head.position.x, this.head.position.y + 0.42, this.head.position.z);

    const emote = pose?.emote ?? "";
    if (emote !== this.emoteText) {
      if (this.emote) {
        this.group.remove(this.emote);
        this.emote.material.map?.dispose();
        this.emote.material.dispose();
        this.emote = null;
      }
      if (emote) {
        this.emote = textSprite(emote, { height: 0.36, bg: "rgba(255,255,255,0.92)", fg: "#111827", weight: 500 });
        this.group.add(this.emote);
      }
      this.emoteText = emote;
    }
    if (this.emote) this.emote.position.set(this.head.position.x, this.head.position.y + (this.tag ? 0.8 : 0.45) + Math.sin(t * 4) * 0.04, this.head.position.z);
  }

  dispose() {
    this.disposed = true;
    // Garment geometry is shared by every body; only the body's own copy goes.
    if (this.skinned) {
      this.body.remove(this.skinned.root);
      this.skinned.dispose();
    }
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== unitBox) m.geometry.dispose();
    });
    for (const t of this.textures.values()) t.dispose();
    this.head.material.dispose();
    this.tag?.material.map?.dispose();
    this.emote?.material.map?.dispose();
  }
}

// ── Camera and lights ────────────────────────────────────────────────────────

/** The camera's compass angle for a rotation step: 0 looks from the south-east. */
export const azimuthOf = (rotation: number) => Math.PI / 4 + (rotation * Math.PI) / 2;

export function addLights(scene: THREE.Scene, width: number, depth: number) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(width / 2 + 8, 18, depth / 2 + 12);
  sun.target.position.set(width / 2, 0, depth / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const r = Math.max(width, depth) * 0.85;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
}

/** Points an orthographic camera at the place: isometric from `azimuth`, or straight down. */
export function aimCamera(camera: THREE.OrthographicCamera, target: THREE.Vector3, azimuth: number, top: boolean, size: number, aspect: number) {
  if (top) {
    camera.position.set(target.x, 40, target.z + 0.001);
    camera.up.set(0, 0, -1);
  } else {
    camera.position.set(target.x + Math.cos(azimuth) * 30, target.y + 24, target.z + Math.sin(azimuth) * 30);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(target);
  camera.left = (-size * aspect) / 2;
  camera.right = (size * aspect) / 2;
  camera.top = size / 2;
  camera.bottom = -size / 2;
  camera.near = 0.1;
  camera.far = 200;
  camera.updateProjectionMatrix();
}

/** How much of the world fits on screen to show the whole place. */
export function fitSize(width: number, depth: number, aspect: number, top: boolean): number {
  if (top) return Math.max(depth, width / aspect) * 1.12;
  const diag = (width + depth) * 0.72;
  return Math.max(diag * 0.62 + WALL, diag / aspect) * 1.05;
}
