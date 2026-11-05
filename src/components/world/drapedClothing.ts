import * as THREE from "three";
import type { ClothingRecipe } from "../../lib/places/clothingTypes";

interface Binding { vertex: number; weight: number }
interface Sample { point: THREE.Vector3; binding: Binding[] }
export interface DrapePanel { geometry: THREE.BufferGeometry; name: string; coverage: Set<number>; fixedColor?: string }

/** Sewn-looking, rigged cloth panels for shoulder drapes and the Kandyan waist
 * frill. They sample the actual torso surface, so a diagonal pallu clears the
 * bust and carries the same body morphs instead of being a flat chest rectangle. */
export function drapedPanels(body: THREE.SkinnedMesh, bodyIndex: THREE.BufferAttribute, joints: Record<string, [number, number, number]>, recipe: ClothingRecipe, offset: number): DrapePanel[] {
  const geometry = body.geometry, points = geometry.getAttribute("position"), ids = geometry.getAttribute("_vid");
  const skinIds = geometry.getAttribute("skinIndex"), skinWeights = geometry.getAttribute("skinWeight");
  const waist = joints.spine_01[1] + 0.04;
  const shoulder = (joints.clavicle_l[1] + joints.clavicle_r[1]) / 2;
  const centreZ = joints.pelvis[2];
  const candidates: number[] = [];
  for (let i = 0; i < points.count; i++) {
    let torso = 0;
    for (let c = 0; c < 4; c++) {
      const name = body.skeleton.bones[skinIds.getComponent(i, c)]?.name ?? "";
      if (/^(pelvis|spine_|clavicle)/.test(name) || (points.getY(i) > shoulder - 0.1 && /^upperarm_/.test(name))) torso += skinWeights.getComponent(i, c);
    }
    if (torso > 0.55 && points.getY(i) > waist - 0.18 && points.getY(i) < shoulder + 0.075) candidates.push(i);
  }
  const selected = new Set(candidates);
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < bodyIndex.count; i += 3) {
    const triangle = [0, 1, 2].map((c) => bodyIndex.getX(i + c)) as [number, number, number];
    if (triangle.every((v) => selected.has(v))) triangles.push(triangle);
  }
  const cache = new Map<string, Sample>();
  const surface = (x: number, y: number, back = false): Sample => {
    const key = `${x}:${y}:${back}`;
    const cached = cache.get(key);
    if (cached) return { point: cached.point.clone(), binding: cached.binding };
    let z = back ? Infinity : -Infinity, binding: Binding[] = [];
    for (const [a, b, c] of triangles) {
      const ax = points.getX(a), ay = points.getY(a), bx = points.getX(b), by = points.getY(b), cx = points.getX(c), cy = points.getY(c);
      const divisor = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(divisor) < 1e-12) continue;
      const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / divisor;
      const wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / divisor;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) < -1e-6) continue;
      const next = wa * points.getZ(a) + wb * points.getZ(b) + wc * points.getZ(c);
      if (back ? next < z : next > z) { z = next; binding = [{ vertex: a, weight: wa }, { vertex: b, weight: wb }, { vertex: c, weight: wc }]; }
    }
    if (!binding.length) {
      let nearest = candidates[0], distance = Infinity;
      for (const i of candidates) {
        if (back ? points.getZ(i) > centreZ : points.getZ(i) < centreZ) continue;
        const d = (x - points.getX(i)) ** 2 + (y - points.getY(i)) ** 2;
        if (d < distance) { nearest = i; distance = d; }
      }
      z = points.getZ(nearest); binding = [{ vertex: nearest, weight: 1 }];
    }
    const sample = { point: new THREE.Vector3(x, y, z), binding };
    cache.set(key, sample);
    return { point: sample.point.clone(), binding };
  };
  const panels: DrapePanel[] = [];
  const waistBinding = surface(0, waist).binding;
  const make = (name: string, rows: number, columns: number, at: (t: number, u: number) => Sample, cover = true, fixedColor?: string) => {
    const positions: number[] = [], uv: number[] = [], index: number[] = [], bindings: Binding[][] = [];
    const coverage = new Set<number>();
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const t = row / rows, u = col / columns, sample = at(t, u);
      positions.push(...sample.point.toArray()); uv.push(u, t); bindings.push(sample.binding);
      if (cover) for (const b of sample.binding) if (b.weight > 0.05) coverage.add(Math.round(ids.getX(b.vertex)));
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const cloth = new THREE.BufferGeometry();
    cloth.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    cloth.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); cloth.setIndex(index);
    const bones = new Uint16Array(bindings.length * 4), weights = new Float32Array(bindings.length * 4);
    bindings.forEach((binding, i) => {
      const influences = new Map<number, number>();
      if (name.startsWith("neriya")) {
        bones[i * 4] = body.skeleton.bones.findIndex((bone) => bone.name === "pelvis"); weights[i * 4] = 1; return;
      }
      for (const b of binding) for (let c = 0; c < 4; c++) {
        const bone = skinIds.getComponent(b.vertex, c), weight = b.weight * skinWeights.getComponent(b.vertex, c);
        if (weight > 0) influences.set(bone, (influences.get(bone) ?? 0) + weight);
      }
      const strongest = [...influences].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
      strongest.forEach(([bone, weight], c) => { bones[i * 4 + c] = bone; weights[i * 4 + c] = weight / sum; });
    });
    cloth.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(bones, 4));
    cloth.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    cloth.morphTargetsRelative = true;
    cloth.morphAttributes.position = (geometry.morphAttributes.position ?? []).map((target) => {
      const delta = new Float32Array(bindings.length * 3);
      bindings.forEach((binding, i) => { for (let axis = 0; axis < 3; axis++) {
        const sources = name.startsWith("neriya") && axis === 1 ? waistBinding : binding;
        delta[i * 3 + axis] = sources.reduce((sum, b) => sum + b.weight * (target.getComponent(b.vertex, axis) - (geometry.morphTargetsRelative ? 0 : points.getComponent(b.vertex, axis))), 0);
      } });
      return new THREE.Float32BufferAttribute(delta, 3);
    });
    cloth.computeVertexNormals();
    panels.push({ geometry: cloth, name, coverage, fixedColor });
  };
  const trim = recipe.trim === "gold" ? "#d5b469" : "#eadbc0";
  // A decorative overlay clears the underlying garments geometrically. Its
  // projected body ids must not punch holes in a longer tunic or loose skirt.
  const edged = (name: string, rows: number, at: (t: number, u: number) => Sample, cover = false) => {
    make(name, rows, 12, at, cover);
    if (!recipe.trim) return;
    const border = (t: number, u: number) => { const sample = at(t, u); sample.point.z += sample.point.z >= centreZ ? 0.0015 : -0.0015; return sample; };
    make(`${name}-border-left`, rows, 1, (t, u) => border(t, u * 0.045), false, trim);
    make(`${name}-border-right`, rows, 1, (t, u) => border(t, 0.955 + u * 0.045), false, trim);
    make(`${name}-border-end`, 1, 12, (t, u) => border(0.965 + t * 0.035, u), false, trim);
  };
  const clearance = offset + (recipe.drape === "dupatta" ? 0.03 : 0.016);
  if (recipe.drape === "saree" || recipe.drape === "osariya") {
    const top = shoulder + 0.025;
    const front = (t: number, u: number) => {
      const width = THREE.MathUtils.lerp(0.31, 0.145, t);
      const y = THREE.MathUtils.lerp(waist - 0.035, top, t) - Math.sin(u * Math.PI) * Math.sin(t * Math.PI) * 0.018;
      let halfWidth = 0.12;
      for (const i of candidates) if (Math.abs(points.getY(i) - y) < 0.025) halfWidth = Math.max(halfWidth, Math.abs(points.getX(i)));
      const x = THREE.MathUtils.clamp(THREE.MathUtils.lerp(-0.035, 0.105, t) + (u - 0.5) * width, -halfWidth + 0.005, halfWidth - 0.005);
      const sample = surface(x, y);
      sample.point.z += clearance + Math.sin(u * Math.PI * 8) * 0.004 * (0.3 + 0.7 * Math.sin(t * Math.PI));
      return sample;
    };
    edged("pallu-front", 28, front);
    // The bridge passes over the shoulder and joins the hanging back panel.
    make("pallu-shoulder", 10, 12, (t, u) => {
      const x = 0.105 + (u - 0.5) * 0.145;
      const a = surface(x, top), b = surface(x, top, true);
      const sample = t < 0.5 ? a : b;
      sample.point.set(x, top + Math.sin(t * Math.PI) * 0.018, THREE.MathUtils.lerp(a.point.z + clearance, b.point.z - clearance, t));
      return sample;
    }, false);
    edged("pallu-back", 28, (t, u) => {
      const x = 0.105 + (u - 0.5) * THREE.MathUtils.lerp(0.145, 0.205, t);
      const sample = surface(x, top - t * (top - waist + 0.12) * Math.min(1.2, recipe.length ?? 1), true);
      sample.point.z -= clearance + Math.sin(u * Math.PI * 8) * 0.004;
      return sample;
    });
    if (recipe.drape === "osariya") {
      let rx = 0.12, rz = 0.075;
      for (const i of candidates) if (Math.abs(points.getY(i) - waist) < 0.035) { rx = Math.max(rx, Math.abs(points.getX(i))); rz = Math.max(rz, Math.abs(points.getZ(i) - centreZ)); }
      const frill = (t: number, u: number) => {
        const angle = u * Math.PI * 2, pleat = Math.cos(angle * 20 + t * 0.3) * 0.004 * Math.sqrt(t);
        const fullness = Math.sin(t * Math.PI / 2) * 0.026;
        const x = Math.cos(angle) * (rx + offset + fullness + pleat);
        const y = waist + 0.018 - t * 0.07 - Math.cos(angle * 2) * 0.003 * t;
        const sample = surface(Math.cos(angle) * rx, y, Math.sin(angle) < 0);
        sample.point.set(x, y, centreZ + Math.sin(angle) * (rz + offset + fullness + pleat));
        return sample;
      };
      make("neriya-frill", 8, 96, frill, false);
      make("neriya-border", 1, 96, (t, u) => {
        const sample = frill(0.92 + t * 0.08, u), angle = u * Math.PI * 2;
        sample.point.x += Math.cos(angle) * 0.002;
        sample.point.z += Math.sin(angle) * 0.002;
        return sample;
      }, false, trim);
    }
  }
  if (recipe.drape === "dupatta") {
    // Two narrow ends over the shoulders, joined by a loose front neckline.
    const top = shoulder + 0.025;
    for (const side of [-1, 1]) edged(`dupatta-${side < 0 ? "right" : "left"}`, 28, (t, u) => {
      const x = side * (0.095 + t * 0.018) + (u - 0.5) * 0.105;
      const sample = surface(x, top - t * (shoulder - waist + 0.16) * (recipe.length ?? 1));
      sample.point.z += clearance + Math.sin(u * Math.PI * 6) * 0.003;
      return sample;
    });
    make("dupatta-neckline", 20, 6, (t, u) => {
      const x = (t - 0.5) * 0.24;
      const y = shoulder - Math.sin(t * Math.PI) * 0.12 - u * 0.06;
      const sample = surface(x, y); sample.point.z += clearance + 0.005; return sample;
    }, false);
    make("dupatta-shoulders", 12, 16, (t, u) => {
      const x = (u - 0.5) * 0.29;
      const sample = surface(x, top - t * 0.12, true); sample.point.z -= clearance; return sample;
    }, false);
  }
  return panels;
}
