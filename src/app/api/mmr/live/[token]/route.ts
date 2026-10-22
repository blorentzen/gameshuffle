/**
 * GET /api/mmr/live/<token>[?look=<id>] → what an MMR card shows right now (public by its
 * OBS link). The lounge data behind it is cached for 90 seconds, and this answer for 20 at
 * the edge, so a card polling every 30 seconds stays light.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cardByToken, liveFor } from "@/lib/mmr/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const card = await cardByToken(token);
  if (!card) return NextResponse.json({ ok: false, reason: "no_card" }, { status: 404, headers: { "cache-control": "no-store" } });
  const look = req.nextUrl.searchParams.get("look");
  const data = await liveFor(card, { look });
  return NextResponse.json(data, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=40" } });
}
