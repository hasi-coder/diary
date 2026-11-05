// A person's character on a small turntable: it turns slowly, so each of the
// four head images shows in turn.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Profile } from "../../lib/api";
import type { Character } from "../../lib/places/character";
import { AGES } from "../../lib/places/character";
import { poseAt } from "../../lib/places/interaction";
import type { Facing } from "../../lib/places/layout";
import type { Actor } from "../../lib/places/world";
import { azimuthOf, Figure, material } from "./scene";

const TURN: Facing[] = ["SE", "E", "NE", "N", "NW", "W", "SW", "S"];
const FITTING_POSE = poseAt({ id: "fitting", label: "Fitting", people: { min: 1, max: 1 }, beat: 1, length: 1, formation: { type: "stay", role: "person" }, roles: { person: [{ beat: 0, armL: [0, 22], armR: [0, 22], elbowL: 4, elbowR: 4 }] } }, "person", 0);

export interface CharacterPreviewProps {
  profile: Profile;
  look: Character;
  className?: string;
  autoRotate?: boolean;
  view?: Facing;
  zoom?: number;
  framing?: "full" | "upper" | "lower";
  fitting?: boolean;
}

export function CharacterPreview(props: CharacterPreviewProps) {
  const { profile, look, className = "" } = props;
  const live = useRef(props);
  live.current = props;
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{ scene: THREE.Scene; figure: Figure | null } | null>(null);
  // Clothing changes update the existing figure, retaining its fitted garment
  // cache. Body/face changes still rebuild the figure and its skin binding.
  const key = JSON.stringify({ id: profile.id, age: look.age, figure: look.figure, build: look.build, skin: look.skin, hair: look.hair, glasses: look.glasses, beard: look.beard, body: look.body, faces: profile.faces });

  // The renderer lives as long as the preview; sliders only rebuild the figure (below).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 32), material("#e2e8f0"));
    disc.position.set(0.5, -0.03, 0.5);
    scene.add(disc);
    stage.current = { scene, figure: null };
    const camera = new THREE.OrthographicCamera(-0.8, 0.8, 1.1, -1.1, 0.1, 50);
    const azimuth = azimuthOf(0);
    camera.position.set(0.5 + Math.cos(azimuth) * 6, 2.6, 0.5 + Math.sin(azimuth) * 6);
    camera.lookAt(0.5, 0.85, 0.5);
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
    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const t = Math.max(0, (now - start) / 1000);
      const figure = stage.current?.figure;
      if (figure) {
        const { look: current, autoRotate = true, view = "SE", zoom = 1, framing = "full", fitting = false } = live.current;
        figure.actor.facing = autoRotate ? TURN[Math.floor(t / 0.9) % TURN.length] : view;
        figure.actor.pose = fitting ? FITTING_POSE : null;
        figure.update(azimuth, t, { selected: false, tag: null });
        const height = AGES[current.age].height * (1 + 0.1 * (current.body?.height ?? 0));
        const half = height * (framing === "full" ? 0.66 : 0.37);
        const targetY = height * (framing === "upper" ? 0.73 : framing === "lower" ? 0.25 : 0.49);
        camera.position.y = targetY + 1.75;
        camera.lookAt(0.5, targetY, 0.5);
        const aspect = Math.max(1, el.clientWidth) / Math.max(1, el.clientHeight);
        camera.left = -half * aspect; camera.right = half * aspect;
        camera.top = half; camera.bottom = -half;
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      disc.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const actor: Actor = { id: profile.id, profile, look, role: "guest", x: 0.5, y: 0.5, facing: "SE", path: [], seat: null, goalSeat: null, following: false };
    const figure = new Figure(actor);
    s.scene.add(figure.group);
    s.figure = figure;
    return () => {
      s.scene.remove(figure.group);
      if (s.figure === figure) s.figure = null;
      figure.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const figure = stage.current?.figure;
    if (figure) figure.actor.look = look;
  }, [look, key]);

  return <div ref={host} className={className} />;
}
