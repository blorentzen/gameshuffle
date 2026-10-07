import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * One share image for every page under this dynamic route. A static image
 * file can't live in a dynamic segment (the production build fails to
 * prerender it), so it's served from public/images/opengraph/pages instead.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export const alt = "GameShuffle guides";

export default async function Image() {
  const file = await readFile(path.join(process.cwd(), "public", "images", "opengraph", "pages", "guides.jpg"));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": contentType } });
}
