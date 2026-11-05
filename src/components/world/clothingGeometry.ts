import * as THREE from "three";
import { clothingOffset, type Garment } from "../../lib/places/garments";

export interface ClothingPiece {
  mesh: THREE.SkinnedMesh;
  index: THREE.BufferAttribute;
  projection: Int32Array;
  coverage: Set<number>;
  coverageFaces: Set<string>;
}

const xyz = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => new THREE.Vector3(attribute.getX(i), attribute.getY(i), attribute.getZ(i));

export const clothingFaceKey = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y).join(":");

export function coveredBodyFaces(index: THREE.BufferAttribute, projection: Int32Array, covered: Set<number>): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < index.count; i += 3) {
    const a = projection[index.getX(i)], b = projection[index.getX(i + 1)], c = projection[index.getX(i + 2)];
    if (covered.has(a) && covered.has(b) && covered.has(c)) result.add(clothingFaceKey(a, b, c));
  }
  return result;
}

/** Neutral-body projection is used for coverage, never the character's current
 * pose. This keeps masks stable while walking, sitting and changing shape. */
export function projectClothing(geometry: THREE.BufferGeometry, body: THREE.BufferGeometry): Int32Array {
  const positions = geometry.getAttribute("position"), points = body.getAttribute("position"), ids = body.getAttribute("_vid");
  const direct = geometry.getAttribute("_vid");
  if (direct) return Int32Array.from({ length: positions.count }, (_, i) => Math.round(direct.getX(i)));
  const result = new Int32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    let closest = 0, distance = Infinity;
    for (let j = 0; j < points.count; j++) {
      const next = (x - points.getX(j)) ** 2 + (y - points.getY(j)) ** 2 + (z - points.getZ(j)) ** 2;
      if (next < distance) { closest = j; distance = next; }
    }
    result[i] = Math.round(ids.getX(closest));
  }
  return result;
}

/** Remove only fully covered triangles of a lower garment. An open jacket or
 * shorter hem leaves the rest of the shirt, underwear or socks visible. */
export function uncoveredIndex(index: THREE.BufferAttribute, projection: Int32Array, covered: Set<number>, faces?: Set<string>, exact = false): number[] {
  const result: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const ids = triangle.map((vertex) => projection[vertex]) as [number, number, number];
    // A triangle clipped at a hem repeats a body-vertex id, so it is not one of
    // the body's own faces: test its corners instead.
    const clipped = new Set(ids).size < 3;
    const hidden = exact && faces && !clipped ? faces.has(clothingFaceKey(...ids)) : triangle.every((vertex) => covered.has(projection[vertex]));
    if (!hidden) result.push(...triangle);
  }
  return result;
}


/** Cut a triangle list of `source` at a lower and an upper height (which may
 * depend on the vertex, e.g. sleeves end higher than the hem). Triangles that
 * cross a plane are clipped, so the cut edge is straight at any body shape; new
 * vertices interpolate every attribute and morph target, and take skin weights
 * and ids from the vertex that stays. `tilt` slants the lower cut: a vertex is
 * kept when y - tilt·|x| is above the plane, which gives briefs their leg openings. */
export function clipToBand(
  source: THREE.BufferGeometry,
  triangles: number[],
  lowOf: (v: number) => number,
  highOf: (v: number) => number,
  groupOf: (v: number) => boolean = () => false,
  tilt = 0,
  /** 1 cuts by height; 3 cuts by distance from the centre line, which makes vertical strips on both sides. */
  axis: 1 | 3 = 1,
): THREE.BufferGeometry {
  const position = source.getAttribute("position");
  const base = position.count;
  const extra: { keep: number; other: number; t: number; x: number; y: number; z: number }[] = [];
  const cache = new Map<string, number>();
  const coord = (v: number) => v < base ? [position.getX(v), position.getY(v), position.getZ(v)] : [extra[v - base].x, extra[v - base].y, extra[v - base].z];
  const height = (v: number, slant: number) => { const [x, y] = coord(v); return axis === 3 ? Math.abs(x) : y - slant * Math.abs(x); };
  const cut = (inside: number, outside: number, plane: number, slant: number, kind: string) => {
    const key = `${inside}:${outside}:${kind}`;
    const found = cache.get(key);
    if (found !== undefined) return found;
    const h0 = height(inside, slant), h1 = height(outside, slant);
    const t = Math.abs(h1 - h0) < 1e-9 ? 0 : (plane - h0) / (h1 - h0);
    const p0 = coord(inside), p1 = coord(outside);
    const id = base + extra.length;
    extra.push({ keep: inside, other: outside, t, x: p0[0] + (p1[0] - p0[0]) * t, y: p0[1] + (p1[1] - p0[1]) * t, z: p0[2] + (p1[2] - p0[2]) * t });
    cache.set(key, id);
    return id;
  };
  const out: number[] = [];
  const clip = (polygon: number[], plane: number, keepAbove: boolean, slant: number, kind: string) => {
    if (!Number.isFinite(plane)) return polygon;
    const inside = (v: number) => keepAbove ? height(v, slant) >= plane : height(v, slant) <= plane;
    const result: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const ia = inside(a), ib = inside(b);
      if (ia) result.push(a);
      if (ia !== ib) result.push(ia ? cut(a, b, plane, slant, kind) : cut(b, a, plane, slant, kind));
    }
    return result;
  };
  for (let i = 0; i < triangles.length; i += 3) {
    let polygon = [triangles[i], triangles[i + 1], triangles[i + 2]];
    const lead = polygon.find(groupOf) ?? polygon[0];
    polygon = clip(polygon, lowOf(lead), true, groupOf(lead) ? 0 : tilt, "l");
    if (polygon.length >= 3) polygon = clip(polygon, highOf(lead), false, 0, "h");
    for (let k = 1; k + 1 < polygon.length; k++) out.push(polygon[0], polygon[k], polygon[k + 1]);
  }
  const geometry = source.clone();
  const grow = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, copy: boolean) => {
    const size = attribute.itemSize, array = new (attribute.array.constructor as new (n: number) => Float32Array)((base + extra.length) * size);
    const value = (v: number, c: number): number => {
      if (v < base) return attribute.getComponent(v, c);
      const e = extra[v - base], a = value(e.keep, c);
      return copy ? a : a + (value(e.other, c) - a) * e.t;
    };
    for (let v = 0; v < base + extra.length; v++) for (let c = 0; c < size; c++) array[v * size + c] = value(v, c);
    return new THREE.BufferAttribute(array, size, attribute.normalized);
  };
  for (const name of Object.keys(geometry.attributes)) {
    geometry.setAttribute(name, grow(source.getAttribute(name), name === "skinIndex" || name === "skinWeight" || name === "_vid"));
  }
  for (const name of ["position", "normal", "color"] as const) {
    if (source.morphAttributes[name]) geometry.morphAttributes[name] = source.morphAttributes[name]!.map((attribute) => grow(attribute, false));
  }
  geometry.setIndex(out);
  return geometry;
}

export function makeClothing(
  body: THREE.SkinnedMesh,
  definition: Garment,
  joints: Record<string, [number, number, number]>,
  bodyIndex: THREE.BufferAttribute,
  templates: Map<string, THREE.SkinnedMesh>,
): ClothingPiece[] {
  const recipe = definition.recipe!;
  const points = body.geometry.getAttribute("position"), normals = body.geometry.getAttribute("normal");
  const ids = body.geometry.getAttribute("_vid");
  const weights = body.geometry.getAttribute("skinWeight"), bones = body.geometry.getAttribute("skinIndex");
  const hip = (joints.thigh_l[1] + joints.thigh_r[1]) / 2;
  const waist = joints.spine_01[1] + 0.04;
  const shoulder = (joints.clavicle_l[1] + joints.clavicle_r[1]) / 2;
  const ankle = (joints.foot_l[1] + joints.foot_r[1]) / 2;
  const knee = (joints.calf_l[1] + joints.calf_r[1]) / 2;
  const wrist = (joints.hand_l[1] + joints.hand_r[1]) / 2;
  const offset = clothingOffset(definition) + (recipe.ease ?? 0);
  const pieces: ClothingPiece[] = [];
  const weightFor = (vertex: number, matches: (name: string) => boolean) => {
    let total = 0;
    for (let i = 0; i < 4; i++) if (matches(body.skeleton.bones[bones.getComponent(vertex, i)]?.name ?? "")) total += weights.getComponent(vertex, i);
    return total;
  };
  const torso = (i: number) => weightFor(i, (name) => /^(pelvis|spine_|clavicle)/.test(name)) >= 0.55;
  const legs = (i: number) => weightFor(i, (name) => /^(pelvis|spine_01|thigh_|calf_|foot_|ball_)/.test(name)) >= 0.55;

  const attach = (geometry: THREE.BufferGeometry, source: THREE.SkinnedMesh, coverage: Set<number>, suffix = ""): ClothingPiece => {
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }));
    mesh.name = suffix ? `${definition.id}:${suffix}` : definition.id;
    mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
    mesh.bindMode = body.bindMode; mesh.bind(body.skeleton, body.bindMatrix);
    mesh.morphTargetDictionary = { ...source.morphTargetDictionary };
    mesh.morphTargetInfluences = [...(body.morphTargetInfluences ?? [])];
    mesh.userData.garmentId = definition.id;
    mesh.userData.generatedClothing = true;
    mesh.userData.tinted = true;
    mesh.castShadow = true; mesh.frustumCulled = false;
    body.parent!.add(mesh);
    const index = geometry.index!.clone();
    const projection = projectClothing(geometry, body.geometry);
    // Body-derived shells share its topology. Their covered faces must match
    // actual garment triangles; a union of nearby vertices creates holes at hems.
    const coverageFaces = !coverage.size ? new Set<string>() : geometry.getAttribute("_vid")
      ? coveredBodyFaces(index, projection, coverage)
      : coveredBodyFaces(bodyIndex, projectClothing(body.geometry, body.geometry), coverage);
    const piece = { mesh, index, projection, coverage, coverageFaces };
    pieces.push(piece);
    return piece;
  };

  const shell = (part: "top" | "bottom" | "socks", suffix = "") => {
    const length = recipe.kind === "dress" && part === "top" ? 1 : recipe.length ?? 1;
    let low = waist + (shoulder - waist) * (1 - length), high = shoulder + 0.045 - (recipe.neckline ?? 0) * 0.2;
    // A bra is a band round the chest with two straps, not a cropped top.
    if (definition.slot === "bra") { high = shoulder - 0.015 - (recipe.neckline ?? 0) * 0.5; low = high - length * 0.2; }
    // Briefs have slanted leg openings: the shorter the cut, the higher they
    // rise toward the hip. Boxers and trunks (tilt 0) end in a flat hem.
    const briefs = definition.slot === "underwearBottom";
    const tilt = briefs ? Math.max(0, (0.26 - length) * 7) : 0;
    if (part === "bottom") {
      high = waist - (recipe.neckline ?? 0);
      low = briefs ? hip - 0.08 - (hip - ankle) * Math.max(0, length - 0.12) : waist - (waist - ankle + 0.04) * length;
    }
    if (part === "socks") { low = -0.02; high = ankle + Math.max(0.04, (knee - ankle) * length); }
    // Membership is decided per vertex *without* height (so shoulders and
    // crotch don't leave holes where bone weights blend); height is applied per
    // triangle afterwards and the cut edge is flattened onto the hem line.
    const armLow = shoulder - (shoulder - wrist) * (recipe.sleeves ?? 0);
    const armWeight = (i: number) => weightFor(i, (name) => /^(upperarm_|lowerarm_)/.test(name));
    const member = (i: number) => {
      if (part !== "top") return legs(i);
      if (weightFor(i, (name) => /^(neck_|head|hand_|thumb|index|middle|ring|pinky)/.test(name)) >= 0.5) return false;
      if (weightFor(i, (name) => /^(thigh_|calf_|foot_|ball_)/.test(name)) >= 0.5) return false;
      if (armWeight(i) >= 0.5) return (recipe.sleeves ?? 0) > 0;
      if (recipe.openFront && points.getZ(i) > joints.pelvis[2] && Math.abs(points.getX(i)) < 0.065) return false;
      return true;
    };
    const triangles: number[] = [];
    for (let i = 0; i < bodyIndex.count; i += 3) {
      const triangle = [bodyIndex.getX(i), bodyIndex.getX(i + 1), bodyIndex.getX(i + 2)];
      if (triangle.every(member)) triangles.push(...triangle);
    }
    const arm = (v: number) => part === "top" && armWeight(v) >= 0.5;
    const geometry = clipToBand(body.geometry, triangles, (v) => arm(v) ? armLow : low, (v) => arm(v) ? Infinity : high, arm, tilt);
    const clippedIds = geometry.getAttribute("_vid");
    const coverage = new Set<number>();
    for (const v of geometry.index!.array) coverage.add(Math.round(clippedIds.getX(v)));
    const positions = geometry.getAttribute("position"), vertexNormals = geometry.getAttribute("normal");
    for (let i = 0; i < positions.count; i++) positions.setXYZ(i, positions.getX(i) + vertexNormals.getX(i) * offset, positions.getY(i) + vertexNormals.getY(i) * offset, positions.getZ(i) + vertexNormals.getZ(i) * offset);
    attach(geometry, body, coverage, suffix);
  };

  const skirt = (suffix = "") => {
    const template = templates.get("a_line_skirt");
    if (!template) return;
    const original = template.geometry.getAttribute("position");
    let oldHem = Infinity;
    for (let i = 0; i < original.count; i++) oldHem = Math.min(oldHem, original.getY(i));
    const hem = waist - (waist - ankle) * (recipe.length ?? 0.65);
    const scale = (waist - hem) / (waist - oldHem);
    let waistX = 0.1, waistZ = 0.07, hipX = 0.16, hipZ = 0.09, waistVertex = 0, waistDistance = Infinity;
    for (let i = 0; i < points.count; i++) {
      if (!legs(i)) continue;
      const y = points.getY(i), x = Math.abs(points.getX(i)), z = Math.abs(points.getZ(i) - joints.pelvis[2]);
      if (Math.abs(y - waist) < 0.04) { waistX = Math.max(waistX, x); waistZ = Math.max(waistZ, z); }
      if (Math.abs(y - hip) < 0.07) { hipX = Math.max(hipX, x); hipZ = Math.max(hipZ, z); }
      const distance = Math.abs(y - waist) + x;
      if (distance < waistDistance) { waistVertex = i; waistDistance = distance; }
    }
    const segments = 48, rows = 10;
    const vertices: number[] = [], uv: number[] = [], triangles: number[] = [], nearest: number[] = [];
    for (let row = 0; row <= rows; row++) for (let column = 0; column <= segments; column++) {
      const t = row / rows, angle = column / segments * Math.PI * 2;
      const aroundHip = Math.min(1, t * (waist - hem) / Math.max(0.05, waist - hip));
      const flare = 1 + ((recipe.flare ?? 1) - 1) * t;
      const pleat = (recipe.pleats ? Math.cos(angle * recipe.pleats) * 0.006 : 0) * t;
      const rx = (waistX + (hipX - waistX) * aroundHip) * flare + offset + pleat;
      const rz = (waistZ + (hipZ - waistZ) * aroundHip) * flare + offset + pleat;
      const x = Math.cos(angle) * rx, z = joints.pelvis[2] + Math.sin(angle) * rz;
      vertices.push(x, waist - t * (waist - hem), z); uv.push(column / segments, 1 - t);
      const referenceY = waist - t * (waist - oldHem);
      let closest = 0, distance = Infinity;
      for (let i = 0; i < original.count; i++) {
        const d = (original.getX(i) - x) ** 2 + (original.getY(i) - referenceY) ** 2 + (original.getZ(i) - z) ** 2;
        if (d < distance) { distance = d; closest = i; }
      }
      nearest.push(closest);
      if (row < rows && column < segments) {
        const a = row * (segments + 1) + column, b = a + 1, c = a + segments + 1, d = c + 1;
        triangles.push(a, b, c, b, d, c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(triangles);
    const templateBones = template.geometry.getAttribute("skinIndex"), templateWeights = template.geometry.getAttribute("skinWeight");
    const skinIds = new Uint16Array(nearest.length * 4), skinValues = new Float32Array(nearest.length * 4);
    nearest.forEach((source, i) => { for (let c = 0; c < 4; c++) { skinIds[i * 4 + c] = templateBones.getComponent(source, c); skinValues[i * 4 + c] = templateWeights.getComponent(source, c); } });
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIds, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinValues, 4));
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = (template.geometry.morphAttributes.position ?? []).map((attribute, target) => {
      const result = new Float32Array(nearest.length * 3);
      const waistDelta = body.geometry.morphAttributes.position?.[target]?.getY(waistVertex) ?? 0;
      nearest.forEach((source, i) => { result.set([attribute.getX(source), waistDelta + (attribute.getY(source) - waistDelta) * scale, attribute.getZ(source)], i * 3); });
      return new THREE.Float32BufferAttribute(result, 3);
    });
    geometry.computeVertexNormals();
    const coverage = new Set<number>();
    for (let i = 0; i < points.count; i++) if (legs(i) && points.getY(i) >= hem && points.getY(i) <= waist) coverage.add(Math.round(ids.getX(i)));
    attach(geometry, template, coverage, suffix);
  };

  // Small tailored details share the same skeleton and inherit morph movement
  // from their nearest body vertices. This also makes accessories real meshes.
  const patch = (geometry: THREE.BufferGeometry, suffix: string, fixedColor?: string) => {
    const positions = geometry.getAttribute("position");
    const nearest: number[] = [];
    const indices = new Uint16Array(positions.count * 4), influence = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      const p = xyz(positions, i);
      let index = 0, distance = Infinity;
      for (let j = 0; j < points.count; j++) { const d = p.distanceToSquared(xyz(points, j)); if (d < distance) { index = j; distance = d; } }
      nearest.push(index);
      for (let c = 0; c < 4; c++) { indices[i * 4 + c] = bones.getComponent(index, c); influence[i * 4 + c] = weights.getComponent(index, c); }
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(influence, 4));
    geometry.morphTargetsRelative = body.geometry.morphTargetsRelative;
    geometry.morphAttributes.position = body.geometry.morphAttributes.position?.map((attribute) => {
      const result = new Float32Array(positions.count * 3);
      nearest.forEach((index, i) => { const delta = xyz(attribute, index); result.set(delta.toArray(), i * 3); });
      return new THREE.Float32BufferAttribute(result, 3);
    }) ?? [];
    const piece = attach(geometry, body, new Set(), suffix);
    piece.mesh.userData.fixedColor = fixedColor;
  };
  const front = (x: number, y: number) => {
    let z = joints.pelvis[2];
    for (let i = 0; i < points.count; i++) if (torso(i) && Math.abs(points.getY(i) - y) < 0.055 && Math.abs(points.getX(i) - x) < 0.1) z = Math.max(z, points.getZ(i));
    return z + offset + 0.014;
  };
  const box = (name: string, x: number, y: number, w: number, h: number, color?: string) => {
    const geometry = new THREE.BoxGeometry(w, h, 0.012); geometry.translate(x, y, front(x, y)); patch(geometry, name, color);
  };
  const band = (name: string, y: number, height: number, aroundWrists = false) => {
    const geometry = body.geometry.clone(), indices: number[] = [];
    for (let i = 0; i < bodyIndex.count; i += 3) {
      const triangle = [bodyIndex.getX(i), bodyIndex.getX(i + 1), bodyIndex.getX(i + 2)];
      if (triangle.every((v) => Math.abs(points.getY(v) - y) < height / 2 && (aroundWrists ? weightFor(v, (name) => /^(lowerarm_|hand_)/.test(name)) > 0.5 : torso(v)))) indices.push(...triangle);
    }
    geometry.setIndex(indices);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) positions.setXYZ(i, points.getX(i) + normals.getX(i) * offset, points.getY(i) + normals.getY(i) * offset, points.getZ(i) + normals.getZ(i) * offset);
    attach(geometry, body, new Set(), name);
  };

  if (recipe.kind === "shell") shell(recipe.part ?? "top");
  if (recipe.kind === "shell" && definition.slot === "bra") {
    // Straps: vertical strips of the body surface, so they run from the band up
    // over each shoulder and down the back at any body shape.
    const wide = (recipe.neckline ?? 0) < 0.1;
    const centre = wide ? 0.075 : 0.065, half = wide ? 0.022 : 0.011;
    const bandTop = shoulder - 0.015 - (recipe.neckline ?? 0) * 0.5;
    const strapOk = (v: number) => weightFor(v, (name) => /^(neck_|head|hand_|upperarm_|lowerarm_|thigh_|calf_|foot_)/.test(name)) < 0.5;
    const triangles: number[] = [];
    for (let i = 0; i < bodyIndex.count; i += 3) {
      const triangle = [bodyIndex.getX(i), bodyIndex.getX(i + 1), bodyIndex.getX(i + 2)];
      const xs = triangle.map((v) => points.getX(v));
      if (triangle.every(strapOk) && (xs.every((x) => x > 0) || xs.every((x) => x < 0))) triangles.push(...triangle);
    }
    const strips = clipToBand(body.geometry, triangles, () => centre - half, () => centre + half, () => false, 0, 3);
    const geometry = clipToBand(strips, Array.from(strips.index!.array), () => bandTop - 0.005, () => Infinity);
    if (geometry.index!.count) {
      const positions = geometry.getAttribute("position"), vertexNormals = geometry.getAttribute("normal");
      for (let i = 0; i < positions.count; i++) positions.setXYZ(i, positions.getX(i) + vertexNormals.getX(i) * offset, positions.getY(i) + vertexNormals.getY(i) * offset, positions.getZ(i) + vertexNormals.getZ(i) * offset);
      attach(geometry, body, new Set(), "straps");
    }
  }
  if (recipe.kind === "skirt") skirt();
  if (recipe.kind === "dress") { shell("top"); skirt("skirt"); }
  if (recipe.kind === "shoes") {
    const template = templates.get("shoes");
    if (template) {
      const geometry = template.geometry.clone();
      const index = geometry.index!, position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      if (recipe.ease) for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i) + normal.getX(i) * recipe.ease, position.getY(i) + normal.getY(i) * recipe.ease, position.getZ(i) + normal.getZ(i) * recipe.ease);
      const keep: number[] = [];
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        const y = triangle.reduce((sum, v) => sum + position.getY(v), 0) / 3;
        const z = triangle.reduce((sum, v) => sum + position.getZ(v), 0) / 3;
        if (recipe.shoe === "sandal" && y > ankle + 0.015 && z > 0.06) continue;
        if ((recipe.shoe === "flat" || recipe.shoe === "loafer") && y > ankle + (recipe.shoe === "flat" ? 0.03 : 0.05)) continue;
        keep.push(...triangle);
      }
      geometry.setIndex(keep);
      const projection = projectClothing(geometry, body.geometry), coverage = new Set<number>();
      for (const vertex of keep) coverage.add(projection[vertex]);
      attach(geometry, template, coverage);
    }
    if (recipe.shoe === "boot" || recipe.shoe === "ankle-boot") shell("socks", "uppers");
  }
  if (recipe.kind === "accessory") {
    const length = recipe.length ?? 1;
    switch (recipe.accessory) {
      case "tie": box("tie", 0, shoulder - 0.17 * length, 0.035, 0.28 * length); break;
      case "bow": box("bow", 0, shoulder - 0.005, 0.11, 0.045); break;
      case "scarf": band("neck", shoulder - 0.015, 0.09); box("scarf", 0.06, shoulder - 0.2, 0.085, 0.4); break;
      case "neckerchief": band("neck", shoulder - 0.01, 0.1); box("point", 0, shoulder - 0.08, 0.09, 0.13); break;
      case "belt": band("belt", waist, 0.075); box("buckle", 0, waist, 0.055, 0.045, "#a8a29e"); break;
      case "sash": band("sash", waist, 0.13); break;
      case "suspenders": box("left", -0.095, (waist + shoulder) / 2, 0.025, shoulder - waist); box("right", 0.095, (waist + shoulder) / 2, 0.025, shoulder - waist); break;
      case "watch": band("strap", wrist + 0.04, 0.075, true); box("face", -joints.hand_l[0], wrist + 0.04, 0.045, 0.045, "#d4d4d8"); break;
      default: band("wrist", wrist + 0.04, 0.09, true);
    }
  }
  if (recipe.detail) {
    // An open-front jacket has nothing across the middle: its collar, buttons
    // and pocket sit on the two fronts either side of the opening (|x| > 0.065).
    const open = !!recipe.openFront, edge = open ? 0.12 : 0.04, side = open ? 0.17 : 0.09;
    box("collar-left", -edge, shoulder + 0.005, 0.06, 0.045);
    box("collar-right", edge, shoulder + 0.005, 0.06, 0.045);
    if (recipe.detail === "zip") box("zip", 0, (waist + shoulder) / 2, 0.008, shoulder - waist, "#94a3b8");
    else {
      if (open) for (let i = 0; i < 2; i++) box(`button-${i}`, 0.115, shoulder - 0.17 - i * 0.07, 0.009, 0.009, "#94a3b8");
      else for (let i = 0; i < 4; i++) box(`button-${i}`, 0, shoulder - 0.055 - i * 0.065, 0.009, 0.009, "#94a3b8");
      box("pocket", -side, shoulder - (open ? 0.24 : 0.13), 0.075, 0.08);
    }
    if (recipe.detail === "uniform" && recipe.kind === "dress") band("waistband", waist, 0.07);
  }
  return pieces;
}
