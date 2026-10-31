import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Each game's time trials page has its own share image. A static image can't live in a dynamic
 * segment (the production build fails), so they're served from public/images/opengraph/pages.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "Mario Kart time trials on GameShuffle";

const FILES: Record<string, string> = { "mario-kart-world": "time-trials-mario-kart-world.jpg", "mario-kart-8-deluxe": "time-trials-mario-kart-8-deluxe.jpg" };

export default async function Image({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const file = await readFile(path.join(process.cwd(), "public", "images", "opengraph", "pages", FILES[game] ?? "time-trials-mario-kart-8-deluxe.jpg"));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } });
}
