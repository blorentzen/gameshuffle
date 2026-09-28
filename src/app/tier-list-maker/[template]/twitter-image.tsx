import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Share image per template: pre-rendered to public/images/opengraph/tier-list/<template>.jpg
 * in the site's OG style (same template as every other page). Unknown ones
 * fall back to the main GameShuffle image.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "GameShuffle Tier list";

export default async function Image({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params;
  const dir = path.join(process.cwd(), "public", "images", "opengraph");
  const safe = template.replace(/[^a-z0-9-]/gi, "");
  const file = await readFile(path.join(dir, "tier-list", `${safe}.jpg`)).catch(() => readFile(path.join(dir, "gameshuffle-main-og.jpg")));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } });
}
