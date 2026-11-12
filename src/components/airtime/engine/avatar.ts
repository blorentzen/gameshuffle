/**
 * Your face for the player (client): the picture the site shows for you (your
 * DiceBear avatar, or your Twitch or Discord picture through our own
 * same-origin route, so no canvas is tainted), or for signed-out players a
 * DiceBear avatar from a seed kept in this browser. Drawn once into a round
 * badge on a canvas, which the player model wears as its head.
 */

import { generateDicebearAvatar, type AvatarOptions } from "@/lib/avatar/dicebear";

export type OwnAvatar =
  | { kind: "dicebear"; seed: string; options: AvatarOptions | null }
  | { kind: "photo"; url: string };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    return await loadImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** A DiceBear Adventurer head on a clear background. */
export function headSvg(seed: string, look: AvatarOptions | null): string {
  return generateDicebearAvatar(seed, { ...(look ?? {}), backgroundColor: "transparent" });
}

/** A round badge: your picture on a colored disc with a white rim. `px` is the canvas size. */
export async function faceCanvas(own: OwnAvatar, px = 256, tone: [string, string] = ["#2f66ec", "#6fa1ff"]): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const ctx = c.getContext("2d")!;
  const r = px / 2;
  const inner = r - px * 0.06;
  const g = ctx.createLinearGradient(0, 0, px, px);
  g.addColorStop(0, tone[0]);
  g.addColorStop(1, tone[1]);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, inner, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  let drawn = false;
  if (own.kind === "photo") {
    try {
      const img = await loadImage(own.url);
      ctx.drawImage(img, r - inner, r - inner, inner * 2, inner * 2);
      drawn = true;
    } catch {
      // Fall through to a generated head.
    }
  }
  if (!drawn) {
    const seed = own.kind === "dicebear" ? own.seed : "airtime";
    const look = own.kind === "dicebear" ? own.options : null;
    // The head a little low and large, so the face fills the badge.
    ctx.drawImage(await svgImage(headSvg(seed, look)), r - inner * 1.05, r - inner * 0.98, inner * 2.1, inner * 2.1);
  }
  ctx.restore();
  ctx.lineWidth = px * 0.06;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(r, r, inner + px * 0.02, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = px * 0.02;
  ctx.strokeStyle = "rgba(10,14,30,0.85)";
  ctx.beginPath();
  ctx.arc(r, r, r - px * 0.012, 0, Math.PI * 2);
  ctx.stroke();
  return c;
}
