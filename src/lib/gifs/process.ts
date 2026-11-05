import "server-only";

/**
 * Turns an uploaded GIF (or animated WebP) into what we keep: an animated WebP at most 480 pixels a side, its first
 * frame as a still WebP, a sheet of up to four frames for the automatic check, and two fingerprints (the file's
 * SHA-256 and a difference hash of the first frame, so a removed GIF re-encoded or resized is still caught).
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { GIF_MAX_FRAMES, GIF_MAX_SIDE } from "./rules";

export interface ProcessedGif {
  anim: Buffer;
  still: Buffer;
  /** Up to four frames in a 2x2 grid (first, a third in, two thirds, last), for the check. */
  sheet: Buffer;
  width: number;
  height: number;
  frames: number;
  sha256: string;
  dhash: string;
}

/** not_animated: a single frame is a picture, not a GIF (a GIF here always moves). */
export type ProcessError = "bad_file" | "too_many_frames" | "not_animated";

const fit = { width: GIF_MAX_SIDE, height: GIF_MAX_SIDE, fit: "inside" as const, withoutEnlargement: true };

/** A 64-bit difference hash of an image's first frame, as 16 hex characters. */
async function dhashOf(input: Buffer): Promise<string> {
  const px = await sharp(input, { pages: 1 }).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (px[row * 9 + col] > px[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Up to four frames of an animated picture (first, a third in, two thirds, last) in a 2x2 grid, for the check. */
export async function frameSheet(input: Buffer, frames: number): Promise<Buffer> {
  const picks = [...new Set([0, Math.floor(frames / 3), Math.floor((frames * 2) / 3), frames - 1])];
  const tiles = await Promise.all(picks.map((page) =>
    sharp(input, { page, pages: 1 }).resize(256, 256, { fit: "contain", background: "#808080" }).flatten({ background: "#808080" }).png().toBuffer()));
  return sharp({ create: { width: 512, height: 512, channels: 3, background: "#808080" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * 256, top: Math.floor(i / 2) * 256 })))
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function processGif(input: Buffer): Promise<ProcessedGif | { error: ProcessError }> {
  try {
    const meta = await sharp(input, { animated: true }).metadata();
    const frames = meta.pages ?? 1;
    if (!meta.width || !meta.height) return { error: "bad_file" };
    if (frames < 2) return { error: "not_animated" };
    if (frames > GIF_MAX_FRAMES) return { error: "too_many_frames" };

    const anim = await sharp(input, { animated: true }).resize(fit).webp({ quality: 72, effort: 4, loop: 0 }).toBuffer();
    const out = await sharp(anim, { animated: true }).metadata();
    const width = out.width ?? GIF_MAX_SIDE;
    const height = out.pageHeight ?? out.height ?? GIF_MAX_SIDE;
    const still = await sharp(input, { pages: 1 }).resize(fit).webp({ quality: 80 }).toBuffer();

    const sheet = await frameSheet(input, frames);

    return {
      anim, still, sheet, width, height, frames,
      sha256: createHash("sha256").update(input).digest("hex"),
      dhash: await dhashOf(input),
    };
  } catch (err) {
    console.error("[gifs] processing failed:", err);
    return { error: "bad_file" };
  }
}
