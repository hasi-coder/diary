// Pictures of places and characters, rendered once with a shared offscreen
// renderer and kept as data URLs.
import * as THREE from "three";
import type { Profile } from "../../lib/api";
import type { Floor, Spot } from "../../lib/places/layout";
import { World } from "../../lib/places/world";
import { addLights, aimCamera, azimuthOf, buildPlace, Figure, fitSize } from "./scene";

let shared: THREE.WebGLRenderer | null = null;
function renderer(): THREE.WebGLRenderer {
  if (!shared) {
    shared = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    shared.outputColorSpace = THREE.SRGBColorSpace;
    shared.shadowMap.enabled = true;
    shared.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return shared;
}

const cache = new Map<string, string>();

/** An isometric picture of a floor, walls down, with people at their spots. */
export function placePicture(floor: Floor, width: number, height: number, people: { profile: Profile; spot?: Spot }[] = [], background = "#1d232b"): string {
  const key = JSON.stringify([floor, width, height, people.map((p) => [p.profile.id, p.profile.updatedAt, p.spot]), background]);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = renderer();
  r.setPixelRatio(1);
  r.setSize(width, height, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  addLights(scene, floor.width, floor.depth);
  const world = new World(floor);
  const view = buildPlace(world.place);
  scene.add(view.group);
  view.labels.visible = false;
  const azimuth = azimuthOf(0);
  view.update({ walls: "down", author: null, azimuth, dt: 1 });
  const figures = people.map((p) => {
    const f = new Figure(world.add(p.profile, "guest", p.spot));
    f.update(azimuth, 0, { selected: false, tag: null });
    scene.add(f.group);
    return f;
  });
  const camera = new THREE.OrthographicCamera();
  aimCamera(camera, new THREE.Vector3(floor.width / 2, 0, floor.depth / 2), azimuth, false, fitSize(floor.width, floor.depth, width / height, false) * 0.92, width / height);
  r.render(scene, camera);
  const url = r.domElement.toDataURL("image/png");
  view.dispose();
  for (const f of figures) f.dispose();
  cache.set(key, url);
  return url;
}
