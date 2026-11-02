/**
 * GET /api/war/live/<token> → the war an overlay link shows right now (public by its OBS link). Answers are
 * kept 2 seconds at the edge, so overlays polling every 3 seconds stay light and a race shows within a few.
 */

import { NextResponse } from "next/server";
import { warLive } from "@/lib/wars/live";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const data = await warLive(token, new URL(req.url).searchParams.get("look"));
  if (!data) return NextResponse.json({ ok: false }, { status: 404, headers: { "cache-control": "no-store" } });
  return NextResponse.json(data, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=4" } });
}
