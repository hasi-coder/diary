// A flat plan of the place in a corner of the world: rooms, walls, doors,
// furniture and everyone as a dot. Click it to walk there.
import { useEffect, useRef } from "react";
import { parseEdge } from "../../lib/places/layout";
import type { World } from "../../lib/places/world";

export function Minimap({ world, onWalk, className = "" }: { world: World; onWalk: (x: number, y: number) => void; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const geometry = useRef({ S: 1, ox: 0, oy: 0 });

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const { place } = world;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const S = Math.min((w - 12) / place.width, (h - 12) / place.depth);
      const ox = (w - S * place.width) / 2;
      const oy = (h - S * place.depth) / 2;
      geometry.current = { S, ox, oy };
      for (let y = 0; y < place.depth; y++)
        for (let x = 0; x < place.width; x++) {
          const r = place.room[y][x];
          if (r < 0) continue;
          ctx.fillStyle = place.floor.rooms[r].floor ?? "#d6d3d1";
          ctx.fillRect(ox + x * S, oy + y * S, S + 0.5, S + 0.5);
        }
      for (const it of place.items) {
        if (it.spec.flat) continue;
        ctx.fillStyle = it.color;
        ctx.fillRect(ox + (it.x + 0.12) * S, oy + (it.y + 0.12) * S, (it.w - 0.24) * S, (it.h - 0.24) * S);
      }
      for (const [key, e] of place.edges) {
        const { horizontal, x, y } = parseEdge(key);
        ctx.strokeStyle = e.door ? (e.door.locked ? "#ef4444" : e.door.open ? "#fbbf24" : "#9a6b43") : e.partition ? "#9ca3af" : "#374151";
        ctx.lineWidth = e.partition ? 1.2 : 2;
        ctx.beginPath();
        ctx.moveTo(ox + x * S, oy + y * S);
        ctx.lineTo(ox + (horizontal ? x + 1 : x) * S, oy + (horizontal ? y : y + 1) * S);
        ctx.stroke();
      }
      for (const a of world.actors) {
        ctx.fillStyle = a.look.top;
        ctx.strokeStyle = a === world.author ? "#fbbf24" : "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox + a.x * S, oy + a.y * S, Math.max(3, S * 0.32), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };
    const timer = setInterval(draw, 100);
    draw();
    return () => clearInterval(timer);
  }, [world]);

  return (
    <canvas
      ref={canvas}
      className={className}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const { S, ox, oy } = geometry.current;
        onWalk((e.clientX - r.left - ox) / S, (e.clientY - r.top - oy) / S);
      }}
    />
  );
}
