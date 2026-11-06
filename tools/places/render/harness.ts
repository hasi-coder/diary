// Render page for checking a clip by eye: tools/places/render/shoot.sh <clip id> <beats> <camera rotation 0-3>.
// It runs the real World and Figure code, applies plants, uses a fixed debug camera (the clip's own `camera`
// block is dropped, so a framing bug cannot look like a pose bug), and writes each frame into the page as a
// data URL for Chrome's --dump-dom: no network, no upload.
import * as THREE from "three";
import { World } from "../../../src/lib/places/world";
import { addLights, aimCamera, azimuthOf, buildPlace, Figure } from "../../../src/components/world/scene";
import { loadBody } from "../../../src/components/world/body";

const q = new URLSearchParams(location.search);
async function fail(e: unknown) {
  const el = document.createElement("pre"); el.id = "error"; el.textContent = String((e as Error)?.stack ?? e); document.body.appendChild(el);
  document.title = "FINISHED";
}
window.addEventListener("unhandledrejection", (ev) => void fail(ev.reason));
window.addEventListener("error", (ev) => void fail(ev.error ?? ev.message));

try {
  await loadBody("/places/");
  // The app's own list, so mirrored copies (`<id>-mirrored`) render too.
  const { INTERACTIONS } = await import("../../../src/lib/places/interactions");
  const def = (INTERACTIONS as any[]).find((f) => f.id === q.get("id"))!;
  delete (def as any).camera; // a fixed debug camera: the clip's own framing is not used to check the clip
  const floor = { name: "h", width: 10, depth: 8, entrance: [0, 0], rooms: [{ name: "R", rect: [0, 0, 10, 8] }], doors: [], items: [{ kind: "chair", x: 4, y: 3, facing: "S" }, { kind: "bench", x: 4, y: 3, w: 2, facing: "S" }, { kind: "bed", x: 4, y: 3, w: 2, h: 3, facing: "S" }].filter((i) => i.kind === (def.target?.kinds?.[0])) };
  const world = new World(floor as any);
  const me = world.addAuthor({ id: "me", name: "Me", birthday: "1985-01-01", terms: "feminine" } as any);
  const other = world.add({ id: "p", name: "P", birthday: q.get("kid") ? "2017-01-01" : "1986-01-01", terms: "masculine" } as any, "guest", { cell: [1, 0] } as any);
  if (q.get("kid")) other.look = { ...other.look, age: "child" };
  me.x = 3.5; me.y = 5.5; other.x = 4.5; other.y = 5.5; me.path = []; other.path = [];
  const kind = def.target?.kinds?.[0];
  const item = world.place.items.find((i) => i.kind === kind);
  if (!world.startActivity(def, def.people.max >= 2 ? [me, other] : [me], { target: item && kind !== "floor" ? item : undefined })) throw new Error("startActivity returned false");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(640, 480, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById("h")!.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#1d232b"); addLights(scene, 10, 8);
  const view = buildPlace(world.place); scene.add(view.group);
  const debug = q.get("debug") === "1";
  const overlay = new THREE.Group(); scene.add(overlay);
  const plantReport: string[] = [];
  const figures = new Map(world.actors.map((a) => { const f = new Figure(a); scene.add(f.group); return [a.id, f] as const; }));
  const camera = new THREE.OrthographicCamera();
  for (let i = 0; i < 4000 && world.activity?.state !== "playing"; i++) world.update(0.05);
  const beats = (q.get("beats") ?? "8").split(",").map(Number);
  const rot = Number(q.get("rot") ?? 1);
  const gaps: string[] = [];
  for (const b of beats) {
    for (let i = 0; i < 4000 && (world.t - world.activity!.since) / def.beat < b; i++) world.update(0.05);
    const az = azimuthOf(rot);
    for (let k = 0; k < 3; k++) {
      world.update(0.0001); view.update({ walls: "down", author: null, azimuth: az, dt: 0.05 });
      figures.forEach((f) => f.update(az, world.t, { selected: false, tag: null }));
      const act = world.activity!; const byRole = new Map(act.members.map((m) => [m.role, figures.get(m.actor.id)]));
      overlay.clear(); plantReport.length = 0;
      for (const m of act.members) figures.get(m.actor.id)?.snapshotHands();
      for (const m of act.members) {
        for (const r of figures.get(m.actor.id)?.applyPlants((role) => byRole.get(role)) ?? []) {
          plantReport.push(`${m.role}.${r.limb} -> ${r.on}/${r.point} weight ${r.weight.toFixed(2)}: ${Number.isNaN(r.miss) ? "no target" : (r.miss * 100).toFixed(1) + " cm from the point"}`);
          if (!r.target || !debug) continue;
          // A red cross at the target, a magenta line from the hand to it (drawn on top of everything).
          const mat = (c: number) => new THREE.LineBasicMaterial({ color: c, depthTest: false });
          const arm = 0.06;
          for (const axis of [[arm, 0, 0], [0, arm, 0], [0, 0, arm]]) {
            const g = new THREE.BufferGeometry().setFromPoints([r.target.clone().sub(new THREE.Vector3(...axis)), r.target.clone().add(new THREE.Vector3(...axis))]);
            const line = new THREE.Line(g, mat(0xff2222)); line.renderOrder = 9999; overlay.add(line);
          }
          const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([r.hand, r.target]), mat(0xff00ff)); link.renderOrder = 9999; overlay.add(link);
        }
      }
    }
    const solo = def.people.max < 2; const c = solo ? [me.x, me.y] : [(me.x + other.x) / 2, (me.y + other.y) / 2];
    const gap = Math.hypot(me.x - other.x, me.y - other.y);
    gaps.push(`beat ${b}: gap ${gap.toFixed(3)} m`, ...plantReport.map((p) => "   " + p));
    aimCamera(camera, new THREE.Vector3(c[0], 0.75, c[1]), az, false, Number(q.get("size") ?? 2.0), 640 / 480);
    renderer.render(scene, camera);
    const holder = document.createElement("pre"); holder.className = "shot"; holder.dataset.name = `${q.get("id")}_beat${b}`; holder.textContent = renderer.domElement.toDataURL("image/png"); document.body.appendChild(holder);
  }
  const gapsEl = document.createElement("pre"); gapsEl.id = "gaps"; gapsEl.textContent = gaps.join("\n"); document.body.appendChild(gapsEl);
  document.title = "FINISHED";
} catch (e) { await fail(e); }
