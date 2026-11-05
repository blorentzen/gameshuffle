/**
 * GET /mmr-card/picture/<game>/<MKCentral id>?size=square|wide|story → a lounge player's MMR card as a picture,
 * in the look of the GameShuffle account whose card shows that player, else ours (picks 2026-11-04, 9A). Public
 * (lounge numbers are public on MKCentral): Discord's /mmr shows it. Kept 10 minutes at the edge, so a link
 * stays close to current (pick 7A); /mmr adds a time bucket to the address so Discord asks again.
 */

import { isMmrGame } from "@/lib/mmr/rules";
import { LoungeUnavailable, playerPicture } from "@/lib/mmr/pictureData";
import { isPictureSize, renderMmrPicture } from "@/lib/mmr/picture";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ game: string; id: string }> }) {
  const { game, id } = await ctx.params;
  const playerId = Number(id.replace(/\.png$/, ""));
  if (!isMmrGame(game) || !Number.isInteger(playerId) || playerId <= 0) return new Response("Not found", { status: 404 });
  const sizeArg = new URL(req.url).searchParams.get("size");
  const size = isPictureSize(sizeArg) ? sizeArg : "wide";
  try {
    const input = await playerPicture(game, playerId);
    if (!input) return new Response("Not found", { status: 404 });
    const png = await renderMmrPicture(input, size);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=600" } });
  } catch (err) {
    if (!(err instanceof LoungeUnavailable)) console.error("[mmr picture]", err);
    return new Response("The lounge isn't answering", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
