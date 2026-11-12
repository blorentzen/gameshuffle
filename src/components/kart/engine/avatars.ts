/**
 * Drivers (client): the avatar's head on a pair of shoulders in a jersey,
 * drawn once into a canvas sized for the screen (up to twice the base size on
 * a sharp screen), then shown as a camera-facing picture in the kart. Cast members and signed-out players are
 * DiceBear Adventurer avatars made here from a seed and a look (with a clear
 * background, so the head sits on the shoulders); a signed-in player gets the
 * picture the site shows for them (their DiceBear avatar, or their Twitch or
 * Discord picture through our own same-origin route, so no canvas is tainted).
 */

import { generateDicebearAvatar, type AvatarOptions } from "@/lib/avatar/dicebear";
import { TONE_COLORS, type Driver } from "@/lib/kart/roster";

export type OwnAvatar =
  | { kind: "dicebear"; seed: string; options: AvatarOptions | null }
  | { kind: "photo"; url: string };

/** Canvas size of a driver picture; the head is the top square. */
export const DRIVER_W = 300;
export const DRIVER_H = 336;
/** Height of the driver (head and shoulders) in world units. */
export const DRIVER_UNITS = 13;

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
    // The image has decoded; the URL can go.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** A DiceBear Adventurer head on a clear background. */
export function headSvg(seed: string, look: AvatarOptions | null): string {
  return generateDicebearAvatar(seed, { ...(look ?? {}), backgroundColor: "transparent" });
}

function shoulders(ctx: CanvasRenderingContext2D, tone: [string, string]) {
  const g = ctx.createLinearGradient(0, 220, 0, DRIVER_H);
  g.addColorStop(0, tone[1]);
  g.addColorStop(1, tone[0]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(98, 226);
  ctx.bezierCurveTo(60, 236, 34, 262, 30, DRIVER_H);
  ctx.lineTo(DRIVER_W - 30, DRIVER_H);
  ctx.bezierCurveTo(DRIVER_W - 34, 262, DRIVER_W - 60, 236, DRIVER_W - 98, 226);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(10,14,30,0.85)";
  ctx.stroke();
  // Collar and a stripe down each shoulder.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(108, 226);
  ctx.quadraticCurveTo(150, 274, 192, 226);
  ctx.quadraticCurveTo(150, 252, 108, 226);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(76, 246);
  ctx.quadraticCurveTo(52, 282, 50, DRIVER_H);
  ctx.moveTo(DRIVER_W - 76, 246);
  ctx.quadraticCurveTo(DRIVER_W - 52, 282, DRIVER_W - 50, DRIVER_H);
  ctx.stroke();
}

/**
 * Draws a driver: the cast member's avatar, or yours. Falls back to a plain
 * DiceBear head if a picture can't be read. `scale` sizes the picture (1 =
 * 300 by 336 pixels) so it stays sharp on the screen it's shown on.
 */
export async function driverCanvas(driver: Driver, own: OwnAvatar, scale = 1): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const k = Math.max(0.5, Math.min(3, scale));
  canvas.width = Math.round(DRIVER_W * k);
  canvas.height = Math.round(DRIVER_H * k);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(k, k);
  shoulders(ctx, TONE_COLORS[driver.tone] ?? TONE_COLORS.blue);

  if (driver.cast) {
    ctx.drawImage(await svgImage(headSvg(driver.cast.seed, driver.cast.look)), 0, 0, DRIVER_W, DRIVER_W);
    return canvas;
  }
  if (own.kind === "photo") {
    try {
      const img = await loadImage(own.url);
      const r = 104;
      const cx = DRIVER_W / 2;
      const cy = 128;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,14,30,0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      return canvas;
    } catch {
      // Fall through to a generated head.
    }
  }
  const seed = own.kind === "dicebear" ? own.seed : "shuffle-kart";
  const look = own.kind === "dicebear" ? own.options : null;
  ctx.drawImage(await svgImage(headSvg(seed, look)), 0, 0, DRIVER_W, DRIVER_W);
  return canvas;
}
