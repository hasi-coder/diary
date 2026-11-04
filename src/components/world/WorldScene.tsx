// The live Places world: renders a World, runs its clock, and turns clicks into
// picks (a person, a door, a piece of furniture, the floor). Drag to pan, wheel
// to zoom.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { World } from "../../lib/places/world";
import { addLights, aimCamera, azimuthOf, buildPlace, Figure, fitSize, type Pick, type WallMode } from "./scene";

export interface WorldSceneHandle {
  /** The current view as a PNG. */
  capture(): Promise<Blob | null>;
  zoom(factor: number): void;
  /** Screen position of someone's head, for popovers. */
  screenOf(id: string): { x: number; y: number } | null;
}

interface Props {
  world: World;
  top: boolean;
  walls: WallMode;
  rotation: number;
  labels: boolean;
  selectedId: string | null;
  /** Name tags: id → text and colour; people without one have no tag. */
  tags: Map<string, { text: string; color?: string }>;
  onPick: (pick: Pick, at: { x: number; y: number }) => void;
  className?: string;
}

export const WorldScene = forwardRef<WorldSceneHandle, Props>(function WorldScene(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const api = useRef<WorldSceneHandle | null>(null);
  useImperativeHandle(ref, () => ({
    capture: () => api.current?.capture() ?? Promise.resolve(null),
    zoom: (f) => api.current?.zoom(f),
    screenOf: (id) => api.current?.screenOf(id) ?? null,
  }));

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const world = props.world;
    const { width: W, depth: H } = world.place;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1d232b");
    addLights(scene, W, H);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#26303b", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.26;
    ground.receiveShadow = true;
    scene.add(ground);
    const view = buildPlace(world.place);
    scene.add(view.group);

    const figures = new Map<string, Figure>();
    const syncFigures = () => {
      for (const a of world.actors)
        if (!figures.has(a.id)) {
          const f = new Figure(a);
          figures.set(a.id, f);
          scene.add(f.group);
        }
      for (const [id, f] of figures)
        if (!world.actors.some((a) => a.id === id)) {
          scene.remove(f.group);
          f.dispose();
          figures.delete(id);
        }
    };

    const camera = new THREE.OrthographicCamera();
    const target = new THREE.Vector3(W / 2, 0, H / 2);
    let zoom = 1;
    let size = 10;
    let lastTop: boolean | null = null;
    let lastRotation = -1;
    const resize = () => {
      const w = Math.max(1, el.clientWidth);
      const h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    // Clicks pick; drags pan.
    const raycaster = new THREE.Raycaster();
    let drag: { x: number; y: number; moved: boolean; target: THREE.Vector3 } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, moved: false, target: target.clone() };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      // Move the target against the drag, in the camera's screen plane projected on the floor.
      const perPixel = (camera.top - camera.bottom) / camera.zoom / el.clientHeight;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).setY(0).normalize();
      const stretch = live.current.top ? 1 : 1.5;
      target.copy(drag.target).addScaledVector(right, -dx * perPixel).addScaledVector(up, dy * perPixel * stretch);
      target.x = Math.min(W, Math.max(0, target.x));
      target.z = Math.min(H, Math.max(0, target.z));
    };
    const onUp = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      if (!d || d.moved) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData.pick === undefined) o = o.parent;
        if (!o) continue;
        const pick = o.userData.pick;
        const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        if (typeof pick === "string" && pick !== "floor") return live.current.onPick({ kind: "actor", id: pick }, at);
        if (pick === "floor") return live.current.onPick({ kind: "floor", x: hit.point.x, y: hit.point.z }, at);
        if ("edge" in pick) return live.current.onPick({ kind: "door", door: pick }, at);
        if ("spec" in pick) return live.current.onPick({ kind: "item", item: pick, x: hit.point.x, y: hit.point.z }, at);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.min(4, Math.max(0.5, zoom * Math.exp(-e.deltaY * 0.0015)));
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const project = (id: string) => {
      const f = figures.get(id);
      if (!f) return null;
      const v = new THREE.Vector3(f.actor.x, 1.9, f.actor.y).project(camera);
      return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
    };
    api.current = {
      capture: () => {
        renderer.render(scene, camera);
        return new Promise((resolve) => renderer.domElement.toBlob(resolve, "image/png"));
      },
      zoom: (f) => (zoom = Math.min(4, Math.max(0.5, zoom * f))),
      screenOf: project,
    };

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = live.current;
      world.update(dt);
      syncFigures();
      const azimuth = azimuthOf(p.rotation);
      const aspect = el.clientWidth / Math.max(1, el.clientHeight);
      if (p.top !== lastTop || p.rotation !== lastRotation) {
        size = fitSize(W, H, aspect, p.top);
        lastTop = p.top;
        lastRotation = p.rotation;
      }
      camera.zoom = zoom;
      aimCamera(camera, target, azimuth, p.top, size, aspect);
      const me = world.author;
      view.update({ walls: p.top ? "down" : p.walls, author: me ? world.cellOf(me) : null, azimuth, dt });
      view.labels.visible = p.labels;
      for (const [id, f] of figures) {
        const tag = p.tags.get(id);
        f.update(azimuth, world.t, { selected: p.selectedId === id, tag: tag?.text ?? null, tagColor: tag?.color });
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      for (const f of figures.values()) f.dispose();
      view.dispose();
      ground.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [props.world]);

  return <div ref={host} className={props.className} />;
});
