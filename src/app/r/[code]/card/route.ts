/**
 * GET /r/<code>/card?size=wide|tall|square[&v=<version>][&download=1] → the share card as a PNG, for the
 * phone's share sheet (tall), computers (wide) and Save picture. With `v` the picture never
 * changes, so it can be cached for good.
 */

import { loadShare } from "@/lib/share/store";
import { renderShareCard } from "@/lib/share/render";
import { MMR_PICTURE_CACHE, sharedMmrPicture } from "@/lib/mmr/sharePicture";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const share = await loadShare(code);
  if (!share) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const sizeArg = url.searchParams.get("size");
  const tall = sizeArg === "tall";
  // An MMR card is drawn from the card as it is now, never cached for good (picks 2026-11-04, 7A).
  const mp = share.data.parts[0]?.kind === "mmr" ? share.data.parts[0] : null;
  if (mp) {
    const size = sizeArg === "square" ? "square" : tall ? "story" : "wide";
    const pic = await sharedMmrPicture(code, mp, size);
    if (!pic) return new Response("The card can't be read right now", { status: 503, headers: { "Cache-Control": "no-store" } });
    const h: Record<string, string> = { "Content-Type": "image/png", "Cache-Control": MMR_PICTURE_CACHE };
    if (url.searchParams.get("download")) h["Content-Disposition"] = `attachment; filename="mmr-card-${size}.png"`;
    return new Response(new Uint8Array(pic), { headers: h });
  }
  const png = await renderShareCard(share.data, tall ? "tall" : "wide");
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": url.searchParams.get("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
  };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="gameshuffle-${share.data.kind}-${share.data.day}${tall ? "-story" : ""}.png"`;
  return new Response(new Uint8Array(png), { headers });
}
