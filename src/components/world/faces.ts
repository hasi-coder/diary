// Heads for the Places world: the person's four face images when they have them
// (Profile.faces), otherwise a drawn face from their character. Each view is a
// square canvas with a round head on a transparent background.
import { mediaUrl, type Profile } from "../../lib/api";
import { characterOf, type Character, type FaceView } from "../../lib/places/character";

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255];
  return `rgb(${ch.map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))).join(",")})`;
}

/** How a drawn face stands in for the views that are only drawn from a photo. */
const DRAWN_AS: Partial<Record<FaceView, { view: "front" | "left" | "right" | "back"; closed?: boolean }>> = {
  frontLeft: { view: "front" }, frontRight: { view: "front" },
  up: { view: "front" }, down: { view: "back" },
  sleeping: { view: "front", closed: true }, sleepingLeft: { view: "left", closed: true }, sleepingRight: { view: "right", closed: true },
};

/** Draws a head of radius r centred at (cx, cy). "left" is "right" mirrored. */
export function drawFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, view: FaceView, look: Character, closed = false) {
  // Drawn faces have no 45° views; the front stands in, as it does in the world.
  // Lying-down views are the same faces seen from above; sleeping ones have closed eyes.
  const base = DRAWN_AS[view];
  if (base) { view = base.view; closed = closed || !!base.closed; }
  if (view === "left") {
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
    drawFace(ctx, cx, cy, r, "right", look, closed);
    ctx.restore();
    return;
  }
  const { skin, hair: { style, color: hair } } = look;
  const ink = "#1f2937";
  const line = Math.max(0.6, r * 0.08);
  ctx.lineWidth = line;
  ctx.strokeStyle = "rgba(0,0,0,.28)";
  const circle = (x: number, y: number, rad: number) => {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
  };
  if (style === "long" && view !== "back") {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(view === "front" ? cx : cx - r * 0.25, cy + r * 0.35, r * 1.08, r * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (view === "back") {
    ctx.fillStyle = skin;
    circle(cx, cy, r);
    ctx.fill();
    ctx.fillStyle = style === "bald" ? shade(skin, -0.1) : hair;
    ctx.beginPath();
    if (style === "bald") ctx.arc(cx, cy, r, Math.PI * 0.1, Math.PI * 0.9);
    else ctx.arc(cx, cy, r * 1.03, 0, Math.PI * 2);
    ctx.fill();
    if (style === "long") ctx.fillRect(cx - r * 1.02, cy, r * 2.04, r * 1.4);
    if (style === "bun") {
      circle(cx, cy - r * 0.85, r * 0.45);
      ctx.fill();
    }
    if (style === "curly") for (let i = 0; i < 7; i++) {
      circle(cx + Math.cos(i) * r * 0.9, cy + Math.sin(i * 1.7) * r * 0.5 - r * 0.2, r * 0.32);
      ctx.fill();
    }
    if (style !== "bald") {
      ctx.strokeStyle = shade(hair.startsWith("#") ? hair : "#000000", -0.25);
      for (const dx of [-0.35, 0, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * r, cy - r * 0.8);
        ctx.quadraticCurveTo(cx + dx * r * 1.3, cy, cx + dx * r * 0.9, cy + r * 0.7);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(0,0,0,.28)";
    circle(cx, cy, r);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = skin;
  circle(cx, cy, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (view === "front") {
    if (style === "bald") {
      ctx.arc(cx - r * 0.9, cy - r * 0.1, r * 0.3, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.9, cy - r * 0.1, r * 0.3, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, cy, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
      ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 0.15, cx, cy - r * 0.45);
      ctx.quadraticCurveTo(cx - r * 0.5, cy - r * 0.2, cx - r * 1.04, cy - r * 0.05);
    }
  } else if (style === "bald") {
    ctx.arc(cx - r * 0.35, cy, r * 0.4, 0, Math.PI * 2);
  } else {
    ctx.arc(cx, cy, r * 1.04, Math.PI * 0.55, Math.PI * 1.9);
    ctx.quadraticCurveTo(cx + r * 0.3, cy - r * 0.3, cx - r * 0.05, cy + r * 0.1);
    ctx.quadraticCurveTo(cx - r * 0.3, cy + r * 0.5, cx - r * 0.6, cy + r * 0.85);
  }
  ctx.fill();
  if (style === "bun") {
    circle(view === "front" ? cx : cx - r * 0.75, cy - r * 0.85, r * 0.42);
    ctx.fill();
  }
  if (style === "curly") for (let i = 0; i < 5; i++) {
    circle(cx + (view === "front" ? (i - 2) * r * 0.42 : -r * 0.8 + i * r * 0.28), cy - r * 0.75 + Math.abs(i - 2) * r * 0.12, r * 0.3);
    ctx.fill();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = line;
  if (view === "front") {
    ctx.fillStyle = ink;
    for (const s of [-1, 1]) {
      if (closed) {
        ctx.beginPath();
        ctx.arc(cx + s * r * 0.36, cy + r * 0.1, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      } else {
        circle(cx + s * r * 0.36, cy + r * 0.12, r * 0.12);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.35, r * 0.25, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    if (look.beard) {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.15, r * 0.95, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.quadraticCurveTo(cx, cy + r * 0.55, cx + r * 0.9, cy + r * 0.45);
      ctx.fill();
    }
    if (look.glasses) {
      for (const s of [-1, 1]) {
        circle(cx + s * r * 0.36, cy + r * 0.12, r * 0.24);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.12, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.12, cy + r * 0.1);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.92, cy - r * 0.05);
    ctx.lineTo(cx + r * 1.2, cy + r * 0.28);
    ctx.lineTo(cx + r * 0.9, cy + r * 0.38);
    ctx.fill();
    ctx.fillStyle = shade(skin, -0.15);
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.15, cy + r * 0.15, r * 0.17, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    if (closed) {
      ctx.beginPath();
      ctx.arc(cx + r * 0.5, cy + r * 0.08, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      circle(cx + r * 0.5, cy + r * 0.1, r * 0.12);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.55, cy + r * 0.58);
    ctx.lineTo(cx + r * 0.85, cy + r * 0.55);
    ctx.stroke();
    if (look.beard) {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.05, cy + r * 0.35);
      ctx.quadraticCurveTo(cx + r * 0.3, cy + r * 1.05, cx + r * 0.95, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.4, cy + r * 0.45);
      ctx.fill();
    }
    if (look.glasses) {
      circle(cx + r * 0.55, cy + r * 0.12, r * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.3, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.1, cy + r * 0.05);
      ctx.stroke();
    }
  }
}

/** A drawn head, as a square canvas (transparent around the head). */
export function drawnHead(look: Character, view: FaceView, size = 128): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  drawFace(canvas.getContext("2d")!, size / 2, size * 0.53, size * 0.36, view, look);
  return canvas;
}

/** A round avatar: the front face (photo or drawn) over the shoulders, for chips and lists. */
export function faceAvatar(profile: Profile, size = 64): HTMLCanvasElement {
  const look = characterOf(profile);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#e5e7eb";
  c.fillRect(0, 0, size, size);
  c.fillStyle = look.top;
  c.beginPath();
  c.ellipse(size / 2, size * 1.02, size * 0.42, size * 0.3, 0, 0, Math.PI * 2);
  c.fill();
  drawFace(c, size / 2, size * 0.45, size * 0.27, "front", look);
  return canvas;
}

const photoCache = new Map<string, Promise<HTMLCanvasElement | null>>();

/**
 * A face image as a square canvas; null when it can't load. Images with a
 * transparent background (made for the purpose) are used as they are; one on a
 * plain white background (a face view uploaded as JPEG) has the white around it
 * removed; anything else, a real photo, is cut to a circle.
 */
export function photoHead(mediaId: string, size = 256): Promise<HTMLCanvasElement | null> {
  const key = `${mediaId}:${size}`;
  let p = photoCache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const c = canvas.getContext("2d", { willReadFrequently: true })!;
        const s = Math.min(img.width, img.height);
        const draw = () => c.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        draw();
        const data = c.getImageData(0, 0, size, size);
        const corners = [0, size - 1, size * (size - 1), size * size - 1].map((i) => i * 4);
        if (corners.some((i) => data.data[i + 3] < 32)) {
          // Already transparent.
        } else if (corners.every((i) => isPaper(data.data, i))) {
          clearPaper(data, size);
          c.putImageData(data, 0, 0);
        } else {
          c.clearRect(0, 0, size, size);
          c.save();
          c.beginPath();
          c.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
          c.clip();
          draw();
          c.restore();
        }
        resolve(canvas);
      };
      img.onerror = () => resolve(null);
      img.src = mediaUrl(mediaId);
    });
    photoCache.set(key, p);
  }
  return p;
}

/** Near-white and grey-free: the plain background a face view was flattened onto. */
function isPaper(px: Uint8ClampedArray, i: number): boolean {
  const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
  return Math.min(r, g, b) > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
}

/** Makes the white background transparent: only white reachable from the edges, so a white collar or eye stays. */
function clearPaper(data: ImageData, size: number) {
  const px = data.data;
  const seen = new Uint8Array(size * size);
  const stack: number[] = [];
  for (let i = 0; i < size; i++) stack.push(i, size * (size - 1) + i, i * size, i * size + size - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p] || !isPaper(px, p * 4)) continue;
    seen[p] = 1;
    px[p * 4 + 3] = 0;
    const x = p % size;
    if (x > 0) stack.push(p - 1);
    if (x < size - 1) stack.push(p + 1);
    if (p >= size) stack.push(p - size);
    if (p < size * (size - 1)) stack.push(p + size);
  }
  // Soften the cut: edge pixels next to the cleared background go half see-through.
  for (let p = 0; p < size * size; p++) {
    if (seen[p]) continue;
    const x = p % size;
    const near = (x > 0 && seen[p - 1]) || (x < size - 1 && seen[p + 1]) || (p >= size && seen[p - size]) || (p < size * (size - 1) && seen[p + size]);
    if (near) px[p * 4 + 3] = 140;
  }
}
