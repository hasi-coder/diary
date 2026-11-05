// A person's body in the Places world: the MakeHuman body and garments built by
// tools/places/build_body.py (public/places/body.glb + body.json). Every mesh has
// one morph target per slider end; shaping a body sets those, moves the joints to
// match and rebinds the skin, so clothes follow the same shape.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ageFromBirthday, type Age, type Anatomy, type Character } from "../../lib/places/character";
import { BodyAnatomy } from "./bodyAnatomy";
import { clothingOrder, garment, normalizeWorn, type Worn } from "../../lib/places/garments";
import { clothingFaceKey, coveredBodyFaces, makeClothing, projectClothing, uncoveredIndex, type ClothingPiece } from "./clothingGeometry";
import { fittedGarment, normalizeClothingFit } from "../../lib/places/clothingFit";

export interface BodyShape {
  /** 0 feminine … 1 masculine. */
  shape: number;
  years: number;
  /** -1 … 1 around the average for the age. */
  weight: number;
  muscle: number;
  height: number;
  proportions: number;
  bust: number;
  anatomy?: Anatomy;
  adult?: boolean;
}

/** Joint angles in radians, index 0 the right side and 1 the left, as `Figure` poses its box body. */
export interface Limbs {
  /** Thigh forward (negative = back). */
  legs: [number, number];
  /** Knee bend. */
  knees: [number, number];
  /** [forward, out]: forward π/2 = arm straight ahead; out π/2 = straight out to the side. */
  arms: [[number, number], [number, number]];
  elbows: [number, number];
  forearms: [number, number];
  /** [forward bend, outward bend, outward twist]. */
  wrists: [[number, number, number], [number, number, number]];
  /** [toes up, outward roll]. */
  ankles: [[number, number], [number, number]];
  /** Upper body lean forward, and tilt to the person's right. */
  lean: number;
  tilt: number;
  twist: number;
  /** [nod forward, turn right, tilt right]. */
  neck: [number, number, number];
  head: [number, number, number];
}

const YEARS: Record<Age, number> = { child: 8, teen: 15, adult: 35, elder: 72 };

/** Slider values a character's figure and build stand for, before their own sliders. */
export function presetSliders(look: Pick<Character, "figure" | "build">) {
  const build = { slim: { weight: -0.5, muscle: 0 }, average: { weight: 0, muscle: 0 }, broad: { weight: 0.5, muscle: 0.4 } }[look.build];
  // MakeHuman's average bust stays on every body, so a masculine figure gets a flat chest and a
  // neutral one a smaller bust by default; the bust slider still moves it either way.
  return { shape: { feminine: 0, masculine: 1, neutral: 0.5 }[look.figure], ...build, height: 0, bust: { feminine: 0, masculine: -0.85, neutral: -0.4 }[look.figure] };
}

/** The body shape for a character: its sliders over its figure and build; birthday gives the exact age when known. */
export function shapeOf(look: Character, birthday = ""): BodyShape {
  const m = /^(\d{4})-/.exec(birthday);
  const birthdayAge = ageFromBirthday(birthday);
  const years = m && birthdayAge === look.age ? new Date().getFullYear() - Number(m[1]) : YEARS[look.age];
  const anatomy = look.anatomy === "auto" || !look.anatomy ? { feminine: "vulva", masculine: "penis", neutral: "none" }[look.figure] as Anatomy : look.anatomy;
  const adult = (look.age === "adult" || look.age === "elder") && birthdayAge !== "child" && birthdayAge !== "teen";
  return { ...presetSliders(look), ...look.body, years, proportions: 0.3, anatomy, adult };
}

interface BodyMeta {
  samples: Record<string, { macro: string; value: number }>;
  joints: { neutral: Record<string, [number, number, number]>; deltas: Record<string, Record<string, [number, number, number]>> };
  garments: Record<string, { layer: string; from: string; hides: number[] }>;
  regions: { head: number[] };
}

interface BodyAsset {
  scene: THREE.Group;
  meta: BodyMeta;
}

let asset: Promise<BodyAsset> | null = null;
let loaded: BodyAsset | null = null;

export function loadBody(base = "/places/"): Promise<BodyAsset> {
  asset ??= Promise.all([new GLTFLoader().loadAsync(`${base}body.glb`), fetch(`${base}body.json`).then((r) => r.json() as Promise<BodyMeta>)]).then(([gltf, meta]) => (loaded = { scene: gltf.scene, meta }));
  return asset;
}

/** The body asset if it has already loaded, so one-off renders (thumbnails) can use it straight away. */
export const loadedBody = () => loaded;

/** MakeHuman's age macro: 0 = 1 year, 0.1875 = 11, 0.5 = 25, 1 = 90. */
function ageMacro(years: number): number {
  const y = Math.min(90, Math.max(1, years));
  if (y <= 11) return ((y - 1) / 10) * 0.1875;
  if (y <= 25) return 0.1875 + ((y - 11) / 14) * 0.3125;
  return 0.5 + ((y - 25) / 65) * 0.5;
}

/** Morph target weights for a shape. Each macro is piecewise linear, as in MakeHuman. */
export function morphWeights(s: BodyShape): Record<string, number> {
  const two = (v: number, low: string, high: string) => ({ [low]: Math.max(0, (0.5 - v) / 0.5), [high]: Math.max(0, (v - 0.5) / 0.5) });
  const a = ageMacro(s.years);
  const age =
    a < 0.1875
      ? { baby: (0.1875 - a) / 0.1875, child: a / 0.1875, old: 0 }
      : a < 0.5
        ? { baby: 0, child: (0.5 - a) / 0.3125, old: 0 }
        : { baby: 0, child: 0, old: (a - 0.5) / 0.5 };
  const half = (x: number) => 0.5 + Math.max(-1, Math.min(1, x)) / 2;
  return {
    ...two(s.shape, "feminine", "masculine"),
    ...age,
    ...two(half(s.weight), "thin", "heavy"),
    ...two(half(s.muscle), "soft", "muscular"),
    ...two(half(s.height), "short", "tall"),
    ...two(half(s.proportions), "uncommon", "ideal"),
    ...two(half(s.bust), "small_bust", "large_bust"),
  };
}

/**
 * Skin that isn't plastic: a soft sheen, a lower roughness, and a warm glow at grazing angles
 * where light scatters through thin skin (a cheap stand-in for subsurface scattering).
 */
function skinMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.58, sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color("#ffb8a0"), clearcoat: 0.06, clearcoatRoughness: 0.5 });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += diffuse * vec3(1.0, 0.42, 0.3) * rim * 0.22;
      }`,
    );
  };
  return m;
}

export class Body {
  readonly root: THREE.Object3D;
  private meshes = new Map<string, THREE.SkinnedMesh>();
  private bones = new Map<string, THREE.Bone>();
  private bodyIndex: THREE.BufferAttribute | null = null;
  private skin = skinMaterial();
  private worn: Worn[] = [];
  private headShown = true;
  private rest = new Map<string, { local: THREE.Quaternion; root: THREE.Quaternion; dir: THREE.Vector3 | null }>();
  private headAnchor = new THREE.Object3D();
  private clothing = new Map<string, ClothingPiece[]>();
  private clothingFits = new Map<string, string>();
  private templates = new Map<string, THREE.SkinnedMesh>();
  private shapeWeights: Record<string, number> = {};
  private anatomy: BodyAnatomy;
  /** At rest, in the root's own units (before `root.scale`): the hip joints' height, the top of the head, and the head's length. */
  hipHeight = 0;
  top = 0;
  headLength = 0;

  constructor(private readonly src: BodyAsset) {
    this.root = cloneSkinned(src.scene);
    this.root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        // SkeletonUtils.clone shares boneInverses between clones; each person rebinds their own.
        o.skeleton.boneInverses = o.skeleton.boneInverses.map((m) => m.clone());
        this.meshes.set(o.name, o);
        o.castShadow = true;
        o.frustumCulled = false;
      }
      if (o instanceof THREE.Bone) this.bones.set(o.name, o);
    });
    // Clones share geometry; the body's index changes with what each person wears.
    const body = this.meshes.get("body")!;
    body.geometry = body.geometry.clone();
    body.material = this.skin;
    this.bodyIndex = body.geometry.index!.clone();
    this.anatomy = new BodyAnatomy(body, this.skin, src.meta.joints.neutral);
    for (const [name, mesh] of this.meshes) if (name !== "body") this.templates.set(name, mesh.clone(false));
  }

  /** The bone a head sprite or a held item hangs from. */
  bone(name: string): THREE.Bone | undefined {
    return this.bones.get(name);
  }

  setSkin(color: string) {
    this.skin.color.set(color);
  }

  setShape(shape: BodyShape) {
    const weights = morphWeights(shape);
    this.shapeWeights = weights;
    for (const mesh of this.meshes.values()) {
      const dict = mesh.morphTargetDictionary!;
      for (const [key, w] of Object.entries(weights)) if (dict[key] !== undefined) mesh.morphTargetInfluences![dict[key]] = w;
    }
    // Joints in rig space (the rig node is the scene root's child at the origin).
    const { neutral, deltas } = this.src.meta.joints;
    const head = new Map<string, THREE.Vector3>();
    for (const [name, p] of Object.entries(neutral)) {
      const v = new THREE.Vector3(...p);
      for (const [key, w] of Object.entries(weights)) {
        const d = deltas[key]?.[name];
        if (d && w) v.addScaledVector(new THREE.Vector3(...d), w);
      }
      head.set(name, v);
    }
    // Rest rotations stay; only where each joint sits changes.
    const rig = this.root.getObjectByName("rig")!;
    rig.updateMatrixWorld(true);
    const rigInv = rig.matrixWorld.clone().invert();
    const visit = (bone: THREE.Bone) => {
      const target = head.get(bone.name);
      const parent = bone.parent!;
      if (target) {
        const parentInv = new THREE.Matrix4().multiplyMatrices(rigInv, parent.matrixWorld).invert();
        bone.position.copy(target.clone().applyMatrix4(parentInv));
      }
      bone.updateMatrixWorld(true);
      for (const child of bone.children) if (child instanceof THREE.Bone) visit(child);
    };
    for (const child of rig.children) if (child instanceof THREE.Bone) visit(child);
    for (const mesh of this.meshes.values()) mesh.skeleton.calculateInverses();
    this.captureRest();
    this.anatomy.setShape(shape, weights);
  }

  /** The bones `pose` turns, with the child that gives each its direction. */
  private static POSED: Record<string, string | null> = {
    thigh_r: "calf_r",
    thigh_l: "calf_l",
    calf_r: null,
    calf_l: null,
    upperarm_r: "lowerarm_r",
    upperarm_l: "lowerarm_l",
    lowerarm_r: "hand_r",
    lowerarm_l: "hand_l",
    hand_r: null,
    hand_l: null,
    foot_r: null,
    foot_l: null,
    neck_01: null,
    head: null,
    spine_01: null,
    spine_02: null,
    spine_03: null,
  };

  private captureRest() {
    this.root.updateMatrixWorld(true);
    const rootInv = this.root.matrixWorld.clone().invert();
    const rootQuat = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const at = (name: string) => this.bones.get(name)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);
    for (const [name, child] of Object.entries(Body.POSED)) {
      const bone = this.bones.get(name)!;
      this.rest.set(name, {
        local: bone.quaternion.clone(),
        root: rootQuat.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion())),
        dir: child ? at(child).sub(at(name)).normalize() : null,
      });
    }
    this.hipHeight = (at("thigh_r").y + at("thigh_l").y) / 2;
    this.headLength = at("head").distanceTo(at("neck_01"));
    const body = this.meshes.get("body")!;
    this.top = new THREE.Box3().setFromObject(body, true).applyMatrix4(rootInv).max.y;
    // Where the face image sits: just above the head joint, riding the head bone.
    const head = this.bones.get("head")!;
    head.add(this.headAnchor);
    const anchor = at("head").add(new THREE.Vector3(0, this.headLength * 0.75, 0)).applyMatrix4(this.root.matrixWorld);
    this.headAnchor.position.copy(head.worldToLocal(anchor));
  }

  /** The face image's centre, in world space (call after the scene's matrices are current). */
  headPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.headAnchor.getWorldPosition(out);
  }

  /** Turns the joints. Rotations are in the body's own frame (facing +z, right at -x), each relative to its parent. */
  pose(p: Limbs) {
    const turn = (name: string, q: THREE.Quaternion) => {
      const r = this.rest.get(name)!;
      this.bones.get(name)!.quaternion.copy(r.local).multiply(r.root.clone().invert().multiply(q).multiply(r.root));
    };
    const aim = (name: string, dir: THREE.Vector3) => turn(name, new THREE.Quaternion().setFromUnitVectors(this.rest.get(name)!.dir!, dir));
    const X = new THREE.Vector3(1, 0, 0);
    (["r", "l"] as const).forEach((side, i) => {
      const sign = side === "r" ? -1 : 1;
      turn(`thigh_${side}`, new THREE.Quaternion().setFromAxisAngle(X, -p.legs[i]));
      turn(`calf_${side}`, new THREE.Quaternion().setFromAxisAngle(X, p.knees[i]));
      turn(`foot_${side}`, new THREE.Quaternion().setFromEuler(new THREE.Euler(-p.ankles[i][0], 0, sign * p.ankles[i][1])));
      // Arms rest in an A-pose, so aim them rather than turn them. Out first, then
      // forward, so "out" leans a raised arm away from the head, not across it.
      const [forward, out] = p.arms[i];
      aim(`upperarm_${side}`, new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-forward, 0, side === "r" ? -out : out, "XZY")));
      // Express elbow/wrist motion in the arm's rest frame. The parent shoulder
      // then carries that frame with it, even when the arm is raised or spread.
      const basis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.rest.get(`lowerarm_${side}`)!.dir!);
      const armTurn = (name: string, rotation: THREE.Euler) => turn(name, basis.clone().multiply(new THREE.Quaternion().setFromEuler(rotation)).multiply(basis.clone().invert()));
      armTurn(`lowerarm_${side}`, new THREE.Euler(-p.elbows[i], sign * p.forearms[i], 0, "XZY"));
      const [bend, spread, twist] = p.wrists[i];
      armTurn(`hand_${side}`, new THREE.Euler(-bend, sign * twist, sign * spread, "XZY"));
    });
    const spine = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean / 3, -p.twist / 3, p.tilt / 3));
    for (const name of ["spine_01", "spine_02", "spine_03"]) turn(name, spine);
    const headTurn = ([nod, yaw, tilt]: [number, number, number]) => new THREE.Quaternion().setFromEuler(new THREE.Euler(nod, -yaw, tilt));
    turn("neck_01", headTurn(p.neck));
    turn("head", headTurn(p.head));
  }

  dispose() {
    this.anatomy.dispose();
    this.meshes.get("body")?.geometry.dispose();
    this.skin.dispose();
    for (const [name, mesh] of this.meshes) if (name !== "body") {
      if (mesh.userData.tinted) (mesh.material as THREE.Material).dispose();
      if (mesh.userData.ownedClothingGeometry || mesh.userData.generatedClothing) mesh.geometry.dispose();
    }
  }

  /** Hide the head when a face image stands in for it. */
  showHead(shown: boolean) {
    this.headShown = shown;
    this.hideCovered();
  }

  private ensureGarment(item: Worn) {
    const id = item.garment;
    const fit = normalizeClothingFit(item.fit);
    const signature = JSON.stringify(fit ?? {});
    if (this.clothing.has(id) && this.clothingFits.get(id) === signature) return;
    for (const { mesh } of this.clothing.get(id) ?? []) {
      if (mesh.userData.generatedClothing) {
        mesh.removeFromParent(); mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose(); this.meshes.delete(mesh.name);
      } else if (mesh.userData.ownedClothingGeometry) mesh.geometry.dispose();
    }
    const original = garment(id);
    const definition = original && fittedGarment(original, fit);
    if (!definition) return;
    this.clothingFits.set(id, signature);
    const body = this.meshes.get("body")!;
    if (definition.recipe) {
      const pieces = makeClothing(body, definition, this.src.meta.joints.neutral, this.bodyIndex!, this.templates);
      this.clothing.set(id, pieces);
      for (const { mesh } of pieces) {
        this.meshes.set(mesh.name, mesh);
        for (const [key, weight] of Object.entries(this.shapeWeights)) {
          const index = mesh.morphTargetDictionary?.[key];
          if (index !== undefined) mesh.morphTargetInfluences![index] = weight;
        }
      }
    } else {
      const mesh = this.meshes.get(id);
      const template = this.templates.get(id);
      if (!mesh || !template) return;
      mesh.geometry = template.geometry.clone();
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      const length = fit?.length ?? 1;
      const joints = this.src.meta.joints.neutral;
      const anchor = definition.covers.includes("torso") ? (joints.clavicle_l[1] + joints.clavicle_r[1]) / 2 : joints.spine_01[1] + 0.04;
      for (let i = 0; i < positions.count; i++) positions.setXYZ(i, positions.getX(i) + normals.getX(i) * (fit?.ease ?? 0), anchor + (positions.getY(i) - anchor) * length + normals.getY(i) * (fit?.ease ?? 0), positions.getZ(i) + normals.getZ(i) * (fit?.ease ?? 0));
      if (length !== 1) {
        const points = body.geometry.getAttribute("position");
        let nearest = 0, distance = Infinity;
        for (let i = 0; i < points.count; i++) { const d = Math.abs(points.getY(i) - anchor) + Math.abs(points.getX(i)); if (d < distance) { nearest = i; distance = d; } }
        mesh.geometry.morphAttributes.position?.forEach((attribute, index) => {
          const delta = body.geometry.morphAttributes.position?.[index]?.getY(nearest) ?? 0;
          for (let i = 0; i < attribute.count; i++) attribute.setY(i, delta + (attribute.getY(i) - delta) * length);
        });
      }
      mesh.userData.ownedClothingGeometry = true;
      const projection = projectClothing(mesh.geometry, body.geometry);
      const coverage = length === 1 ? new Set(this.src.meta.garments[id]?.hides ?? []) : new Set(projection);
      const coverageFaces = coveredBodyFaces(this.bodyIndex!, projectClothing(body.geometry, body.geometry), coverage);
      this.clothing.set(id, [{ mesh, index: mesh.geometry.index!.clone(), projection, coverage, coverageFaces }]);
    }
  }

  /** Keep every selected layer. Opaque higher pieces mask only the triangles
   * beneath them, preserving sleeves, hems and open-front clothing underneath. */
  wear(worn: Worn[]) {
    this.worn = normalizeWorn(worn);
    for (const item of this.worn) this.ensureGarment(item);
    for (const [name, mesh] of this.meshes) if (name !== "body") { mesh.visible = false; mesh.raycast = () => {}; }
    for (const item of this.worn) {
      const definition = garment(item.garment)!;
      const covered = new Set<number>();
      const faces = new Set<string>();
      for (const higher of this.worn) {
        if (clothingOrder(garment(higher.garment)!) <= clothingOrder(definition)) continue;
        for (const piece of this.clothing.get(higher.garment) ?? []) {
          for (const id of piece.coverage) covered.add(id);
          for (const face of piece.coverageFaces) faces.add(face);
        }
      }
      for (const piece of this.clothing.get(item.garment) ?? []) {
        const { mesh } = piece;
        mesh.geometry.setIndex(uncoveredIndex(piece.index, piece.projection, covered, faces, !!mesh.geometry.getAttribute("_vid")));
        mesh.visible = mesh.geometry.index!.count > 0;
        mesh.raycast = mesh.visible ? THREE.SkinnedMesh.prototype.raycast : () => {};
        if (!mesh.userData.tinted) {
          mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
          mesh.userData.tinted = true;
        }
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.color.set(mesh.userData.fixedColor ?? item.color);
        material.polygonOffset = true;
        material.polygonOffsetFactor = -clothingOrder(definition) * 0.1;
        material.polygonOffsetUnits = -clothingOrder(definition) * 0.1;
      }
    }
    this.hideCovered();
  }

  private hideCovered() {
    const { regions } = this.src.meta;
    const hidden = new Set<number>(this.headShown ? [] : regions.head);
    const covered = new Set<string>();
    for (const w of this.worn) for (const piece of this.clothing.get(w.garment) ?? []) for (const face of piece.coverageFaces) covered.add(face);
    const body = this.meshes.get("body")!;
    const vid = body.geometry.getAttribute("_vid");
    const src = this.bodyIndex!;
    // Keep skin beneath cut edges. An offset shell has an open rim; erasing
    // skin right up to that rim lets the background show through from the side.
    const exposed = new Set<number>();
    for (let i = 0; i < src.count; i += 3) {
      const ids = [0, 1, 2].map((offset) => Math.round(vid.getX(src.getX(i + offset)))) as [number, number, number];
      if (!covered.has(clothingFaceKey(...ids))) for (const id of ids) exposed.add(id);
    }
    const keep: number[] = [];
    for (let i = 0; i < src.count; i += 3) {
      const tri = [src.getX(i), src.getX(i + 1), src.getX(i + 2)];
      const ids = tri.map((v) => Math.round(vid.getX(v))) as [number, number, number];
      if (ids.every((id) => hidden.has(id)) || (covered.has(clothingFaceKey(...ids)) && !ids.some((id) => exposed.has(id)))) continue;
      keep.push(...tri);
    }
    body.geometry.setIndex(keep);
    this.anatomy.cover(this.worn);
  }
}
