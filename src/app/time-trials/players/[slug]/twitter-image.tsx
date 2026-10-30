import { readFile } from "node:fs/promises";
import path from "node:path";

/** Players pages share one image (a dynamic segment can't hold a static file), from public/images/opengraph/pages. */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "A player's time trials on GameShuffle";

export default async function Image() {
  const file = await readFile(path.join(process.cwd(), "public", "images", "opengraph", "pages", "time-trials-player.jpg"));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } });
}
