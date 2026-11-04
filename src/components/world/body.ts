// A person's body in the Places world: the MakeHuman body and garments built by
// tools/places/build_body.py (public/places/body.glb + body.json). Every mesh has
// one morph target per slider end; shaping a body sets those, moves the joints to
// match and rebinds the skin, so clothes follow the same shape.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ageFromBirthday, type Age, type Character } from "../../lib/places/character";
import type { Worn } from "../../lib/places/garments";

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
}

/** Joint angles in radians, index 0 the right side and 1 the left, as `Figure` poses its box body. */
export interface Limbs {
  /** Thigh forward (negative = back). */
  legs: [number, number];
  /** Knee bend. */
  knees: [number, number];
  /** [forward, out]: forward π/2 = arm straight ahead; out π/2 = straight out to the side. */
  arms: [[number, number], [number, number]];
  /** Upper body lean forward, and tilt to the person's right. */
  lean: number;
  tilt: number;
}

const YEARS: Record<Age, number> = { child: 8, teen: 15, adult: 35, elder: 72 };

/** Slider values a character's figure and build stand for, before their own sliders. */
export function presetSliders(look: Pick<Character, "figure" | "build">) {
  const build = { slim: { weight: -0.5, muscle: 0 }, average: { weight: 0, muscle: 0 }, broad: { weight: 0.5, muscle: 0.4 } }[look.build];
  return { shape: { feminine: 0, masculine: 1, neutral: 0.5 }[look.figure], ...build, height: 0, bust: 0 };
}

/** The body shape for a character: its sliders over its figure and build; birthday gives the exact age when known. */
export function shapeOf(look: Character, birthday = ""): BodyShape {
  const m = /^(\d{4})-/.exec(birthday);
  const years = m && ageFromBirthday(birthday) === look.age ? new Date().getFullYear() - Number(m[1]) : YEARS[look.age];
  return { ...presetSliders(look), ...look.body, years, proportions: 0.3 };
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

export class Body {
  readonly root: THREE.Object3D;
  private meshes = new Map<string, THREE.SkinnedMesh>();
  private bones = new Map<string, THREE.Bone>();
  private bodyIndex: THREE.BufferAttribute | null = null;
  private skin = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  private worn: Worn[] = [];
  private headShown = true;
  private rest = new Map<string, { local: THREE.Quaternion; root: THREE.Quaternion; dir: THREE.Vector3 | null }>();
  private headAnchor = new THREE.Object3D();
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
  }

  /** The bones `pose` turns, with the child that gives each its direction. */
  private static POSED: Record<string, string | null> = {
    thigh_r: "calf_r",
    thigh_l: "calf_l",
    calf_r: null,
    calf_l: null,
    upperarm_r: "lowerarm_r",
    upperarm_l: "lowerarm_l",
    lowerarm_r: null,
    lowerarm_l: null,
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
    const none = new THREE.Quaternion();
    (["r", "l"] as const).forEach((side, i) => {
      turn(`thigh_${side}`, new THREE.Quaternion().setFromAxisAngle(X, -p.legs[i]));
      turn(`calf_${side}`, new THREE.Quaternion().setFromAxisAngle(X, p.knees[i]));
      // Arms rest in an A-pose, so aim them rather than turn them. Out first, then
      // forward, so "out" leans a raised arm away from the head, not across it.
      const [forward, out] = p.arms[i];
      aim(`upperarm_${side}`, new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-forward, 0, side === "r" ? -out : out, "XZY")));
      turn(`lowerarm_${side}`, none);
    });
    const spine = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.lean / 3, 0, p.tilt / 3));
    for (const name of ["spine_01", "spine_02", "spine_03"]) turn(name, spine);
  }

  dispose() {
    this.meshes.get("body")?.geometry.dispose();
    this.skin.dispose();
    for (const [name, mesh] of this.meshes) if (name !== "body" && mesh.userData.tinted) (mesh.material as THREE.Material).dispose();
  }

  /** Hide the head when a face image stands in for it. */
  showHead(shown: boolean) {
    this.headShown = shown;
    this.hideCovered();
  }

  /** Shows these garments, tinted (their textures are grey), and hides the skin under them. */
  wear(worn: Worn[]) {
    this.worn = worn;
    const on = new Map(worn.map((w) => [w.garment, w.color]));
    for (const [name, mesh] of this.meshes) {
      if (name === "body") continue;
      mesh.visible = on.has(name);
      // Hidden meshes still take raycasts; only what is worn should catch a click.
      mesh.raycast = mesh.visible ? THREE.SkinnedMesh.prototype.raycast : () => {};
      if (!mesh.visible) continue;
      if (!mesh.userData.tinted) {
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        mesh.userData.tinted = true;
      }
      (mesh.material as THREE.MeshStandardMaterial).color.set(on.get(name)!);
    }
    this.hideCovered();
  }

  private hideCovered() {
    const { garments, regions } = this.src.meta;
    const hidden = new Set<number>(this.headShown ? [] : regions.head);
    for (const w of this.worn) for (const v of garments[w.garment]?.hides ?? []) hidden.add(v);
    const body = this.meshes.get("body")!;
    const vid = body.geometry.getAttribute("_vid");
    const src = this.bodyIndex!;
    const keep: number[] = [];
    for (let i = 0; i < src.count; i += 3) {
      const tri = [src.getX(i), src.getX(i + 1), src.getX(i + 2)];
      if (tri.every((v) => hidden.has(Math.round(vid.getX(v))))) continue;
      keep.push(...tri);
    }
    body.geometry.setIndex(keep);
  }
}
