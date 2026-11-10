import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { renderEventCard } from "@/lib/og/eventCard";
import { kirbyHubCard } from "@/lib/og/competitiveCards";

/**
 * Each game's time trials page has its own share image. A static image can't live in a dynamic
 * segment (the production build fails), so they're served from public/images/opengraph/pages. Kirby Air Riders has
 * no file there: its card is drawn from its key art (src/lib/og) and sent as a JPEG like the others.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "Time trial leaderboards on GameShuffle";

const FILES: Record<string, string> = { "mario-kart-world": "time-trials-mario-kart-world.jpg", "mario-kart-8-deluxe": "time-trials-mario-kart-8-deluxe.jpg" };

export default async function Image({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (game === "kirby-air-riders") {
    const png = Buffer.from(await (await renderEventCard(await kirbyHubCard())).arrayBuffer());
    return new Response(new Uint8Array(await sharp(png).jpeg({ quality: 86 }).toBuffer()), { headers: { "Content-Type": contentType } });
  }
  const file = await readFile(path.join(process.cwd(), "public", "images", "opengraph", "pages", FILES[game] ?? "time-trials-mario-kart-8-deluxe.jpg"));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } });
}
