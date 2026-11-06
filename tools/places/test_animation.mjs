// Run with: node tools/places/test_animation.mjs
// Exercises the real GLB skeleton without a browser or GPU.
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scratch = await mkdtemp(join(tmpdir(), "my-diary-animation-"));
let animation;
try {
  const outfile = join(scratch, "animation.mjs");
  await build({
    stdin: {
      contents: `export * from './src/lib/places/interaction';
        export * from './src/lib/places/interactionPolicy';
        export { World } from './src/lib/places/world';
        export { Body } from './src/components/world/body';
        export { OUTFITS } from './src/lib/places/outfits';
        export { outfitProblems, applyOutfit } from './src/lib/places/outfits';
        export { outfitOf, withSlot, GARMENTS, CLOTHING_LAYERS, CLOTHING_STYLES, clothingProblems, normalizeWorn, garment } from './src/lib/places/garments';
        export { ageRequirement } from './src/lib/places/interaction';
        export { setShowLockedActions } from './src/lib/interactionSettings';
        export { interactionAccess } from './src/lib/places/interactionPolicy';
        export { interactionGate, interactionHidden, interactionDressed } from './src/lib/places/interactionPolicy';
        export { categoryTree, categoriesOf } from './src/lib/places/interactions/categories';
        export { furnitureToUse, usable } from './src/lib/places/furnitureActions';
        export { longestPlantHold } from './src/lib/places/interaction';
        export { mirrorInteraction } from './src/lib/places/interaction';
        export { lengthOf, interactionWarnings } from './src/lib/places/interaction';
        export { solveTwoBone, KNEEL_DROP, KNEEL_ANKLE, handPlantTarget } from './src/components/world/ik';
        export { CLOTHING_CATALOG } from './src/lib/places/clothingCatalog';
        export { FACE_DEFS, FACE_VIEWS, FALLBACK_VIEW, FACE_SLOTS } from './src/lib/places/character';
        export { setInteractionMinimumAge } from './src/lib/interactionSettings';
        export { normalizeClothingFit, withClothingFit } from './src/lib/places/clothingFit';
        export * as THREE from 'three';
        export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';`,
      resolveDir: root,
    },
    outfile, bundle: true, format: "esm", platform: "node",
  });
  animation = await import(pathToFileURL(outfile));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
const { handPlantTarget, poseAt, interactionProblems, INTERACTION_POLICY, interactionEnabled, interactionPolicyProblem, setInteractionEnabled, setInteractionMinimumAge, subscribeInteractionPolicy, OUTFITS, outfitProblems, applyOutfit, outfitOf, withSlot, GARMENTS, CLOTHING_LAYERS, CLOTHING_STYLES, clothingProblems, normalizeWorn, garment, CLOTHING_CATALOG, solveTwoBone, KNEEL_DROP, KNEEL_ANKLE, ageRequirement, mirrorInteraction, furnitureToUse, interactionAccess, categoryTree, categoriesOf, longestPlantHold, setShowLockedActions, interactionGate, interactionHidden, interactionDressed, lengthOf, interactionWarnings, FACE_DEFS, FACE_VIEWS, FALLBACK_VIEW, FACE_SLOTS, World, Body, THREE, GLTFLoader } = animation;
const { normalizeClothingFit, withClothingFit } = animation;
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const interaction = (keys, loop = false) => ({
  id: "joint-check", label: "Joint check", people: { min: 1, max: 1 }, beat: 1, length: 4, loop,
  formation: { type: "stay", role: "person" }, roles: { person: keys },
});

await test("new joints interpolate, return to neutral, and blend across loop boundaries", () => {
  const def = interaction([
    { beat: 0 },
    { beat: 2, elbowL: 90, forearmR: 60, wristL: [20, -10, 30], ankleR: [30, 10], head: [10, 40, -20], neck: [4, 8, 12], twist: 30 },
    { beat: 4 },
  ]);
  assert.deepEqual(interactionProblems(def), []);
  const mid = poseAt(def, "person", 1);
  assert.equal(mid.elbowL, 45);
  assert.equal(mid.forearmR, 30);
  assert.deepEqual(mid.wristL, [10, -5, 15]);
  assert.deepEqual(mid.ankleR, [15, 5]);
  assert.deepEqual(mid.head, [5, 20, -10]);
  assert.deepEqual(mid.neck, [2, 4, 6]);
  assert.equal(mid.twist, 15);
  assert.equal(poseAt(def, "person", 4).elbowL, 0);
  const loop = interaction(def.roles.person.slice(0, 2), true);
  assert.equal(poseAt(loop, "person", 3).elbowL, 45);
  assert.equal(poseAt(loop, "person", -1).elbowL, 45);
  assert.equal(poseAt(loop, "person", 4).elbowL, 0);
});

await test("all animation files load, with neutral defaults for joints they omit", async () => {
  const folder = "src/lib/places/interactions";
  for (const file of await readdir(join(root, folder))) {
    if (!file.endsWith(".json") || file === "categories.json" || /^test[_-]/.test(file)) continue;
    const def = await json(`${folder}/${file}`);
    assert.deepEqual(interactionProblems(def), [], file);
    for (const role of Object.keys(def.roles)) {
      const pose = poseAt(def, role, 1.25);
      if (!def.roles[role].some((key) => key.elbowR !== undefined)) assert.equal(pose.elbowR, 0, file);
      if (!def.roles[role].some((key) => key.wristR !== undefined)) assert.deepEqual(pose.wristR, [0, 0, 0], file);
      if (!def.roles[role].some((key) => key.head !== undefined)) assert.deepEqual(pose.head, [0, 0, 0], file);
    }
  }
});

const action = (id) => json(`src/lib/places/interactions/${id}.json`);
function household() {
  const floor = {
    name: "Household check", width: 12, depth: 10, entrance: [0, 0],
    rooms: [{ name: "Room", rect: [0, 0, 12, 10] }], doors: [],
    items: [
      { kind: "bed", x: 2, y: 1, w: 2, h: 3 }, { kind: "wardrobe", x: 7, y: 1, w: 2 },
      { kind: "sink", x: 7, y: 4 }, { kind: "shower", x: 10, y: 4 },
      { kind: "bath", x: 8, y: 7, w: 3 }, { kind: "toilet", x: 2, y: 7 },
      { kind: "sofa", x: 5, y: 7, w: 2 },
    ],
  };
  const world = new World(floor);
  const me = world.addAuthor({ id: "me", name: "Me", birthday: "1985-01-01", terms: "neutral" });
  const partner = world.add({ id: "partner", name: "Partner", birthday: "1986-01-01", terms: "neutral" }, "guest", { cell: [1, 0] });
  return { world, me, partner };
}
function advance(world, until, seconds = 60) {
  for (let i = 0; i < seconds * 20; i++) {
    world.update(0.05);
    if (until()) return;
  }
  assert.fail("Activity did not reach the expected state in time.");
}

await test("all household actions reach their furniture, play and release resources", async () => {
  for (const id of ["wash-hands", "wash-face", "brush-teeth", "use-toilet", "shower", "bathe", "cuddle", "sleep", "sleep-together", "woohoo"]) {
    const { world, me, partner } = household();
    const def = await action(id);
    assert.equal(world.startActivity(def, def.people.min === 2 ? [me, partner] : [me]), true, id);
    advance(world, () => world.activity?.state === "playing");
    if (def.target.posture === "lie") assert.equal(me.rest.pitch, -Math.PI / 2, id);
    if (def.target.posture === "inside") assert.equal(me.hidden, false, id);
    if (def.target.posture === "sit") assert.ok(me.seat, id);
    if (def.cutaway) {
      assert.ok(def.outfitAt !== undefined, "Only outfit changes cut away");
      advance(world, () => world.presentation?.opacity === 1);
      assert.equal(me.hidden, true, id);
    } else {
      for (let i = 0; i < 400 && world.activity; i++) { world.update(0.05); assert.equal(me.hidden, false, `${id} stays on screen`); }
    }
    assert.equal(world.presentation, null, `${id} has no offscreen card`);
    if (def.loop) world.stopActivity();
    else advance(world, () => !world.activity);
    assert.equal(me.hidden, false, id);
    assert.equal(me.rest, null, id);
    assert.equal(me.held, null, id);
    assert.equal(me.pose, null, id);
    assert.ok(world.place.seats.every((seat) => !seat.reserved), id);
    if (def.target.leaveSeat) assert.equal(me.seat, null, id);
  }
});

await test("face views are complete, fall back to a shown view, and animations can choose them", async () => {
  assert.ok(FACE_VIEWS.length >= 11);
  assert.equal(new Set(Object.values(FACE_SLOTS)).size, FACE_VIEWS.length, "one photo slot per view");
  for (const view of FACE_VIEWS) {
    let shown = view;
    for (let i = 0; i < FACE_VIEWS.length && FALLBACK_VIEW[shown]; i++) shown = FALLBACK_VIEW[shown];
    assert.ok(["front", "left", "right", "back"].includes(shown), `${view} ends at a required view`);
  }
  const sleep = await action("sleep");
  assert.equal(poseAt(sleep, "sleeper", 1).face, "sleeping");
  assert.deepEqual(interactionProblems({ ...sleep, roles: { sleeper: [{ beat: 0, face: "nope" }] } }).length, 1);
});

await test("roles can use the bed differently: one lies, one stands beside it", async () => {
  for (const id of ["therapy-leg-massage", "therapy-bed-exercise", "doctor-abdomen-exam", "doctor-delivery"]) {
    const { world, me, partner } = household();
    const def = await action(id);
    assert.equal(world.startActivity(def, [me, partner]), true, id);
    advance(world, () => world.activity?.state === "playing");
    assert.ok(!me.rest, `${id}: the standing role stays up`);
    assert.equal(partner.rest.pitch, -Math.PI / 2, `${id}: the lying role rests on the bed`);
    world.stopActivity();
  }
});

await test("bathing takes everything off, the toilet only the lower body, and clothes return afterwards", async () => {
  const covers = (look) => outfitOf(look).flatMap((w) => garment(w.garment).covers);
  for (const [id, lower] of [["bathe", false], ["shower", false], ["use-toilet", true]]) {
    const { world, me } = household();
    const def = await action(id);
    const before = me.look;
    assert.ok(covers(before).includes("torso") && covers(before).includes("hips"));
    assert.equal(world.startActivity(def, [me]), true, id);
    advance(world, () => world.activity?.wardrobeApplied);
    const regions = covers(me.look);
    assert.ok(!regions.includes("hips") && !regions.includes("thighs"), `${id}: no lower body clothes`);
    assert.equal(regions.includes("torso"), lower, `${id}: top ${lower ? "stays" : "comes off"}`);
    world.stopActivity();
    assert.equal(me.look, before, `${id}: clothes come back`);
  }
});

await test("a role can sit on a bed's surface while another stands beside it", async () => {
  const { world, me, partner } = household();
  const def = structuredClone(await action("therapy-leg-massage"));
  def.target = { kinds: ["bed"], posture: "sit", roles: { therapist: { posture: "stand", side: "right", along: 0.5 }, client: { posture: "sit", side: "center", across: 0.25, facing: 90 } } };
  assert.deepEqual(interactionProblems(def), []);
  assert.equal(world.startActivity(def, [me, partner]), true);
  advance(world, () => world.activity?.state === "playing");
  assert.ok(!me.rest, "the standing role stays up");
  assert.equal(partner.rest.pitch, 0, "sitting is upright");
  assert.ok(partner.rest.height > 0.62, "hips rest above the mattress");
  world.stopActivity();
  assert.equal(partner.rest, null);
});

await test("oscillators, segments and lint", async () => {
  const base = interaction([{ beat: 0 }, { beat: 8 }], false);
  // A repeating wobble, with partners half a cycle apart.
  const wob = { ...base, roles: { a: [{ beat: 0 }, { beat: 8 }], b: [{ beat: 0 }, { beat: 8 }] }, oscillators: { a: [{ channel: "lean", amplitude: 10, period: 4, phase: "auto" }], b: [{ channel: "lean", amplitude: 10, period: 4, phase: "auto" }, { channel: "armL.0", amplitude: 5, period: 2 }] } };
  assert.equal(Math.round(poseAt(wob, "a", 1).lean), 10, "a quarter cycle in");
  assert.equal(Math.round(poseAt(wob, "b", 1).lean), -10, "the partner is in opposite phase");
  assert.equal(Math.round(poseAt(wob, "b", 0.5).armL[0]), 5, "tuple channels by index");
  assert.notDeepEqual(interactionProblems({ ...wob, oscillators: { a: [{ channel: "nope", amplitude: 1, period: 1 }] } }), []);
  // An intro, a middle that repeats, and an outro.
  const seg = { ...base, length: 8, segments: { intro: 2, loop: 4, repeat: 3 }, roles: { person: [{ beat: 0 }, { beat: 2, lean: 10 }, { beat: 4, lean: 30 }, { beat: 6, lean: 10 }, { beat: 8, lean: 0 }] } };
  assert.equal(lengthOf(seg), 16, "two extra repeats of the 4-beat middle");
  assert.equal(poseAt(seg, "person", 2).lean, poseAt(seg, "person", 6).lean, "the middle repeats");
  assert.equal(poseAt(seg, "person", 4).lean, poseAt(seg, "person", 12).lean);
  assert.equal(poseAt(seg, "person", 16).lean, 0, "the outro ends the clip");
  assert.deepEqual(interactionProblems(seg), []);
  assert.notDeepEqual(interactionProblems({ ...seg, segments: { loop: 20 } }), []);
  // Lint: loads, but flags likely mistakes. Shipped files should be clean.
  assert.equal(interactionWarnings({ ...base, speed: 2, roles: { person: [{ beat: 0, armLL: [0, 0], lean: 900 }] } }).length, 4);
  const folder = "src/lib/places/interactions";
  for (const file of await readdir(join(root, folder))) {
    if (!file.endsWith(".json") || file === "categories.json" || /^test[_-]/.test(file)) continue;
    assert.deepEqual(interactionWarnings(await json(`${folder}/${file}`)), [], file);
  }
});

await test("the age gate follows what an action does, not its id", async () => {
  const child = (a) => { a.profile.birthday = "2018-06-01"; a.look = { ...a.look, age: "child" }; };
  const undress = async (extra = {}) => ({ ...structuredClone(await action("therapy-leg-massage")), id: "renamed", wardrobe: { at: 1, restoreAt: 10, remove: ["hips", "thighs"] }, requires: { tier: "casual", wardrobe: ["hips", "thighs"] }, ...extra });
  const dressedFallback = { wardrobe: { at: 1, restoreAt: 10, remove: ["hips", "thighs"], fallback: "dressed" } };
  // Undressing the hips needs an adult, whatever the clip is called or declares.
  assert.equal(ageRequirement(await undress({ requires: undefined })), 18);
  assert.equal(ageRequirement({ requires: { tier: "intimate" } }), 18, "an intimate tier is adult-only without any undressing");
  assert.equal(ageRequirement({ requires: { tier: "affectionate" } }), 0);
  assert.equal(ageRequirement({ requires: { minAge: 21 } }), 21);
  assert.equal(ageRequirement({ requires: { minAge: 21 }, wardrobe: { remove: ["hips"] } }), 21, "an explicit age raises it");
  assert.equal(ageRequirement({ wardrobe: { remove: ["torso"] } }), 0, "a top alone is not adult-only");
  // An adult pair plays it, undressed.
  {
    const { world, me, partner } = household();
    const def = await undress(dressedFallback);
    assert.equal(interactionPolicyProblem(def, [me, partner]), null);
    assert.equal(world.startActivity(def, [me, partner]), true);
    advance(world, () => world.activity?.state === "playing");
    advance(world, () => world.activity?.wardrobeApplied);
    assert.ok(!outfitOf(me.look).some((w) => garment(w.garment).covers.includes("hips")));
    world.stopActivity();
  }
  // A child pair gets the same clip clothed (the mechanics don't change), or not at all when it hides.
  for (const [pair, who] of [["child + child", (me, p) => (child(me), child(p))], ["child + adult", (me, p) => child(p)]]) {
    const { world, me, partner } = household();
    who(me, partner);
    const dressed = await undress(dressedFallback);
    const before = [me.look, partner.look];
    assert.equal(interactionPolicyProblem(dressed, [me, partner]), null, pair);
    assert.equal(interactionGate(dressed, [me, partner]).dressed, true, `${pair} plays dressed`);
    assert.equal(world.startActivity(dressed, [me, partner]), true, pair);
    advance(world, () => world.activity?.state === "playing");
    for (let i = 0; i < 80; i++) world.update(0.05);
    assert.equal(world.activity.wardrobeApplied ?? false, false, `${pair}: nothing comes off`);
    assert.deepEqual([me.look, partner.look], before, `${pair}: still dressed`);
    world.stopActivity();
    const hidden = await undress({ requires: { tier: "casual", minAge: 10, wardrobe: ["hips", "thighs"] } }); // a declared age defaults the fallback to hide
    assert.match(interactionPolicyProblem(hidden, [me, partner]), /18\+/, `${pair} hidden by default`);
    assert.equal(world.startActivity(hidden, [me, partner]), false, pair);
    assert.equal(interactionHidden(hidden, [me, partner]), true);
  }
  // The youngest counts.
  {
    const { me, partner } = household();
    child(partner);
    assert.equal(interactionGate({ requires: { minAge: 18 } }, [me, partner]).age, interactionGate({}, [partner]).age, "the group is as old as its youngest");
    assert.equal(interactionGate({ requires: { minAge: 18 } }, [me, partner]).met, false);
  }
  // An action with its own minimum age, or a romantic one, can only be hidden, never played dressed.
  const woohoo = await action("woohoo");
  assert.notDeepEqual(interactionProblems({ ...woohoo, wardrobe: { ...woohoo.wardrobe, fallback: "dressed" } }), [], "intimate + dressed is an error");
  assert.notDeepEqual(interactionProblems({ ...(await undress(dressedFallback)), requires: { tier: "intimate", wardrobe: ["hips"] } }), []);
  assert.deepEqual(interactionProblems(await undress({ ...dressedFallback, requires: { tier: "affectionate", minAge: 13, wardrobe: ["hips"] } })), [], "an explicit age with an explicit dressed fallback is the author's call");
  { const { world, me, partner } = household(); child(partner); assert.equal(world.startActivity(woohoo, [me, partner]), false, "woohoo is hidden for a child"); }
  // A clothed intimate action passes the undressing check but not its tier.
  { const { world, me, partner } = household(); child(partner);
    const clothed = { ...structuredClone(await action("therapy-leg-massage")), id: "clothed-intimate", requires: { tier: "intimate" } };
    assert.equal(interactionGate(clothed, [me, partner]).hidden, true, "hidden for a child");
    assert.equal(interactionGate(clothed, [me, me]).hidden, false, "visible to adults");
    assert.equal(world.startActivity(clothed, [me, partner]), false);
    // The Settings override only shows the lock: it never lets a child play it.
    setShowLockedActions(true);
    assert.equal(interactionHidden(clothed, [me, partner]), false, "listed, with a lock");
    assert.match(interactionPolicyProblem(clothed, [me, partner]), /18\+/, "still blocked");
    assert.equal(world.startActivity(clothed, [me, partner]), false, "and still cannot play");
    setShowLockedActions(false);
    // The wheel's states: hidden by default, locked (listed, dimmed, still refused) with the switch on, ok for adults.
    assert.deepEqual([interactionAccess(clothed, [me, partner]).state, interactionAccess(clothed, [me, me]).state], ["hidden", "ok"]);
    setShowLockedActions(true);
    assert.equal(interactionAccess(clothed, [me, partner]).state, "locked");
    assert.match(interactionAccess(clothed, [me, partner]).reason, /18\+/);
    assert.equal(interactionPolicyProblem(clothed, [me, partner]) !== null, true, "locked means it still refuses");
    const bathe = await action("bathe");
    assert.equal(interactionAccess(bathe, [partner]).state, "ok", "a bath is not locked for a child: it plays dressed");
    setShowLockedActions(false); }
  // No declared tier: an undressing clip is hidden from children, never quietly played dressed.
  { const { me, partner } = household(); child(partner);
    const bare = { ...(await undress()), requires: undefined };
    assert.equal(interactionGate(bare, [me, partner]).hidden, true);
    assert.equal(interactionGate(bare, [me, me]).hidden, false); }
  // Lint: every clip states its tier or age; undressing needs a stated fallback.
  assert.equal(interactionWarnings({ ...(await undress()), requires: undefined }).some((w) => /declare requires\.tier/.test(w)), true);
  assert.equal(interactionWarnings(await undress()).some((w) => /wardrobe\.fallback/.test(w)), true, "undressing with no fallback and no age");
  assert.equal(interactionWarnings(await undress(dressedFallback)).some((w) => /wardrobe\.fallback/.test(w)), false);
  // Lint: undressing without declaring it is caught.
  assert.equal(interactionWarnings({ ...(await undress()), requires: { tier: "casual" } }).some((w) => /requires\.wardrobe/.test(w)), true);
  assert.equal(interactionWarnings(await undress()).some((w) => /requires\.wardrobe/.test(w)), false);
});

await test("a role anchored to another holds its distance through the clip, on a short body", async () => {
  const { world, me, partner } = household();
  partner.look = { ...partner.look, age: "child" }; // the short body
  const def = structuredClone(await action("therapy-session"));
  const [lead, other] = Object.keys(def.roles);
  def.anchors = { [other]: { role: lead, at: "front", distance: 0.35, lift: 0.1 } };
  def.oscillators = { [lead]: [{ channel: "move.1", amplitude: 0.05, period: 2 }, { channel: "move.0", amplitude: 0.05, period: 3 }] };
  assert.deepEqual(interactionProblems(def), []);
  assert.equal(world.startActivity(def, [me, partner]), true);
  advance(world, () => world.activity?.state === "playing");
  for (let i = 0; i < 20; i++) world.update(0.05); // past the settle
  let moved = 0, last = [me.x, me.y];
  for (let i = 0; i < 120; i++) {
    world.update(0.05);
    const gap = Math.hypot(me.x - partner.x, me.y - partner.y);
    assert.ok(Math.abs(gap - 0.35) < 0.02, `gap ${gap.toFixed(3)} at frame ${i}`);
    assert.equal(partner.lift, 0.1, "lifted off the floor");
    moved = Math.max(moved, Math.hypot(me.x - last[0], me.y - last[1]));
  }
  assert.ok(moved > 0.005, "the anchor role does move (the oscillator)");
  // Default distance comes from the two bodies' sizes: a child beside an adult stands closer than two adults.
  const near = (a, b) => { delete def.anchors[other].distance; const w = household(); w.me.look = { ...w.me.look, age: a }; w.partner.look = { ...w.partner.look, age: b }; w.world.startActivity(def, [w.me, w.partner]); advance(w.world, () => w.world.activity?.state === "playing"); for (let i = 0; i < 30; i++) w.world.update(0.05); return Math.hypot(w.me.x - w.partner.x, w.me.y - w.partner.y); };
  assert.ok(near("child", "child") < near("adult", "adult"));
  // Lint: self anchors, unknown roles and loops.
  const bad = (anchors) => interactionProblems({ ...def, anchors }).length > 0;
  assert.ok(bad({ [lead]: { role: lead, at: "front" } }), "self");
  assert.ok(bad({ [other]: { role: "ghost", at: "front" } }), "unknown role");
  assert.ok(bad({ [lead]: { role: other, at: "behind" }, [other]: { role: lead, at: "front" } }), "a loop");
  assert.ok(bad({ [other]: { role: lead, at: "sideways" } }), "unknown side");
});

await test("an action can frame the camera, and test_ files are ignored", async () => {
  const { world, me, partner } = household();
  const def = structuredClone(await action("therapy-leg-massage"));
  assert.equal(world.framing, null, "no framing by default");
  def.camera = { focus: "target", zoom: 1.4, height: 0.5, offset: [0.5, -0.25] };
  assert.deepEqual(interactionProblems(def), []);
  assert.equal(world.startActivity(def, [me, partner]), true);
  assert.equal(world.framing, null, "only while it plays");
  advance(world, () => world.activity?.state === "playing");
  const f = world.framing;
  assert.deepEqual([f.zoom, f.height, f.offset], [1.4, 0.5, [0.5, -0.25]]);
  const bed = world.place.items.find((i) => i.kind === "bed");
  assert.deepEqual(f.focus, [bed.x + bed.w / 2, bed.y + bed.h / 2], "centred on the bed");
  world.stopActivity();
  assert.equal(world.framing, null);
  assert.notDeepEqual(interactionProblems({ ...def, camera: { zoom: -1 } }), []);
  assert.notDeepEqual(interactionProblems({ ...def, camera: { focus: "sky" } }), []);
});

await test("per-role wardrobe changes one role, with a guard for lower-body clothes", async () => {
  const layered = OUTFITS.find((o) => o.id === "layered-masculine").wearing;
  const has = (actor, test) => outfitOf(actor.look).some((w) => test(garment(w.garment)));
  const outer = (g) => g.layer === "outer", lower = (g) => g.covers.some((r) => ["hips", "thighs", "calves"].includes(r));
  const fitting = await action("care-fitting");
  assert.deepEqual(interactionProblems(fitting), []);
  {
    const { world, me, partner } = household();
    me.look = { ...me.look, wearing: layered }; partner.look = { ...partner.look, wearing: layered };
    assert.ok(has(me, outer) && has(partner, outer), "both start in an outer layer");
    assert.equal(world.startActivity(fitting, [me, partner]), true);
    advance(world, () => world.activity?.state === "playing");
    const beat = () => (world.t - world.activity.since) / fitting.beat;
    advance(world, () => beat() > 8);
    assert.equal(has(partner, outer), false, "the partner's outer layer is off");
    assert.equal(has(me, outer), true, "the lead keeps theirs");
    assert.ok(has(partner, lower), "the rest of the partner's clothes stay");
    advance(world, () => beat() > 23);
    assert.equal(has(partner, outer), true, "restored at 22");
    world.stopActivity();
  }
  // Whatever a clip asks for, lower-body clothes come off only for a group of adults.
  const strip = { ...structuredClone(fitting), id: "strip-base", wardrobe: { at: 2, restoreAt: 20, roles: { partner: { remove: ["base"] } } } };
  for (const [label, kid, expectLower] of [["adults", false, false], ["a child among them", true, true]]) {
    const { world, me, partner } = household();
    me.look = { ...me.look, wearing: layered }; partner.look = { ...partner.look, wearing: layered };
    if (kid) { partner.profile.birthday = "2018-06-01"; partner.look = { ...partner.look, age: "child" }; }
    assert.equal(world.startActivity(strip, [me, partner]), true, label);
    advance(world, () => world.activity?.state === "playing");
    for (let i = 0; i < 80; i++) world.update(0.05);
    assert.equal(has(partner, (g) => g.layer === "base" && lower(g)), expectLower, `${label}: trousers ${expectLower ? "stay on" : "come off"}`);
    world.stopActivity();
  }
  // Lint: bad steps are load errors.
  assert.notDeepEqual(interactionProblems({ ...fitting, wardrobe: { ...fitting.wardrobe, roles: { partner: { at: 10, restoreAt: 5, remove: ["outer"] } } } }), []);
  assert.notDeepEqual(interactionProblems({ ...fitting, wardrobe: { ...fitting.wardrobe, roles: { partner: { remove: ["sleeves"] } } } }), []);
});

await test("removing a layer is not 'needs an adult': the age rule follows what actually comes off", async () => {
  const fitting = await action("care-fitting");
  assert.equal(ageRequirement(fitting), 0, "a jacket off is open to every age");
  const { me, partner } = household();
  const kid = { ...partner, profile: { ...partner.profile, birthday: "2018-06-01" }, look: { ...partner.look, age: "child" } };
  assert.equal(interactionGate(fitting, [me, kid]).hidden, false);
  assert.equal(interactionGate(fitting, [me, kid]).dressed, false, "not even played dressed: nothing is gated");
  assert.equal(ageRequirement({ wardrobe: { at: 0, restoreAt: 1, remove: ["outer", "accessories", "footwear"] } }), 0);
  assert.equal(ageRequirement({ wardrobe: { at: 0, restoreAt: 1, roles: { a: { remove: ["hips"] } } } }), 18, "a region of the lower body in any role's step still counts");
  // A child pair keeps the jacket-off behaviour; only lower-body garments are protected.
  const layered = OUTFITS.find((o) => o.id === "layered-masculine").wearing;
  const w = household();
  w.me.profile.birthday = "2018-01-01"; w.me.look = { ...w.me.look, age: "child", wearing: layered };
  w.partner.profile.birthday = "2018-02-01"; w.partner.look = { ...w.partner.look, age: "child", wearing: layered };
  const outerOff = (a) => !outfitOf(a.look).some((g) => garment(g.garment).layer === "outer" && !garment(g.garment).covers.some((r) => ["hips", "thighs", "calves"].includes(r)));
  assert.equal(w.world.startActivity(fitting, [w.me, w.partner]), true);
  advance(w.world, () => w.world.activity?.state === "playing");
  for (let i = 0; i < 100; i++) w.world.update(0.05);
  assert.equal(outerOff(w.partner), true, "a child's jacket comes off in a fitting");
  assert.ok(outfitOf(w.partner.look).some((g) => garment(g.garment).covers.includes("hips")), "but their trousers stay");
  w.world.stopActivity();
});

await test("every shipped action is reachable in the wheel, in rings short enough not to page", async () => {
  const folder = "src/lib/places/interactions";
  const defs = [];
  for (const file of await readdir(join(root, folder))) if (file.endsWith(".json") && file !== "categories.json" && !/^test[_-]/.test(file)) defs.push(await json(`${folder}/${file}`));
  // A clip with mirror: true also appears mirrored.
  for (const d of [...defs]) if (d.mirror) defs.push(mirrorInteraction(d));
  const two = defs.filter((d) => d.people.min <= 2 && d.people.max >= 2);
  // Every action, solo or together, is in the tree the wheel is built from (your own wheel lists them all).
  const everything = categoryTree(defs);
  const listed = new Set();
  const collect = (n) => { n.defs.forEach((d) => listed.add(d.id)); n.children.forEach(collect); };
  everything.forEach(collect);
  for (const d of defs) assert.ok(listed.has(d.id), `${d.id} is listed in the wheel`);
  assert.ok(everything.length + 2 <= 10, "your wheel: the groups plus clothes and settings fit one ring");
  const tree = categoryTree(two);
  const seen = new Set();
  const walk = (node, depth) => {
    assert.ok(node.children.length + node.defs.length <= 8, `${node.id}: ${node.children.length + node.defs.length} choices in one ring`);
    for (const d of node.defs) seen.add(d.id);
    node.children.forEach((c) => walk(c, depth + 1));
  };
  tree.forEach((n) => walk(n, 0));
  for (const d of two) assert.ok(seen.has(d.id), `${d.id} is in the wheel`);
  // A person's ring: the groups plus one group for clothes, follow, wait, profile and send home.
  assert.ok(tree.length + 1 <= 10, `${tree.length} top-level groups plus the person group`);
  const care = tree.find((n) => n.id === "care");
  assert.deepEqual(care.children.map((c) => c.id).sort(), ["doctor", "nurse", "therapy"]);
  assert.ok(care.defs.some((d) => d.id === "care-haircut"), "the haircut is in Care");
  // A category nobody listed still appears, labelled from its word.
  const novel = categoryTree([{ ...defs[0], id: "x", category: "sports" }]);
  assert.deepEqual([novel[0].id, novel[0].label], ["sports", "Sports"]);
  assert.ok(categoriesOf(defs).length >= tree.length);
});

await test("the chair and bench clips start at their furniture and play", async () => {
  for (const [id, item] of [["care-haircut", { kind: "chair", x: 4, y: 3, facing: "S" }], ["care-bench", { kind: "bench", x: 4, y: 3, w: 2, facing: "S" }]]) {
    const floor = { name: "seat", width: 10, depth: 8, entrance: [0, 0], rooms: [{ name: "R", rect: [0, 0, 10, 8] }], doors: [], items: [item] };
    const world = new World(floor);
    const me = world.addAuthor({ id: "me", name: "Me", birthday: "1985-01-01", terms: "neutral" });
    const other = world.add({ id: "p", name: "P", birthday: "1986-01-01", terms: "neutral" }, "guest", { cell: [1, 0] });
    const toasts = [];
    world.onToast = (m) => toasts.push(m);
    const def = await action(id);
    assert.equal(world.startActivity(def, [me, other]), true, `${id} starts: ${toasts.join(" / ")}`);
    advance(world, () => world.activity?.state === "playing");
    for (let i = 0; i < 80; i++) world.update(0.05);
    assert.ok(Number.isFinite(me.x) && Number.isFinite(other.x));
    world.stopActivity();
  }
});

await test("Home lists the furniture in the place that can be used, nearest of each kind first", async () => {
  const { world, me } = household();
  const folder = "src/lib/places/interactions";
  const defs = [];
  for (const file of await readdir(join(root, folder))) if (file.endsWith(".json") && file !== "categories.json" && !/^test[_-]/.test(file)) defs.push(await json(`${folder}/${file}`));
  const list = furnitureToUse(world.place.items, defs, [me.x, me.y]);
  const kinds = list.map((i) => i.kind);
  for (const kind of ["bed", "toilet", "shower", "bath", "sink", "wardrobe", "sofa"]) assert.ok(kinds.includes(kind), `${kind} can be used from Home`);
  assert.equal(new Set(kinds).size, kinds.length, "one of each kind");
  // With two of a kind, the nearer one is offered.
  const floor = structuredClone(world.floor);
  floor.items.push({ kind: "bed", x: 9, y: 8, w: 2, h: 3 });
  const two = new World(floor);
  const near = furnitureToUse(two.place.items, defs, [2.5, 2.5]).find((i) => i.kind === "bed");
  assert.equal(near.x, 2, "the bed beside you, not the one across the room");
  assert.deepEqual(furnitureToUse([], defs, [0, 0]), [], "no furniture, nothing listed");
});

await test("a mirrored clip is exactly a hand-mirrored one", () => {
  const clip = {
    id: "c", label: "C", people: { min: 2, max: 2 }, beat: 1, length: 4, loop: false, mirror: true,
    formation: { type: "spots", spots: [{ role: "a", at: [0.2, 0], facing: 30 }, { role: "b", at: [-0.2, 0.5], facing: 150 }] },
    target: { kinds: ["bed"], posture: "lie", roles: { a: { posture: "stand", side: "left", across: 0.3, anchor: { role: "b", at: "left", distance: 0.4, angle: 20 } }, b: { posture: "lie", side: "right" } } },
    roles: {
      a: [{ beat: 0, armL: [10, 20], armR: [30, 40], elbowL: 5, elbowR: 6, legL: 1, legR: 2, kneeL: 3, kneeR: 4, wristL: [1, 2, 3], wristR: [4, 5, 6], head: [7, 8, 9], neck: [1, 2, 3], tilt: 5, twist: -6, turn: 30, move: [0.1, 0.2], plant: { armL: { on: "role:b", point: "handR", weight: 1 }, armR: { on: "role:b", point: "head" } } }, { beat: 4 }],
      b: [{ beat: 0 }, { beat: 4 }],
    },
    oscillators: { a: [{ channel: "armL.0", amplitude: 3, period: 2 }, { channel: "tilt", amplitude: 4, period: 2 }, { channel: "move.0", amplitude: 0.05, period: 2 }] },
    camera: { offset: [0.5, 0.2] },
  };
  const control = {
    id: "c-mirrored", label: "C (mirrored)", people: { min: 2, max: 2 }, beat: 1, length: 4, loop: false,
    formation: { type: "spots", spots: [{ role: "a", at: [-0.2, 0], facing: -30 }, { role: "b", at: [0.2, 0.5], facing: -150 }] },
    target: { kinds: ["bed"], posture: "lie", roles: { a: { posture: "stand", side: "right", across: 0.3, anchor: { role: "b", at: "right", distance: 0.4, angle: -20 } }, b: { posture: "lie", side: "left" } } },
    roles: {
      a: [{ beat: 0, armR: [10, 20], armL: [30, 40], elbowR: 5, elbowL: 6, legR: 1, legL: 2, kneeR: 3, kneeL: 4, wristR: [1, 2, 3], wristL: [4, 5, 6], head: [7, -8, -9], neck: [1, -2, -3], tilt: -5, twist: 6, turn: -30, move: [-0.1, 0.2], plant: { armR: { on: "role:b", point: "handL", weight: 1 }, armL: { on: "role:b", point: "head" } } }, { beat: 4 }],
      b: [{ beat: 0 }, { beat: 4 }],
    },
    oscillators: { a: [{ channel: "armR.0", amplitude: 3, period: 2 }, { channel: "tilt", amplitude: -4, period: 2 }, { channel: "move.0", amplitude: -0.05, period: 2 }] },
    camera: { offset: [-0.5, 0.2] },
  };
  const mirrored = mirrorInteraction(clip);
  assert.equal(JSON.stringify(mirrored), JSON.stringify(control), "byte-identical to the hand-mirrored control");
  assert.equal(clip.mirror, true, "the original is untouched");
  assert.equal(mirrored.mirror, undefined, "a mirrored copy does not mirror again");
  assert.deepEqual(interactionProblems(mirrored).filter((p) => !/keyframes|requires/.test(p)), [], "and it is still a valid action");
  // Mirroring twice gives the original back (apart from the id and label).
  const twice = mirrorInteraction({ ...mirrored, id: "c", mirror: true });
  assert.equal(JSON.stringify(twice.roles), JSON.stringify(clip.roles));
  assert.equal(JSON.stringify(twice.formation), JSON.stringify(clip.formation));
  assert.equal(JSON.stringify(twice.target), JSON.stringify(clip.target));
  assert.equal(interactionProblems({ ...clip, mirror: "yes" }).some((p) => /mirror must be/.test(p)), true);
});

await test("care-bench: clearance, not the anchor, sets the gap", async () => {
  const floor = { name: "seat", width: 10, depth: 8, entrance: [0, 0], rooms: [{ name: "R", rect: [0, 0, 10, 8] }], doors: [], items: [{ kind: "bench", x: 4, y: 3, w: 2, facing: "S" }] };
  const world = new World(floor);
  const me = world.addAuthor({ id: "me", name: "Me", birthday: "1985-01-01", terms: "neutral" });
  const other = world.add({ id: "p", name: "P", birthday: "1986-01-01", terms: "neutral" }, "guest", { cell: [1, 0] });
  const def = await action("care-bench");
  assert.ok(def.target.roles.partner.anchor.distance < def.clearance.min, "the anchor is tighter than the clearance, so clearance must act");
  assert.equal(world.startActivity(def, [me, other]), true);
  advance(world, () => world.activity?.state === "playing");
  for (let i = 0; i < 20; i++) world.update(0.05);
  for (let beat = 0; beat < 22; beat += 2) {
    while ((world.t - world.activity.since) / def.beat < beat + 3) world.update(0.05);
    const gap = Math.hypot(me.x - other.x, me.y - other.y);
    assert.ok(Math.abs(gap - 0.55) < 0.005, `beat ${beat + 3}: gap ${gap.toFixed(3)} (0.30 would mean the clearance is inert)`);
  }
});

await test("another person can be sent to use furniture on their own", async () => {
  const { world, me, partner } = household();
  const toilet = await action("use-toilet");
  assert.equal(interactionPolicyProblem(toilet, [partner]), null);
  assert.equal(world.activityProblem(toilet, [partner]), null, "nothing stops it for them");
  assert.equal(world.startActivity(toilet, [partner]), true, "the other person is sent, not the author");
  advance(world, () => world.activity?.state === "playing");
  assert.deepEqual(world.activity.members.map((m) => m.actor), [partner], "only they are in it");
  assert.ok(partner.seat, "they sit on the toilet");
  assert.equal(me.pose ?? null, null, "the author carries on as they were");
  world.stopActivity();
});

await test("clearance holds two roles apart: it lengthens an anchor, and eases free roles apart without jitter", async () => {
  const fitting = structuredClone(await action("care-fitting"));
  fitting.wardrobe = undefined;
  // An anchor tighter than the clearance is lengthened to it, exactly.
  {
    const { world, me, partner } = household();
    partner.look = { ...partner.look, age: "child" };
    const def = { ...structuredClone(fitting), anchors: { lead: { role: "partner", at: "front", distance: 0.1 } }, clearance: { min: 0.2 } };
    def.target.roles.lead = { posture: "stand" };
    assert.equal(world.startActivity(def, [me, partner]), true);
    advance(world, () => world.activity?.state === "playing");
    for (let i = 0; i < 20; i++) world.update(0.05);
    for (let i = 0; i < 60; i++) { world.update(0.05); assert.ok(Math.abs(Math.hypot(me.x - partner.x, me.y - partner.y) - 0.2) < 0.005, "held at the clearance"); }
  }
  // Two free roles placed too close are eased out to the clearance, smoothly.
  {
    const { world, me, partner } = household();
    const def = { ...structuredClone(fitting), clearance: { min: 0.2 }, anchors: undefined };
    def.target = { kinds: ["floor"], posture: "stand" };
    def.formation.spots[1].at = [0, 0.1];
    assert.equal(world.startActivity(def, [me, partner]), true);
    advance(world, () => world.activity?.state === "playing");
    for (let i = 0; i < 12; i++) world.update(0.05); // past the walk-in
    const gaps = [];
    for (let i = 0; i < 60; i++) { world.update(0.05); gaps.push(Math.hypot(me.x - partner.x, me.y - partner.y)); }
    assert.ok(Math.abs(gaps.at(-1) - 0.2) < 0.01, `settles at the clearance (${gaps.at(-1).toFixed(3)})`);
    for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 0.002, `no jitter at frame ${i}`);
  }
  // Lint
  assert.ok(interactionWarnings({ ...fitting, clearance: { min: 0.02 } }).some((w) => /5 cm/.test(w)));
});

await test("plants ramp in, hold, and release without a pop; bad plants are load errors", async () => {
  const haircut = await action("care-haircut");
  assert.deepEqual(interactionProblems(haircut), []);
  const w = (beat, limb = "armL") => poseAt(haircut, "lead", beat).plant[limb]?.weight ?? 0;
  assert.equal(w(0), 0, "nothing before its key");
  assert.ok(w(3.5) > 0 && w(3.5) < 0.4, "ramping in toward 0.4");
  for (let b = 6.1; b < 25.9; b += 0.37) { assert.equal(w(b), 1, `held at beat ${b.toFixed(1)}`); assert.equal(w(b, "armR"), 1); }
  assert.equal(poseAt(haircut, "lead", 10).plant.armL.on, "role:partner");
  assert.equal(poseAt(haircut, "lead", 10).plant.armL.point, "head");
  // A release (weight 0) ramps down smoothly instead of popping.
  const clip = { ...structuredClone(haircut), length: 12, wardrobe: undefined, roles: { lead: [{ beat: 0, plant: { armL: { on: "role:partner", point: "head", weight: 1, blend: 0 } } }, { beat: 6, plant: { armL: { on: "role:partner", point: "head", weight: 0, blend: 2 } } }, { beat: 12 }], partner: [{ beat: 0 }] }, formation: haircut.formation, target: undefined, camera: undefined };
  let last = 1;
  for (let b = 0; b <= 9; b += 0.05) {
    const v = poseAt(clip, "lead", b).plant.armL?.weight ?? 0;
    assert.ok(v <= last + 1e-9 && last - v < 0.12, `smooth at beat ${b.toFixed(2)}: ${last.toFixed(3)} -> ${v.toFixed(3)}`);
    last = v;
  }
  assert.equal(last, 0, "fully released");
  const bad = (plant) => interactionProblems({ ...haircut, roles: { ...haircut.roles, lead: [{ beat: 0, plant }] } }).length > 0;
  assert.ok(bad({ legQ: { on: "bed" } }), "unknown limb");
  assert.ok(bad({ armL: { on: "role:ghost", point: "head" } }), "unknown role");
  assert.ok(bad({ armL: { on: "role:lead", point: "head" } }), "a role can't plant on itself");
  assert.ok(bad({ armL: { on: "wall", point: "surface" } }), "walls aren't supported yet");
  assert.ok(bad({ armL: { on: "role:partner", point: "elbowpit" } }), "unknown point");
  assert.ok(bad({ armL: { on: "role:partner", weight: 2 } }), "weight out of range");
  // handL / handR name a specific hand; plain "hand" (the nearest) on another body is linted.
  assert.ok(!bad({ armL: { on: "role:partner", point: "handR" } }) && !bad({ armR: { on: "role:partner", point: "handL" } }), "handL and handR are valid points");
  const warns = (plant) => interactionWarnings({ ...haircut, roles: { ...haircut.roles, lead: [{ beat: 0, plant }] } }).filter((w) => /never plants a hand back/.test(w)).length;
  assert.equal(warns({ armL: { on: "role:partner", point: "hand" } }), 1, "a one-sided hand plant is flagged");
  assert.equal(warns({ armL: { on: "role:partner" } }), 1, "and so is leaving the point out (it means hand)");
  assert.equal(warns({ armL: { on: "role:partner", point: "handR" } }), 0);
  assert.equal(warns({ armL: { on: "floor" } }), 0, "a surface needs no hand to name");
  // care-steady clasps: both roles plant "hand" on each other, so it is the mutual midpoint and lint is quiet about it.
  const steady = await action("care-steady");
  const plants = Object.values(steady.roles).flat().flatMap((k) => Object.entries(k.plant ?? {}));
  assert.ok(plants.length > 0 && plants.every(([, p]) => p.point === "hand"), "mutual hand plants");
  assert.equal(interactionWarnings(steady).filter((w) => /never plants a hand back/.test(w)).length, 0, "reciprocal, so no asymmetry");
  assert.equal(steady.target.roles.lead.anchor.distance, 0.62, "a kneeling pair stands apart a little over a forearm");
});

await test("kneel, floor targets and the content lint", async () => {
  const steady = await action("care-steady");
  assert.deepEqual(interactionProblems(steady), []);
  const { world, me, partner } = household();
  assert.equal(world.startActivity(steady, [me, partner]), true, "a floor target needs no furniture");
  advance(world, () => world.activity?.state === "playing");
  for (let i = 0; i < 80; i++) world.update(0.05);
  assert.equal(me.kneel && partner.kneel, true, "both kneel");
  assert.ok(me.plants?.armL || partner.plants?.armL, "plants reach the renderer");
  world.stopActivity();
  assert.equal(me.kneel, false);
  // Content lint: where the gate can't see motion, the declaration can.
  const base = { ...steady, requires: { tier: "casual" }, content: undefined };
  assert.ok(interactionWarnings({ ...base, content: { motion: "repetitive" } }).some((w) => /repetitive/.test(w)));
  assert.ok(interactionWarnings({ ...base, content: { contact: "sustained" } }).some((w) => /sustained/.test(w)));
  assert.equal(interactionWarnings({ ...base, requires: { tier: "affectionate" }, content: { motion: "cyclic", contact: "sustained", witness: "fine" } }).length, 0);
  assert.equal(interactionWarnings({ ...base, requires: { tier: "intimate" }, content: { motion: "repetitive", contact: "sustained" } }).some((w) => /casual/.test(w)), false, "fine under a higher tier");
  assert.notDeepEqual(interactionProblems({ ...base, content: { motion: "frantic" } }), []);
  // Sustained contact is read from the keyframes too: a casual clip that holds a hand on another body for a long stretch is flagged.
  const haircut = await action("care-haircut");
  assert.ok(longestPlantHold(haircut) >= 20, "the haircut holds its hands on the head for about twenty beats");
  const casualHaircut = { ...haircut, requires: { tier: "casual" }, content: undefined };
  assert.ok(interactionWarnings(casualHaircut).some((w) => /sustained contact/.test(w)), "casual + a long plant is flagged");
  assert.ok(interactionWarnings({ ...casualHaircut, content: { contact: "incidental" } }).some((w) => /says incidental/.test(w)), "a declaration that disagrees is flagged");
  assert.ok(interactionWarnings({ ...casualHaircut, content: { contact: "sustained" } }).some((w) => /doesn't read as casual/.test(w)));
  assert.deepEqual(interactionWarnings(haircut), [], "declared sustained under an affectionate tier is fine");
});

await test("woohoo eligibility is centralized and applies to direct playback", async () => {
  const { world, me, partner } = household();
  const def = await action("woohoo");
  partner.profile.birthday = "2015-01-01";
  partner.look.age = "adult"; // A visual age override cannot override a known birthday.
  assert.match(interactionPolicyProblem(def, [me, partner]), /18/);
  assert.equal(world.startActivity(def, [me, partner]), false);
  partner.profile.birthday = "1986-01-01";
  assert.equal(world.startActivity(def, [me, partner]), true);
  advance(world, () => world.activity?.state === "playing");
  const entries = world.activity.placements.map((placement) => placement.exit);
  setInteractionEnabled("woohoo", false);
  world.update(0.05);
  assert.equal(world.activity, null);
  assert.equal(me.hidden, false);
  assert.equal(partner.hidden, false);
  assert.deepEqual([me.x, me.y], entries[0]);
  assert.deepEqual([partner.x, partner.y], entries[1]);
  setInteractionEnabled("woohoo", true);
});

await test("woohoo restores temporary underwear on Stop and completion, with nobody hidden", async () => {
  const { world, me, partner } = household();
  const def = await action("woohoo");
  me.look = { ...me.look, wearing: [...outfitOf(me.look), { garment: "underwear_vest", color: "#12abcd" }, { garment: "boxer_briefs", color: "#567890" }] };
  const originals = [me.look, partner.look];
  let saves = 0;
  world.onOutfitChange = () => { saves++; };
  for (const completed of [false, true]) {
    assert.equal(world.startActivity(def, [me, partner]), true);
    advance(world, () => world.activity?.wardrobeApplied);
    for (const person of [me, partner]) {
      assert.equal(person.hidden, false);
      assert.equal(person.rest.pitch, -Math.PI / 2);
      assert.ok(!person.look.wearing.some((w) => w.garment === "shoes"));
      assert.deepEqual(person.look.wearing.map((w) => w.garment).sort(), ["boxer_briefs", "underwear_vest"]);
    }
    assert.notEqual(me.look, originals[0]);
    assert.notEqual(partner.look, originals[1]);
    assert.equal(me.look.wearing.find((w) => w.garment === "underwear_vest").color, "#12abcd");
    assert.equal(me.look.wearing.find((w) => w.garment === "boxer_briefs").color, "#567890");
    if (completed) {
      advance(world, () => !world.activity.wardrobeApplied);
      assert.equal(me.look, originals[0]);
      advance(world, () => !world.activity);
    } else world.stopActivity();
    for (const [index, person] of [me, partner].entries()) {
      assert.equal(person.look, originals[index]);
      assert.equal(person.rest, null);
      assert.equal(person.hidden, false);
    }
    assert.equal(saves, 0, "Scene-only outfit changes are never saved over profiles");
  }
});

await test("underwear outfits stay selected, support separate colours and layer beneath outer clothes", () => {
  const underwear = OUTFITS.find((outfit) => outfit.id === "underwear");
  assert.deepEqual(outfitProblems(underwear), []);
  const { me } = household();
  const look = { ...me.look, ...applyOutfit(underwear) };
  assert.deepEqual(outfitOf(look), underwear.wearing);
  const dressed = withSlot(look.wearing, "top", { garment: "tee", color: "#ffffff" });
  const changed = withSlot(dressed, "underwearBottom", { garment: "boxer_briefs", color: "#112233" });
  assert.ok(changed.some((w) => w.garment === "tee"));
  assert.ok(changed.some((w) => w.garment === "underwear_vest"));
  assert.equal(changed.find((w) => w.garment === "boxer_briefs").color, "#112233");
});

await test("age mappings are settings and can be changed without editing animations", async () => {
  const { world, me } = household();
  const def = await action("wash-hands");
  assert.equal(setInteractionMinimumAge(def.id, 65), true);
  assert.match(world.activityProblem(def, [me]), /65/);
  assert.equal(world.startActivity(def, [me]), false);
  assert.equal(setInteractionMinimumAge(def.id, 0), true);
  assert.equal(world.startActivity(def, [me]), true);
  assert.equal(setInteractionMinimumAge("woohoo", 0), false, "Use the age options declared in the central settings mapping");
  assert.equal(setInteractionMinimumAge("woohoo", 21), true);
  assert.equal(INTERACTION_POLICY.minimumAges.woohoo, 21);
  assert.equal(setInteractionMinimumAge("woohoo", 18), true);
});

await test("wardrobe changes apply during the cutaway, save on completion and roll back on Stop", async () => {
  const { world, me } = household();
  const def = await action("change-outfit");
  const original = me.look;
  let saves = 0;
  world.onOutfitChange = () => { saves++; };
  assert.equal(world.startActivity(def, [me]), false, "An outfit must be selected");
  assert.equal(world.startActivity(def, [me], { outfit: OUTFITS[0] }), true);
  advance(world, () => world.activity?.outfitApplied);
  assert.equal(me.hidden, true);
  assert.deepEqual(me.look.wearing, OUTFITS[0].wearing);
  world.stopActivity();
  assert.equal(me.look, original);
  assert.equal(saves, 0);
  assert.equal(world.startActivity(def, [me], { outfit: OUTFITS[1] }), true);
  advance(world, () => !world.activity);
  assert.deepEqual(me.look.wearing, OUTFITS[1].wearing);
  assert.equal(saves, 1);
});

await test("an unreachable fixture does not interrupt another action or teleport anyone", async () => {
  const { world, me } = household();
  const floor = structuredClone(world.floor);
  floor.partitions = ["h:7:4", "v:7:4", "h:7:5", "v:8:4"];
  const blocked = new World(floor);
  const actor = blocked.addAuthor(me.profile);
  const idle = interaction([{ beat: 0 }], true);
  assert.equal(blocked.startActivity(idle, [actor]), true);
  const current = blocked.activity;
  const position = [actor.x, actor.y];
  assert.equal(blocked.startActivity(await action("wash-hands"), [actor]), false);
  assert.equal(blocked.activity, current);
  assert.deepEqual([actor.x, actor.y], position);
});

await test("policy switches notify views and persist through the central API", () => {
  const previousStore = globalThis.localStorage;
  const saved = new Map();
  globalThis.localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  let notifications = 0;
  const unsubscribe = subscribeInteractionPolicy(() => { notifications++; });
  try {
    setInteractionEnabled("wash-hands", false);
    assert.equal(interactionEnabled({ id: "wash-hands" }), false);
    assert.equal([...saved.values()].map(JSON.parse)[0].actions["wash-hands"], false);
    setInteractionEnabled("wash-hands", true);
    assert.equal(notifications, 2);
  } finally {
    unsubscribe();
    globalThis.localStorage = previousStore;
  }
});

await test("validation checks numeric shape without imposing joint angle limits", () => {
  assert.deepEqual(interactionProblems(interaction([{ beat: 0, elbowL: -270, head: [360, -720, 1000] }])), []);
  for (const key of [{ wristL: [1, 2] }, { elbowL: NaN }, { head: [0, Infinity, 0] }]) {
    assert.ok(interactionProblems(interaction([{ beat: 0, ...key }])).length > 0);
  }
});

await test("central policy controls direct playback, including an activity already running", async () => {
  const def = interaction([{ beat: 0, elbowL: 90 }], true);
  const floor = (await json("src/lib/places/templates/home.json")).floors[0];
  const world = new World(floor);
  const actor = world.addAuthor({ id: "test", name: "Test", birthday: "", terms: "neutral" });
  try {
    assert.equal(interactionEnabled(def), true);
    assert.equal(world.startActivity(def, [actor]), true);
    world.update(0.1);
    assert.equal(actor.pose.elbowL, 90);
    INTERACTION_POLICY.actions[def.id] = false;
    world.update(0.1);
    assert.equal(world.activity, null);
    assert.equal(actor.pose, null);
    assert.equal(world.startActivity(def, [actor]), false);
    delete INTERACTION_POLICY.actions[def.id];
    INTERACTION_POLICY.enabled = false;
    assert.equal(world.startActivity(def, [actor]), false);
    INTERACTION_POLICY.enabled = true;
    assert.equal(world.startActivity(def, [actor]), true);
  } finally {
    delete INTERACTION_POLICY.actions[def.id];
    INTERACTION_POLICY.enabled = true;
  }
});

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
const body = new Body({ scene: gltf.scene, meta: await json("public/places/body.json") });
body.setShape({ shape: 0.5, years: 35, weight: 0, muscle: 0, height: 0, proportions: 0.3, bust: 0 });
const neutral = () => ({
  legs: [0, 0], knees: [0, 0], arms: [[0, 0], [0, 0]],
  elbows: [0, 0], forearms: [0, 0], wrists: [[0, 0, 0], [0, 0, 0]], ankles: [[0, 0], [0, 0]],
  lean: 0, tilt: 0, twist: 0, neck: [0, 0, 0], head: [0, 0, 0],
});
const at = (bone) => body.bone(bone).getWorldPosition(new THREE.Vector3());
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-5, `${a.toArray()} != ${b.toArray()}`);

await test("elbows lift each hand through a quarter turn, preserve segment lengths, and reset", () => {
  body.pose(neutral());
  body.root.updateMatrixWorld(true);
  const hands = [at("hand_r"), at("hand_l")];
  const elbows = [at("lowerarm_r"), at("lowerarm_l")];
  const p = neutral();
  p.elbows = [Math.PI / 2, Math.PI / 2];
  body.pose(p);
  body.root.updateMatrixWorld(true);
  for (const [i, side] of ["r", "l"].entries()) {
    close(at(`lowerarm_${side}`), elbows[i]);
    // The shipped rig has a slight elbow bend at rest, so check the rotation
    // from that rest direction rather than assuming a perfectly vertical arm.
    const before = hands[i].clone().sub(elbows[i]);
    const after = at(`hand_${side}`).sub(elbows[i]);
    assert.ok(Math.abs(before.clone().normalize().dot(after.clone().normalize())) < 1e-5, `${side} quarter turn`);
    assert.ok(after.y > before.y + before.length() * 0.5, `${side} bend direction`);
    assert.ok(Math.abs(at(`hand_${side}`).distanceTo(elbows[i]) - hands[i].distanceTo(elbows[i])) < 1e-5);
  }
  body.pose(neutral());
  body.root.updateMatrixWorld(true);
  close(at("hand_r"), hands[0]);
  close(at("hand_l"), hands[1]);
});

await test("neutral head orientation remains upright", () => {
  body.pose(neutral());
  body.root.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(body.bone("head").getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(up.y > 0.9, `head up: ${up.toArray()}`);
});

await test("elbows follow raised shoulders and forearm twist keeps the wrist on its axis", () => {
  for (const arm of [[Math.PI / 2, 0], [0.3, 0.8]]) {
    const p = { ...neutral(), arms: [arm, arm] };
    body.pose(p);
    body.root.updateMatrixWorld(true);
    const elbows = [at("lowerarm_r"), at("lowerarm_l")];
    const hands = [at("hand_r"), at("hand_l")];
    body.pose({ ...p, forearms: [0.7, 0.7] });
    body.root.updateMatrixWorld(true);
    close(at("hand_r"), hands[0]);
    close(at("hand_l"), hands[1]);
    body.pose({ ...p, elbows: [Math.PI / 2, Math.PI / 2] });
    body.root.updateMatrixWorld(true);
    for (const [i, side] of ["r", "l"].entries()) {
      close(at(`lowerarm_${side}`), elbows[i]);
      const before = hands[i].clone().sub(elbows[i]).normalize();
      const after = at(`hand_${side}`).sub(elbows[i]).normalize();
      assert.ok(Math.abs(before.dot(after)) < 1e-5, `${side} raised elbow`);
    }
  }
});

await test("wrists, forearms, ankles, neck/head and torso rotate their actual rig bones and reset", () => {
  const cases = [
    ["wrists", [[0.3, 0.2, 0.1], [0.3, 0.2, 0.1]], ["hand_r", "hand_l"]],
    ["forearms", [0.5, 0.5], ["lowerarm_r", "lowerarm_l"]],
    ["ankles", [[0.3, 0.2], [0.3, 0.2]], ["foot_r", "foot_l"]],
    ["neck", [0.2, 0.3, 0.1], ["neck_01"]],
    ["head", [0.2, 0.3, 0.1], ["head"]],
    ["twist", 0.5, ["spine_01", "spine_02", "spine_03"]],
  ];
  for (const [field, value, bones] of cases) {
    body.pose(neutral());
    const rest = bones.map((name) => body.bone(name).quaternion.clone());
    body.pose({ ...neutral(), [field]: value });
    bones.forEach((name, i) => assert.ok(body.bone(name).quaternion.angleTo(rest[i]) > 0.05, name));
    body.pose(neutral());
    bones.forEach((name, i) => assert.ok(body.bone(name).quaternion.clone().normalize().angleTo(rest[i].clone().normalize()) < 1e-6, `${name} reset`));
  }
});
await test("underwear meshes follow body morphs and the rig", () => {
  const underwear = OUTFITS.find((outfit) => outfit.id === "underwear");
  body.wear(underwear.wearing);
  for (const id of ["underwear_vest", "boxer_briefs"]) {
    const mesh = body.root.getObjectByName(id);
    assert.ok(mesh?.isSkinnedMesh && mesh.visible, id);
    assert.ok(mesh.geometry.index.count >= 60, `${id} has fitted triangles`);
    assert.equal(mesh.material.transparent, false, `${id} is opaque`);
    assert.ok(Object.keys(mesh.morphTargetDictionary).length > 0, `${id} follows shape sliders`);
    assert.equal(mesh.skeleton, body.root.getObjectByName("body").skeleton);
  }
  const top = body.root.getObjectByName("underwear_vest");
  assert.equal(top.material.clippingPlanes, null);
  body.wear([...underwear.wearing, { garment: "tee", color: "#ffffff" }, { garment: "jeans", color: "#334155" }]);
  assert.equal(top.visible, false, "Outer tops cover the underwear top");
  assert.equal(body.root.getObjectByName("boxer_briefs").visible, false, "Outer bottoms cover the underwear bottom");
});
await test("catalogue has ten distinct categories per layer and style, with stable unique ids", () => {
  assert.equal(CLOTHING_CATALOG.length, 180);
  assert.equal(new Set(GARMENTS.map((g) => g.id)).size, GARMENTS.length);
  for (const style of Object.keys(CLOTHING_STYLES)) for (const layer of Object.keys(CLOTHING_LAYERS)) {
    const choices = CLOTHING_CATALOG.filter((g) => g.layer === layer && g.styles.includes(style));
    assert.equal(choices.length, 10, `${style} / ${layer}`);
    assert.equal(new Set(choices.map((g) => g.category)).size, 10, `${style} / ${layer} categories`);
  }
});

await test("same-layer replacements preserve underwear, mid layers, outerwear, socks and accessories", () => {
  let worn = [
    { garment: "feminine_underwear_sports_bra", color: "#ffffff" },
    { garment: "feminine_underwear_vest", color: "#ffffff" },
    { garment: "feminine_underwear_briefs", color: "#ffffff" },
    { garment: "feminine_base_tee", color: "#2563eb" },
    { garment: "feminine_base_trousers", color: "#334155" },
    { garment: "feminine_mid_cardigan", color: "#64748b" },
    { garment: "feminine_outer_blazer", color: "#881337" },
    { garment: "feminine_footwear_crew_socks", color: "#ffffff" },
    { garment: "feminine_footwear_school_shoes", color: "#292524" },
    { garment: "feminine_accessories_school_tie", color: "#fbbf24" },
  ];
  assert.deepEqual(clothingProblems(worn), []);
  worn = withSlot(worn, "dress", { garment: "feminine_base_school_frock", color: "#ffffff" });
  assert.equal(worn.length, 9);
  assert.ok(!worn.some((w) => ["top", "bottom"].includes(garment(w.garment).slot)));
  assert.equal(worn.filter((w) => garment(w.garment).layer === "underwear").length, 3);
  assert.deepEqual(clothingProblems(worn), []);
  const withoutCoat = withSlot(worn, "outerTop", null);
  assert.equal(withoutCoat.length, worn.length - 1);
  assert.ok(withoutCoat.some((w) => w.garment === "feminine_mid_cardigan"));
  assert.ok(withoutCoat.some((w) => w.garment === "feminine_footwear_crew_socks"));
  assert.deepEqual(normalizeWorn(worn), normalizeWorn([...worn, worn[0]]));
});

await test("presets are compatible multi-piece outfits and Sri Lankan uniforms include independent socks and shoes", () => {
  for (const outfit of OUTFITS) assert.deepEqual(outfitProblems(outfit), [], outfit.id);
  for (const id of ["sl-school-frock", "sl-school-shorts", "sl-school-trousers", "sl-school-white-shorts"]) {
    const preset = OUTFITS.find((o) => o.id === id);
    assert.ok(preset, id);
    assert.ok(preset.wearing.some((w) => garment(w.garment).slot === "socks"), id);
    assert.ok(preset.wearing.some((w) => garment(w.garment).slot === "feet"), id);
    assert.ok(preset.wearing.some((w) => garment(w.garment).layer === "underwear"), id);
  }
  const frock = OUTFITS.find((o) => o.id === "sl-school-frock");
  assert.ok(frock.wearing.some((w) => garment(w.garment).recipe?.kind === "dress"));
  const retained = [{ garment: "neutral_underwear_vest", color: "#12abcd" }, { garment: "neutral_underwear_trunks", color: "#abcdef" }];
  const switched = applyOutfit(frock, retained);
  for (const item of retained) assert.ok(switched.wearing.some((w) => w.garment === item.garment && w.color === item.color));
});

await test("every catalogue garment produces nonempty rigged geometry with finite morphs", () => {
  for (const definition of CLOTHING_CATALOG) {
    body.wear([{ garment: definition.id, color: "#cbd5e1" }]);
    const pieces = [];
    body.root.traverse((object) => { if (object.userData.garmentId === definition.id) pieces.push(object); });
    assert.ok(pieces.length, `${definition.id}: generated pieces`);
    assert.ok(pieces.some((piece) => piece.geometry.index.count >= 3), `${definition.id}: nonempty mesh`);
    for (const piece of pieces) {
      assert.equal(piece.skeleton, body.root.getObjectByName("body").skeleton, definition.id);
      assert.ok(piece.geometry.getAttribute("skinIndex"), definition.id);
      for (const attribute of piece.geometry.morphAttributes.position ?? []) {
        assert.ok(attribute.count === piece.geometry.getAttribute("position").count, `${definition.id}: morph vertex count`);
        assert.ok(Number.isFinite(attribute.getX(0)) && Number.isFinite(attribute.getY(0)) && Number.isFinite(attribute.getZ(0)), `${definition.id}: finite morph`);
      }
    }
  }
});

await test("open jackets mask only part of a shirt and removing them restores all triangles", () => {
  const base = { garment: "neutral_base_tee", color: "#38bdf8" };
  body.wear([base]);
  const shirt = body.root.getObjectByName(base.garment);
  const complete = shirt.geometry.index.count;
  body.wear([base, { garment: "neutral_outer_blazer", color: "#881337" }]);
  const open = shirt.geometry.index.count;
  assert.ok(open > 0 && open < complete, `${open} / ${complete} shirt triangles under an open jacket`);
  body.wear([base]);
  assert.equal(shirt.geometry.index.count, complete);
});

await test("socks and shoes remain separate and clothing geometry survives body shaping", () => {
  const socks = { garment: "neutral_footwear_knee_socks", color: "#ffffff" };
  body.wear([socks]);
  const mesh = body.root.getObjectByName(socks.garment);
  const original = mesh.geometry.index.count;
  body.wear([socks, { garment: "neutral_footwear_ankle_boots", color: "#292524" }]);
  assert.ok(mesh.geometry.index.count > 0 && mesh.geometry.index.count < original);
  body.setShape({ shape: 1, years: 72, weight: 0.8, muscle: 0.4, height: 0.3, proportions: 0.3, bust: 0 });
  body.pose(neutral());
  body.root.updateMatrixWorld(true);
  assert.ok(Number.isFinite(body.top) && body.top > 0);
  body.wear([socks]);
  assert.equal(mesh.geometry.index.count, original);
});
await test("piece fit persists with saved layers and malformed fit data falls back safely", () => {
  const original = [{ garment: "underwear_vest", color: "#ffffff" }, { garment: "boxer_briefs", color: "#334155" }];
  const fitted = withClothingFit(original, "underwear_vest", { ease: 0.012, length: 0.9 });
  assert.equal(original[0].fit, undefined, "Trying a fit must not mutate the previous outfit");
  const saved = normalizeWorn(JSON.parse(JSON.stringify(fitted)));
  assert.deepEqual(saved.find((item) => item.garment === "underwear_vest").fit, { ease: 0.012, length: 0.9 });
  const preset = OUTFITS.find((item) => item.id === "sl-school-frock");
  assert.deepEqual(applyOutfit(preset, saved).wearing.find((item) => item.garment === "underwear_vest").fit, { ease: 0.012, length: 0.9 });
  assert.equal(normalizeClothingFit({ ease: NaN, length: Infinity }), undefined);
  assert.deepEqual(normalizeClothingFit({ ease: 1, length: 0 }), { ease: 0.04, length: 0.75 });
  assert.equal(withClothingFit(saved, "underwear_vest", null).find((item) => item.garment === "underwear_vest").fit, undefined);
});

await test("fitting rebuilds garment cuts and coverage, reuses unchanged fits and restores defaults", () => {
  const item = { garment: "neutral_base_tee", color: "#38bdf8" };
  body.wear([item]);
  const initial = body.root.getObjectByName(item.garment);
  const vertices = Array.from(initial.geometry.getAttribute("position").array);
  const originalCount = initial.geometry.index.count;
  const fitted = { ...item, fit: { ease: 0.02, length: 0.8 } };
  body.wear([fitted]);
  const changed = body.root.getObjectByName(item.garment);
  assert.notEqual(changed, initial);
  assert.ok(changed.geometry.index.count < originalCount, "Shorter cuts update their coverage");
  assert.notDeepEqual(Array.from(changed.geometry.getAttribute("position").array), vertices, "Clearance changes geometry");
  body.wear([{ ...fitted, color: "#112233" }]);
  assert.equal(body.root.getObjectByName(item.garment), changed, "A colour change reuses the fitted mesh");
  body.wear([item]);
  const restored = body.root.getObjectByName(item.garment);
  assert.equal(restored.geometry.index.count, originalCount);
  assert.deepEqual(Array.from(restored.geometry.getAttribute("position").array), vertices);
  body.wear([{ garment: "jeans", color: "#334155", fit: { ease: 0.01, length: 0.9 } }]);
  const legacy = body.root.getObjectByName("jeans");
  assert.ok(legacy.geometry.index.count > 0);
  assert.ok(Number.isFinite(legacy.geometry.morphAttributes.position[0].getY(0)));
});
await test("shortened garment hems preserve boundary skin and only mask actual garment faces", () => {
  body.showHead(true);
  body.wear([]);
  const skin = body.root.getObjectByName("body");
  const original = skin.geometry.index.clone();
  const facesOf = (mesh, index = mesh.geometry.index) => {
    const ids = mesh.geometry.getAttribute("_vid");
    const result = new Map();
    for (let i = 0; i < index.count; i += 3) {
      const face = [0, 1, 2].map((offset) => Math.round(ids.getX(index.getX(i + offset))));
      result.set([...face].sort((a, b) => a - b).join(":"), face);
    }
    return result;
  };
  const all = facesOf(skin, original);
  body.wear([{ garment: "neutral_base_tee", color: "#38bdf8", fit: { ease: 0.014, length: 0.9 } }]);
  const shirt = facesOf(body.root.getObjectByName("neutral_base_tee"));
  const remaining = facesOf(skin);
  const exposed = new Set([...all].filter(([key]) => !shirt.has(key)).flatMap(([, face]) => face));
  let boundary = 0, hidden = 0;
  for (const [key, face] of all) {
    if (!shirt.has(key)) assert.ok(remaining.has(key), "Skin beyond the cut must remain visible");
    else if (face.some((id) => exposed.has(id))) {
      assert.ok(remaining.has(key), "Skin under an open hem must remain beneath its offset rim");
      boundary++;
    } else if (!remaining.has(key)) hidden++;
  }
  assert.ok(boundary > 0 && hidden > 0, "The mask preserves hems while hiding interior skin");
});
body.dispose();

await test("a planted arm reaches its point at short and tall scales, clamps out of reach, and blends", () => {
  for (const scale of [0.7, 1, 1.3]) {
    const reset = () => { body.root.scale.setScalar(scale); body.pose(neutral()); body.root.updateMatrixWorld(true); };
    reset();
    const [u, l, e] = ["upperarm_l", "lowerarm_l", "hand_l"].map((n) => body.bone(n));
    const shoulder = at("upperarm_l");
    const target = shoulder.clone().add(new THREE.Vector3(0.25 * scale, 0.05 * scale, 0.3 * scale));
    const keyed = at("hand_l");
    const r = solveTwoBone(u, l, e, target, 1);
    body.root.updateMatrixWorld(true);
    assert.ok(at("hand_l").distanceTo(target) < 0.02, `scale ${scale}: hand within 2 cm (${at("hand_l").distanceTo(target).toFixed(4)})`);
    assert.equal(r.clamped, false);
    // Half weight lands between the keyed hand and the target.
    reset();
    solveTwoBone(u, l, e, target, 0.5); body.root.updateMatrixWorld(true);
    assert.ok(at("hand_l").distanceTo(keyed) > 0.01 && at("hand_l").distanceTo(target) > 0.02, "blended, not snapped");
    // Weight 0 leaves the keyed pose exactly.
    reset();
    solveTwoBone(u, l, e, target, 0); body.root.updateMatrixWorld(true);
    assert.ok(at("hand_l").distanceTo(keyed) < 1e-6, "weight 0 is the keyed pose");
    // At every weight the hand is within 2 / weight cm of the point (2 cm held, looser as it is released).
    for (const weight of [1, 0.8, 0.6, 0.3, 0.1]) {
      reset();
      const near = keyed.clone().add(new THREE.Vector3(0.06 * scale, 0.03 * scale, 0.05 * scale)); // a point the keyed pose is close to
      solveTwoBone(u, l, e, near, weight); body.root.updateMatrixWorld(true);
      const limit = 0.02 / weight * Math.max(1, scale);
      assert.ok(at("hand_l").distanceTo(near) <= limit, `scale ${scale}, weight ${weight}: ${(at("hand_l").distanceTo(near) * 100).toFixed(1)} cm <= ${(limit * 100).toFixed(1)} cm`);
    }
    // Out of reach: the arm straightens toward the point instead of snapping or bending backwards.
    reset();
    const far = shoulder.clone().add(new THREE.Vector3(0.1, 0.1, 3 * scale));
    const out = solveTwoBone(u, l, e, far, 1); body.root.updateMatrixWorld(true);
    assert.equal(out.clamped, true);
    const aim = far.clone().sub(shoulder).normalize(), got = at("hand_l").sub(shoulder).normalize();
    assert.ok(aim.dot(got) > 0.99, "pointing at it");
    const reach = at("upperarm_l").distanceTo(at("lowerarm_l")) + at("lowerarm_l").distanceTo(at("hand_l"));
    assert.ok(at("hand_l").distanceTo(shoulder) > reach - 0.01, "fully extended");
  }
  body.root.scale.setScalar(1); body.pose(neutral());
});

await test("kneeling puts the shins on the floor without penetrating it, at any scale", () => {
  for (const scale of [0.64, 0.7, 1, 1.3]) {
    body.root.scale.setScalar(scale);
    const leg = body.hipHeight * scale;
    body.root.position.y = -KNEEL_DROP * leg;
    const p = neutral(); p.knees = [Math.PI / 2, Math.PI / 2]; p.ankles = [[KNEEL_ANKLE, 0], [KNEEL_ANKLE, 0]];
    body.pose(p); body.root.updateMatrixWorld(true);
    const low = Math.min(...["calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"].map((n) => at(n).y));
    assert.ok(low >= -0.004 * scale, `scale ${scale}: lowest joint ${low.toFixed(4)} m is above the floor`);
    assert.ok(low < 0.08 * scale, `scale ${scale}: shins rest on the floor (${low.toFixed(3)})`);
    const hip = at("thigh_l").y;
    assert.ok(Math.abs(hip - (1 - KNEEL_DROP) * leg) < 0.01 * scale, "hips at a thigh's length above the floor");
    assert.ok(Math.abs(at("thigh_l").z - at("calf_l").z) < 0.05 * scale && at("thigh_l").y - at("calf_l").y > 0.4 * leg, "thighs upright (the rig rests slightly splayed)");
  }
  body.root.scale.setScalar(1); body.root.position.y = 0; body.pose(neutral());
});

await test("reciprocal hand plants converge on the midpoint of the keyed hands, and it holds across the clip", async () => {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Keyed hands of two bodies facing each other 0.62 m apart, read from care-steady's own arm angles (forward degrees).
  const steady = await action("care-steady");
  const hands = (role, beat, side) => {
    const pose = poseAt(steady, role, beat);
    const reach = (a) => 0.55 * Math.sin((a[0] * Math.PI) / 180), rise = (a) => 1.2 - 0.55 * Math.cos((a[0] * Math.PI) / 180);
    const x = side === "lead" ? 0 : 0.62, dir = side === "lead" ? 1 : -1;
    return { armL: V(x + dir * reach(pose.armL), rise(pose.armL), -0.2 * dir), armR: V(x + dir * reach(pose.armR), rise(pose.armR), 0.2 * dir) };
  };
  let previous = null;
  for (let beat = 6; beat <= 24; beat += 0.5) {
    const lead = hands("lead", beat, "lead"), partner = hands("partner", beat, "partner");
    for (const limb of ["armL", "armR"]) {
      const opposite = limb === "armL" ? "armR" : "armL";
      const mine = handPlantTarget("hand", limb, lead, partner, true, 0.035);
      const theirs = handPlantTarget("hand", opposite, partner, lead, true, 0.035);
      // Lead's left meets partner's right: the same point from both sides.
      const expected = lead[limb].clone().add(partner[opposite]).multiplyScalar(0.5);
      assert.ok(mine.distanceTo(expected) < 1e-9, "the midpoint of the two keyed hands");
      if (limb === "armL") assert.ok(mine.distanceTo(handPlantTarget("hand", "armR", partner, lead, true, 0.035)) < 1e-9, "both limbs of a pair aim at one point");
      void theirs;
    }
    const m = handPlantTarget("hand", "armL", lead, partner, true, 0.035);
    if (previous) assert.ok(m.distanceTo(previous) < 0.08, `the midpoint doesn't jump (${m.distanceTo(previous).toFixed(3)} m at beat ${beat})`);
    previous = m;
  }
  // Not reciprocated: falls back to their opposite hand's surface, not the midpoint.
  const a = { armL: V(0, 1, 0), armR: V(0.1, 1, 0) }, b = { armL: V(0.6, 1, 0), armR: V(0.5, 1, 0) };
  const alone = handPlantTarget("hand", "armL", a, b, false, 0.035);
  assert.ok(alone.distanceTo(b.armR) < 0.036 && alone.distanceTo(a.armL.clone().add(b.armR).multiplyScalar(0.5)) > 0.1, "one-sided falls back to handR");
  // Solved hand positions are never an input: the signature takes keyed hands only, so the target can't walk.
  assert.equal(handPlantTarget.length, 6);
});
