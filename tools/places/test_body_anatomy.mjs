// Run with: node tools/places/test_body_anatomy.mjs
// Uses the shipped body asset without a browser or image decoder.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scratch = await mkdtemp(join(tmpdir(), "my-diary-anatomy-"));
let runtime;
try {
  const outfile = join(scratch, "body.mjs");
  await build({ stdin: {
    contents: `export { Body, shapeOf } from './src/components/world/body';
      export { characterOf } from './src/lib/places/character';
      export * as THREE from 'three';
      export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';`, resolveDir: root,
  }, outfile, bundle: true, format: "esm", platform: "node" });
  runtime = await import(pathToFileURL(outfile));
} finally { await rm(scratch, { recursive: true, force: true }); }
const { Body, shapeOf, characterOf, THREE, GLTFLoader } = runtime;
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
await test("adult anatomy follows skin, morphs and pelvis; garments cover it and age changes remove it", () => {
  const person = new Body({ scene: gltf.scene, meta: bodyMeta });
  const shape = { shape: 1, years: 35, weight: 0, muscle: 0, height: 0, proportions: 0.3, bust: -0.85, anatomy: "penis", adult: true };
  person.setShape(shape);
  person.wear([]);
  const mesh = person.root.getObjectByName("anatomy:penis");
  assert.ok(mesh?.isSkinnedMesh && mesh.visible);
  assert.equal(mesh.skeleton, person.root.getObjectByName("body").skeleton);
  person.setSkin("#825c43");
  assert.equal(mesh.material.color.getHexString(), "825c43");
  person.pose(neutral());
  person.root.updateMatrixWorld(true);
  mesh.skeleton.update();
  const rest = mesh.getVertexPosition(32, new THREE.Vector3());
  person.pose({ ...neutral(), lean: 0.35, legs: [0.8, -0.4] });
  person.root.updateMatrixWorld(true);
  for (const bone of mesh.skeleton.bones) bone.updateMatrixWorld(true);
  mesh.skeleton.update();
  const posed = mesh.getVertexPosition(32, new THREE.Vector3());
  assert.ok(posed.distanceTo(rest) < 1e-5, "leg and spine motion do not pull the pelvis attachment apart");
  const pelvis = person.bone("pelvis"), rotation = pelvis.quaternion.clone();
  pelvis.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35));
  person.root.updateMatrixWorld(true);
  mesh.skeleton.update();
  assert.ok(mesh.getVertexPosition(32, new THREE.Vector3()).distanceTo(rest) > 0.01, "anatomy follows pelvis motion");
  pelvis.quaternion.copy(rotation);
  for (const id of ["boxer_briefs", "jeans", "a_line_skirt", "feminine_underwear_briefs", "feminine_base_school_frock"]) {
    person.wear([{ garment: id, color: "#ffffff" }]);
    assert.equal(mesh.visible, false, id);
  }
  person.wear([{ garment: "tee", color: "#ffffff" }]);
  assert.equal(mesh.visible, true, "a top leaves lower anatomy visible");
  person.wear([]);
  person.setShape({ ...shape, anatomy: "vulva", shape: 0, weight: 0.8, height: 0.6 });
  const vulva = person.root.getObjectByName("anatomy:vulva");
  assert.ok(vulva?.visible);
  assert.equal(mesh.visible, false, "switching anatomy hides the previous mesh");
  assert.ok(vulva.morphTargetInfluences[vulva.morphTargetDictionary.heavy] > 0.7);
  for (const anatomy of [mesh, vulva]) {
    for (const attribute of [anatomy.geometry.getAttribute("position"), ...anatomy.geometry.morphAttributes.position]) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite), "all fitted positions are finite");
    }
  }
  for (const years of [8, 15, 17, 18, 19, NaN]) {
    person.setShape({ ...shape, years });
    assert.equal(mesh.visible, false, `no detailed anatomy at age ${years}`);
    assert.equal(vulva.visible, false);
  }
  person.setShape({ ...shape, adult: false });
  assert.equal(mesh.visible, false, "child and teen presets cannot opt in through anatomy selection");
  person.setShape({ ...shape, years: 72 });
  assert.equal(mesh.visible, true, "elder anatomy is supported");
  person.setShape({ ...shape, anatomy: "none" });
  assert.equal(mesh.visible, false);
  person.dispose();
  assert.equal(person.root.getObjectByName("anatomy:penis"), undefined);
});

await test("anatomy choices persist independently of figure, and child and teen shapes are excluded", () => {
  const profile = { id: "anatomy-check", terms: "neutral", birthday: "", character: { age: "adult", figure: "feminine", anatomy: "penis" } };
  const look = characterOf(profile);
  assert.equal(look.anatomy, "penis");
  assert.equal(shapeOf(look).anatomy, "penis");
  assert.equal(shapeOf({ ...look, anatomy: "auto" }).anatomy, "vulva");
  assert.equal(shapeOf({ ...look, figure: "neutral", anatomy: "auto" }).anatomy, "none");
  for (const age of ["child", "teen"]) assert.equal(shapeOf({ ...look, age }).adult, false);
  const teenBirthday = `${new Date().getFullYear() - 15}-01-01`;
  assert.equal(shapeOf(look, teenBirthday).adult, false, "a known minor birthday overrides an adult appearance preset");
});
