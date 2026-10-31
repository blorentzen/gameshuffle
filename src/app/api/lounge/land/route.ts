import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { isMmrGame } from "@/lib/mmr/rules";
import { countAbove } from "@/lib/lounge/lookupServer";

/**
 * GET /api/lounge/land?game=<mkworld12p|mkworld24p|mk8dx>&mmr=<0 to 30000>
 * → { ok: true, above } : how many players with an event this season are above that number (the
 *   divisions section's "Where would this MMR land?"), or { ok: false } when MKCentral is slow, so the
 *   page works it out from the division counts instead. Anyone; rate limited per address.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`lounge-land:${ip}`, { max: 40, windowMs: 60_000 })).ok) {
    return NextResponse.json({ ok: false, reason: "slow_down" }, { status: 429 });
  }
  const game = req.nextUrl.searchParams.get("game");
  const mmr = Number(req.nextUrl.searchParams.get("mmr"));
  if (!isMmrGame(game) || !Number.isFinite(mmr) || mmr < 0 || mmr > 30_000) return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  const above = await countAbove(game, Math.floor(mmr)).catch(() => null);
  if (above == null) return NextResponse.json({ ok: false, reason: "unavailable" });
  return NextResponse.json({ ok: true, above }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
