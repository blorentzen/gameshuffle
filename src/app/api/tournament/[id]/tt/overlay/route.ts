/**
 * GET /api/tournament/[id]/tt/overlay?p=<participantId> → the small view the overlay's time trial piece polls
 * (src/lib/tournaments/tt/overlayServer.ts): the track or round, the time left and the standings, with the
 * streamer's own row (`p`) lit up. Public data only, cached a few seconds at the edge.
 */

import { NextResponse } from "next/server";
import { ttOverlayData } from "@/lib/tournaments/tt/overlayServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = new URL(req.url).searchParams.get("p");
  const data = await ttOverlayData(id, p && /^[0-9a-f-]{36}$/i.test(p) ? p : null).catch((err) => {
    console.error("[tt] overlay view failed:", err);
    return null;
  });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=5" } });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=5" } });
}
