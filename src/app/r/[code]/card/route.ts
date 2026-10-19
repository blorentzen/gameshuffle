/**
 * GET /r/<code>/card?size=wide|tall[&v=<version>][&download=1] → the share card as a PNG, for the
 * phone's share sheet (tall), computers (wide) and Save picture. With `v` the picture never
 * changes, so it can be cached for good.
 */

import { loadShare } from "@/lib/share/store";
import { renderShareCard } from "@/lib/share/render";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const share = await loadShare(code);
  if (!share) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const tall = url.searchParams.get("size") === "tall";
  const png = await renderShareCard(share.data, tall ? "tall" : "wide");
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": url.searchParams.get("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
  };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="gameshuffle-${share.data.kind}-${share.data.day}${tall ? "-story" : ""}.png"`;
  return new Response(new Uint8Array(png), { headers });
}
