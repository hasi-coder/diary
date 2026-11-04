// A person's body in the Places world: the MakeHuman body and garments built by
// tools/places/build_body.py (public/places/body.glb + body.json). Every mesh has
// one morph target per slider end; shaping a body sets those, moves the joints to
// match and rebinds the skin, so clothes follow the same shape.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

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

export interface Worn {
  garment: string;
  color: string;
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

export function loadBody(base = "/places/"): Promise<BodyAsset> {
  asset ??= Promise.all([new GLTFLoader().loadAsync(`${base}body.glb`), fetch(`${base}body.json`).then((r) => r.json() as Promise<BodyMeta>)]).then(([gltf, meta]) => ({ scene: gltf.scene, meta }));
  return asset;
}

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
