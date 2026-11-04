// A person's character on a small turntable: it turns slowly, so each of the
// four head images shows in turn.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Profile } from "../../lib/api";
import type { Character } from "../../lib/places/character";
import type { Facing } from "../../lib/places/layout";
import type { Actor } from "../../lib/places/world";
import { azimuthOf, Figure, material } from "./scene";

const TURN: Facing[] = ["SE", "E", "NE", "N", "NW", "W", "SW", "S"];

export function CharacterPreview({ profile, look, className = "" }: { profile: Profile; look: Character; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{ scene: THREE.Scene; figure: Figure | null } | null>(null);
  const key = JSON.stringify(look) + JSON.stringify(profile.faces ?? {});

  // The renderer lives as long as the preview; sliders only rebuild the figure (below).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      const half = 1.15;
      camera.left = (-half * w) / h;
      camera.right = (half * w) / h;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const t = (now - start) / 1000;
      const figure = stage.current?.figure;
      if (figure) {
        figure.actor.facing = TURN[Math.floor(t / 0.9) % TURN.length];
        figure.update(azimuth, t, { selected: false, tag: null });
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

  return <div ref={host} className={className} />;
}
