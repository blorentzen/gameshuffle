import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The lounge scoring pages' share image (in Gabarito, made by scripts/render-page-og.cjs). A static image can't live
 * in a dynamic segment (the production build fails), so it's served from public/images/opengraph/pages.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "Mario Kart lounge scoring on GameShuffle";

export default async function Image() {
  const file = await readFile(path.join(process.cwd(), "public", "images", "opengraph", "pages", "competitive.jpg"));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } });
}
