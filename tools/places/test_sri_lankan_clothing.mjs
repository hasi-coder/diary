// Run with: node tools/places/test_sri_lankan_clothing.mjs
// Uses the shipped body asset without a browser or image decoder.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scratch = await mkdtemp(join(tmpdir(), "my-diary-sri-lankan-clothing-"));
let runtime;
try {
  const outfile = join(scratch, "body.mjs");
  await build({ stdin: {
    contents: `export { Body } from './src/components/world/body';
      export { OUTFITS, outfitProblems, applyOutfit } from './src/lib/places/outfits';
      export { SRI_LANKAN_GARMENTS } from './src/lib/places/sriLankanClothing';
      export { garment, garmentsFor, clothingProblems, withSlot, legacyFields } from './src/lib/places/garments';
      export * as THREE from 'three';
      export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';`, resolveDir: root,
  }, outfile, bundle: true, format: "esm", platform: "node" });
  runtime = await import(pathToFileURL(outfile));
} finally { await rm(scratch, { recursive: true, force: true }); }
const { Body, OUTFITS, outfitProblems, applyOutfit, SRI_LANKAN_GARMENTS, garment, garmentsFor, clothingProblems, withSlot, legacyFields, THREE, GLTFLoader } = runtime;
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
// Keep the shipped skeleton and geometry, stripping only textures/materials so
// GLTFLoader does not need the browser's image decoder.
const original = await readFile(join(root, "public/places/body.glb"));
const oldLength = original.readUInt32LE(12);
const document = JSON.parse(original.toString("utf8", 20, 20 + oldLength));
delete document.images;
delete document.textures;
delete document.materials;
for (const mesh of document.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const encoded = Buffer.from(JSON.stringify(document));
const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
encoded.copy(padded);
const header = Buffer.from(original.subarray(0, 20));
header.writeUInt32LE(20 + padded.length + original.length - 20 - oldLength, 8);
header.writeUInt32LE(padded.length, 12);
const glb = Buffer.concat([header, padded, original.subarray(20 + oldLength)]);
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "");
const bodyMeta = await json("public/places/body.json");
const neutral = () => ({
  legs: [0, 0], knees: [0, 0], arms: [[0, 0], [0, 0]],
  elbows: [0, 0], forearms: [0, 0], wrists: [[0, 0, 0], [0, 0, 0]], ankles: [[0, 0], [0, 0]],
  lean: 0, tilt: 0, twist: 0, neck: [0, 0, 0], head: [0, 0, 0],
});
const outfitIds = ["sl-saree", "sl-osariya", "sl-redda-hatte", "sl-salwar-kameez"];
const presets = outfitIds.map((id) => OUTFITS.find((outfit) => outfit.id === id));
const shape = { shape: 0, years: 35, weight: 0, muscle: 0, height: 0, proportions: 0.3, bust: 0, anatomy: "none" };
const piecesOf = (body, id) => {
  const result = [];
  body.root.traverse((mesh) => { if (mesh.userData.garmentId === id) result.push(mesh); });
  return result;
};

await test("Sri Lankan presets use independently editable pieces and preserve underwear", () => {
  assert.equal(SRI_LANKAN_GARMENTS.length, 9);
  for (const preset of presets) {
    assert.ok(preset);
    assert.deepEqual(outfitProblems(preset), [], preset.id);
    const retained = [{ garment: "neutral_underwear_trunks", color: "#123abc" }];
    const worn = applyOutfit(preset, retained).wearing;
    assert.ok(worn.some((piece) => piece.garment === retained[0].garment && piece.color === retained[0].color));
    assert.deepEqual(clothingProblems(worn), []);
  }
  for (const piece of SRI_LANKAN_GARMENTS) {
    assert.equal(garment(piece.id), piece);
    assert.ok(garmentsFor(piece.layer, "all").includes(piece));
    assert.ok(garmentsFor(piece.layer, "feminine").includes(piece));
  }
  const saree = presets[0].wearing;
  assert.equal(legacyFields(saree).skirt, true);
  const trousers = withSlot(saree, "bottom", { garment: "jeans", color: "#123abc" });
  assert.ok(!trousers.some((w) => w.garment === "feminine_base_saree"));
  assert.ok(trousers.some((w) => w.garment === "feminine_base_saree_blouse"));
  const dress = withSlot(saree, "dress", { garment: "feminine_base_school_frock", color: "#ffffff" });
  assert.ok(!dress.some((w) => ["top", "bottom"].includes(garment(w.garment).slot)));
});

await test("regional garments have distinct rigged drapes, borders and finite morphs", () => {
  const body = new Body({ scene: gltf.scene, meta: bodyMeta });
  body.setShape(shape);
  for (const definition of SRI_LANKAN_GARMENTS) {
    body.wear([{ garment: definition.id, color: "#be123c" }]);
    const pieces = piecesOf(body, definition.id);
    assert.ok(pieces.length && pieces.every((mesh) => mesh.geometry.index.count > 0), definition.id);
    for (const mesh of pieces) {
      assert.equal(mesh.skeleton, body.root.getObjectByName("body").skeleton);
      assert.ok(Object.keys(mesh.morphTargetDictionary).length >= 15, mesh.name);
      for (const attribute of [mesh.geometry.getAttribute("position"), mesh.geometry.getAttribute("skinWeight"), ...mesh.geometry.morphAttributes.position]) {
        assert.ok(Array.from(attribute.array).every(Number.isFinite), `${mesh.name}: finite attributes`);
      }
      const weights = mesh.geometry.getAttribute("skinWeight");
      for (let i = 0; i < weights.count; i++) assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-5, `${mesh.name}: normalized skin weights`);
    }
  }
  for (const preset of presets) {
    body.wear(preset.wearing);
    assert.ok(piecesOf(body, "feminine_base_" + (preset.id === "sl-salwar-kameez" ? "kameez" : preset.id === "sl-redda-hatte" ? "redda" : preset.id.slice(3))).some((mesh) => mesh.visible), preset.id);
  }
  body.wear(presets[0].wearing);
  const pallu = body.root.getObjectByName("feminine_base_saree:pallu-front");
  assert.ok(pallu?.visible);
  assert.ok(body.root.getObjectByName("feminine_base_saree:pallu-back")?.visible);
  assert.ok(body.root.getObjectByName("feminine_base_saree:hem-border")?.visible);
  for (const next of [{ ...shape, weight: 0.8, height: 0.5, bust: 0.6 }, { ...shape, shape: 1, weight: -0.7, years: 72 }]) {
    body.setShape(next); body.pose(neutral()); body.root.updateMatrixWorld(true); pallu.skeleton.update();
    for (let i = 0; i < pallu.geometry.getAttribute("position").count; i++) assert.ok(pallu.getVertexPosition(i, new THREE.Vector3()).toArray().every(Number.isFinite));
  }
  body.wear(presets[1].wearing);
  assert.ok(body.root.getObjectByName("feminine_base_osariya:neriya-frill")?.visible);
  body.wear(presets[3].wearing);
  assert.ok(piecesOf(body, "feminine_base_kameez").some((mesh) => mesh.visible));
  assert.ok(piecesOf(body, "feminine_base_salwar").some((mesh) => mesh.visible));
  assert.ok(body.root.getObjectByName("feminine_accessories_dupatta:dupatta-left")?.visible);
  body.dispose();
});

await test("shoes preserve long wrap hems and decorative dupattas preserve the tunic underneath", () => {
  const body = new Body({ scene: gltf.scene, meta: bodyMeta });
  body.setShape(shape);
  const saree = { garment: "feminine_base_saree", color: "#b91c1c" };
  body.wear([saree]);
  const skirt = body.root.getObjectByName(saree.garment);
  const border = body.root.getObjectByName(`${saree.garment}:hem-border`);
  const before = [skirt.geometry.index.count, border.geometry.index.count];
  body.wear([saree, { garment: "feminine_footwear_sandals", color: "#78350f" }]);
  assert.deepEqual([skirt.geometry.index.count, border.geometry.index.count], before, "projecting to the feet must not erase a hanging hem");
  const tunic = presets[3].wearing.filter((w) => w.garment !== "feminine_accessories_dupatta");
  body.wear(tunic);
  const counts = piecesOf(body, "feminine_base_kameez").map((mesh) => mesh.geometry.index.count);
  body.wear(presets[3].wearing);
  assert.deepEqual(piecesOf(body, "feminine_base_kameez").map((mesh) => mesh.geometry.index.count), counts, "a decorative shawl does not cut holes in the longer tunic");
  body.dispose();
});

await test("long wrap hems stay level on both body shapes in the fitting pose, with visible front folds", () => {
  const body = new Body({ scene: gltf.scene, meta: bodyMeta });
  for (const next of [{ ...shape, shape: 0, bust: 0.4 }, { ...shape, shape: 1, bust: -0.85 }, { ...shape, shape: 1, weight: 0.7, height: 0.5 }]) {
    body.setShape(next);
    for (const preset of presets.slice(0, 2)) {
      body.wear(preset.wearing);
      body.pose({ ...neutral(), arms: [[0, 22 * Math.PI / 180], [0, 22 * Math.PI / 180]], elbows: [0.07, 0.07] });
      body.root.updateMatrixWorld(true);
      const wrap = body.root.getObjectByName(preset.id === "sl-saree" ? "feminine_base_saree" : "feminine_base_osariya");
      wrap.skeleton.update();
      const points = wrap.geometry.getAttribute("position");
      const neutralHem = Math.min(...Array.from({ length: points.count }, (_, i) => points.getY(i)));
      const hem = Array.from({ length: points.count }, (_, i) => i).filter((i) => Math.abs(points.getY(i) - neutralHem) < 1e-6);
      const heights = hem.map((i) => wrap.getVertexPosition(i, new THREE.Vector3()).y);
      assert.ok(Math.max(...heights) - Math.min(...heights) < 1e-5, `${preset.id}: a level hem after morphing`);
      const front = hem.filter((i) => Math.abs(points.getX(i)) < 0.06 && points.getZ(i) > 0.1).map((i) => points.getZ(i));
      assert.ok(front.length > 5 && Math.max(...front) - Math.min(...front) > 0.015, `${preset.id}: resolved cloth folds at the front`);
    }
  }
  body.dispose();
});
