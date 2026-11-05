import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { garment, type Worn } from "../../lib/places/garments";
import type { BodyShape } from "./body";

type Kind = "vulva" | "penis";
type JointPositions = Record<string, [number, number, number]>;

/** Resting adult anatomy, fitted to the neutral mesh and its existing morphs.
 * Separate meshes keep clothing shells smooth and prevent detail poking through
 * underwear. Both attach to the pelvis, so leg motion does not pull them apart. */
export class BodyAnatomy {
  private meshes = new Map<Kind, THREE.SkinnedMesh>();
  private selected: Kind | null = null;
  private covered = false;
  private bodyIndex: THREE.BufferAttribute;

  constructor(private body: THREE.SkinnedMesh, private material: THREE.Material, private joints: JointPositions) {
    this.bodyIndex = body.geometry.index!;
  }

  setShape(shape: BodyShape, weights: Record<string, number>) {
    const kind = shape.anatomy === "auto" || !shape.anatomy
      ? shape.shape < 0.25 ? "vulva" : shape.shape > 0.75 ? "penis" : "none"
      : shape.anatomy;
    // The app's teen preset includes 18–19; keep the entire teen group on its
    // original mesh. Also gate exact ages even when the saved preset is adult.
    this.selected = Number.isFinite(shape.years) && shape.years >= 20 && shape.adult !== false && kind !== "none" ? kind : null;
    if (this.selected && !this.meshes.has(this.selected)) this.meshes.set(this.selected, this.make(this.selected));
    for (const mesh of this.meshes.values()) {
      for (const [key, value] of Object.entries(weights)) {
        const index = mesh.morphTargetDictionary?.[key];
        if (index !== undefined) mesh.morphTargetInfluences![index] = value;
      }
    }
    this.updateVisibility();
  }

  cover(worn: Worn[]) {
    this.covered = worn.some((item) => {
      const definition = garment(item.garment);
      return definition && definition.layer !== "accessories" && definition.covers.includes("hips");
    });
    this.updateVisibility();
  }

  private updateVisibility() {
    for (const [kind, mesh] of this.meshes) {
      mesh.visible = kind === this.selected && !this.covered;
      mesh.raycast = mesh.visible ? THREE.SkinnedMesh.prototype.raycast : () => {};
    }
  }

  private make(kind: Kind): THREE.SkinnedMesh {
    const points = this.body.geometry.getAttribute("position");
    const hip = (this.joints.thigh_l[1] + this.joints.thigh_r[1]) / 2;
    // Use only the central front of the pelvis for fitting: nearby inner-thigh
    // vertices must not drag the attachment sideways during body morphs.
    const candidates: number[] = [];
    for (let i = 0; i < points.count; i++) {
      if (Math.abs(points.getX(i)) < 0.065 && points.getY(i) < hip + 0.035 && points.getY(i) > hip - 0.15 && points.getZ(i) > this.joints.pelvis[2] + 0.02) candidates.push(i);
    }
    if (!candidates.length) throw new Error("The body has no front pelvis surface for anatomy fitting.");
    const triangles: [number, number, number][] = [];
    const central = new Set(candidates);
    for (let i = 0; i < this.bodyIndex.count; i += 3) {
      const triangle = [0, 1, 2].map((offset) => this.bodyIndex.getX(i + offset)) as [number, number, number];
      if (triangle.every((v) => central.has(v))) triangles.push(triangle);
    }
    const nearby = (x: number, y: number) => {
      // Barycentric fitting follows the actual skin triangles. Inverse-distance
      // interpolation alone produces ripples and intersections on curved skin.
      let front = -Infinity;
      let fit: { i: number; weight: number }[] | null = null;
      for (const [a, b, c] of triangles) {
        const ax = points.getX(a), ay = points.getY(a), bx = points.getX(b), by = points.getY(b), cx = points.getX(c), cy = points.getY(c);
        const divisor = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(divisor) < 1e-12) continue;
        const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / divisor;
        const wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / divisor;
        const wc = 1 - wa - wb;
        if (Math.min(wa, wb, wc) < -1e-6) continue;
        const z = wa * points.getZ(a) + wb * points.getZ(b) + wc * points.getZ(c);
        if (z > front) { front = z; fit = [{ i: a, weight: wa }, { i: b, weight: wb }, { i: c, weight: wc }]; }
      }
      if (fit) return fit;
      const nearest = candidates.map((i) => ({ i, distance: (x - points.getX(i)) ** 2 + (y - points.getY(i)) ** 2 }))
        .sort((a, b) => a.distance - b.distance).slice(0, 4);
      const total = nearest.reduce((sum, p) => sum + 1 / Math.max(1e-8, p.distance), 0);
      return nearest.map((p) => ({ i: p.i, weight: 1 / Math.max(1e-8, p.distance) / total }));
    };
    const surface = (x: number, y: number) => nearby(x, y).reduce((z, p) => z + points.getZ(p.i) * p.weight, 0);
    let geometry: THREE.BufferGeometry;
    if (kind === "vulva") {
      // An oval relief with outer and inner labial folds, a recessed midline,
      // and a small hood. The edge meets the original skin surface.
      const vertices: number[] = [], triangles: number[] = [];
      const columns = 40, rows = 56, centre = hip - 0.035;
      for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
        const u = col / columns * 2 - 1, v = row / rows * 2 - 1;
        const x = u * 0.026, y = centre + v * 0.032;
        const radius = u * u + v * v;
        const fade = Math.max(0, 1 - radius) ** 2;
        const outer = 0.01 * Math.exp(-(((Math.abs(u) - 0.42) / 0.24) ** 2) - (v / 0.88) ** 6);
        const inner = 0.006 * Math.exp(-(((Math.abs(u) - 0.14) / 0.07) ** 2) - (v / 0.65) ** 6);
        const hood = 0.006 * Math.exp(-((u / 0.2) ** 2) - ((v - 0.52) / 0.15) ** 2);
        // Bury the boundary just inside the skin so the relief has no visible
        // oval rim or coplanar edge where it meets the original body.
        vertices.push(x, y, surface(x, y) - 0.001 + (outer + inner + hood + 0.002) * fade);
      }
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const u = (col + 0.5) / columns * 2 - 1, v = (row + 0.5) / rows * 2 - 1;
        if (u * u + v * v > 0.95) continue;
        const a = row * (columns + 1) + col, b = a + columns + 1;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(triangles);
    } else {
      const y = hip - 0.035, z = surface(0, y) - 0.004;
      const vertices: number[] = [], triangles: number[] = [];
      // A downward resting shaft, with a rounded glans and a shallow coronal
      // groove. Ends close inside the body and at the tip.
      const rings = [
        [-0.012, 0.014, -0.02], [0, 0.019, 0], [0.008, 0.017, 0.012], [0.025, 0.014, 0.023],
        [0.045, 0.013, 0.027], [0.057, 0.012, 0.028], [0.06, 0.0155, 0.028],
        [0.066, 0.016, 0.027], [0.075, 0.013, 0.026], [0.082, 0.006, 0.024], [0.084, 0, 0.023],
      ];
      const segments = 32;
      for (const [down, radius, forward] of rings) for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        vertices.push(Math.cos(angle) * radius, y - down, z + forward + Math.sin(angle) * radius);
      }
      for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < segments; i++) {
        const a = row * (segments + 1) + i, b = a + segments + 1;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
      const shaft = new THREE.BufferGeometry();
      shaft.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      shaft.setIndex(triangles);
      const scrotum = new THREE.SphereGeometry(1, 32, 24);
      scrotum.scale(0.026, 0.034, 0.026);
      scrotum.translate(0, y - 0.047, z - 0.006);
      scrotum.deleteAttribute("normal"); scrotum.deleteAttribute("uv");
      geometry = mergeGeometries([shaft, scrotum]);
      shaft.dispose(); scrotum.dispose();
    }
    geometry.computeVertexNormals();
    const positions = geometry.getAttribute("position");
    const pelvis = this.body.skeleton.bones.findIndex((bone) => bone.name === "pelvis");
    if (pelvis < 0) throw new Error("The body has no pelvis bone.");
    const indices = new Uint16Array(positions.count * 4), weights = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) { indices[i * 4] = pelvis; weights[i * 4] = 1; }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const attachments = Array.from({ length: positions.count }, (_, i) => nearby(kind === "penis" ? 0 : positions.getX(i), kind === "penis" ? hip - 0.035 : positions.getY(i)));
    geometry.morphTargetsRelative = this.body.geometry.morphTargetsRelative;
    geometry.morphAttributes.position = (this.body.geometry.morphAttributes.position ?? []).map((target) => {
      const deltas = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) for (let axis = 0; axis < 3; axis++) {
        const delta = attachments[i].reduce((sum, p) => sum + p.weight * (target.getComponent(p.i, axis) - (geometry.morphTargetsRelative ? 0 : points.getComponent(p.i, axis))), 0);
        deltas[i * 3 + axis] = delta + (geometry.morphTargetsRelative ? 0 : positions.getComponent(i, axis));
      }
      return new THREE.Float32BufferAttribute(deltas, 3);
    });
    const mesh = new THREE.SkinnedMesh(geometry, this.material);
    mesh.name = `anatomy:${kind}`;
    mesh.position.copy(this.body.position); mesh.quaternion.copy(this.body.quaternion); mesh.scale.copy(this.body.scale);
    mesh.bindMode = this.body.bindMode; mesh.bind(this.body.skeleton, this.body.bindMatrix);
    mesh.morphTargetDictionary = { ...this.body.morphTargetDictionary };
    mesh.morphTargetInfluences = [...(this.body.morphTargetInfluences ?? [])];
    mesh.castShadow = true; mesh.frustumCulled = false;
    this.body.parent!.add(mesh);
    return mesh;
  }

  dispose() {
    for (const mesh of this.meshes.values()) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    this.meshes.clear();
  }
}
