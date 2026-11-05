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
        export { interactionGate, interactionHidden, interactionDressed } from './src/lib/places/interactionPolicy';
        export { lengthOf, interactionWarnings } from './src/lib/places/interaction';
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
const { poseAt, interactionProblems, INTERACTION_POLICY, interactionEnabled, interactionPolicyProblem, setInteractionEnabled, setInteractionMinimumAge, subscribeInteractionPolicy, OUTFITS, outfitProblems, applyOutfit, outfitOf, withSlot, GARMENTS, CLOTHING_LAYERS, CLOTHING_STYLES, clothingProblems, normalizeWorn, garment, CLOTHING_CATALOG, ageRequirement, interactionGate, interactionHidden, interactionDressed, lengthOf, interactionWarnings, FACE_DEFS, FACE_VIEWS, FALLBACK_VIEW, FACE_SLOTS, World, Body, THREE, GLTFLoader } = animation;
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
    if (!file.endsWith(".json") || file === "categories.json") continue;
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
  assert.equal(interactionWarnings({ ...base, speed: 2, roles: { person: [{ beat: 0, armLL: [0, 0], lean: 900 }] } }).length, 3);
  const folder = "src/lib/places/interactions";
  for (const file of await readdir(join(root, folder))) {
    if (!file.endsWith(".json") || file === "categories.json" || file === "text.json") continue;
    assert.deepEqual(interactionWarnings(await json(`${folder}/${file}`)), [], file);
  }
});

await test("the age gate follows what an action does, not its id", async () => {
  const child = (a) => { a.profile.birthday = "2018-06-01"; a.look = { ...a.look, age: "child" }; };
  const undress = async (extra = {}) => ({ ...structuredClone(await action("therapy-leg-massage")), id: "renamed", wardrobe: { at: 1, restoreAt: 10, remove: ["hips", "thighs"] }, requires: { wardrobe: ["hips", "thighs"] }, ...extra });
  // Undressing the hips needs an adult, whatever the clip is called or declares.
  assert.equal(ageRequirement(await undress({ requires: undefined })), 18);
  assert.equal(ageRequirement({ requires: { minAge: 21 } }), 21);
  assert.equal(ageRequirement({ requires: { minAge: 21 }, wardrobe: { remove: ["hips"] } }), 21, "an explicit age raises it");
  assert.equal(ageRequirement({ wardrobe: { remove: ["torso"] } }), 0, "a top alone is not adult-only");
  // An adult pair plays it, undressed.
  {
    const { world, me, partner } = household();
    const def = await undress({ gate: { onFail: "dressed" } });
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
    const dressed = await undress({ gate: { onFail: "dressed" } });
    const before = [me.look, partner.look];
    assert.equal(interactionPolicyProblem(dressed, [me, partner]), null, pair);
    assert.equal(interactionGate(dressed, [me, partner]).dressed, true, `${pair} plays dressed`);
    assert.equal(world.startActivity(dressed, [me, partner]), true, pair);
    advance(world, () => world.activity?.state === "playing");
    for (let i = 0; i < 80; i++) world.update(0.05);
    assert.equal(world.activity.wardrobeApplied ?? false, false, `${pair}: nothing comes off`);
    assert.deepEqual([me.look, partner.look], before, `${pair}: still dressed`);
    world.stopActivity();
    const hidden = await undress();
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
  assert.notDeepEqual(interactionProblems({ ...woohoo, gate: { onFail: "dressed" } }), []);
  assert.notDeepEqual(interactionProblems({ ...(await undress()), category: "romantic", gate: { onFail: "dressed" } }), []);
  { const { world, me, partner } = household(); child(partner); assert.equal(world.startActivity(woohoo, [me, partner]), false, "woohoo is hidden for a child"); }
  // Lint: undressing without declaring it is caught.
  assert.equal(interactionWarnings({ ...(await undress()), requires: undefined }).some((w) => /requires\.wardrobe/.test(w)), true);
  assert.equal(interactionWarnings(await undress()).some((w) => /requires\.wardrobe/.test(w)), false);
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
