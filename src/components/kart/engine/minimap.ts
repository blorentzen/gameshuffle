/**
 * The race's little map (client): the track's line drawn once into a canvas;
 * the engine adds the dots each frame. No three.js here.
 */

import type { Track } from "@/lib/kart/track";

/** The track as a small map (drawn once; dots are added each frame). */
export function drawMinimap(track: Track, size: number): { canvas: HTMLCanvasElement; toMap: (x: number, y: number) => [number, number] } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const b = track.bounds;
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const k = (size - 12) / span;
  const ox = (size - (b.x1 - b.x0) * k) / 2;
  const oy = (size - (b.y1 - b.y0) * k) / 2;
  const toMap = (x: number, y: number): [number, number] => [ox + (x - b.x0) * k, oy + (y - b.y0) * k];
  ctx.beginPath();
  for (let i = 0; i <= track.n; i++) {
    const [x, y] = toMap(track.xs[i % track.n], track.ys[i % track.n]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(10,14,30,0.8)";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4.5;
  ctx.stroke();
  const [fx, fy] = toMap(track.xs[0], track.ys[0]);
  ctx.fillStyle = "#15182a";
  ctx.beginPath();
  ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  return { canvas, toMap };
}
