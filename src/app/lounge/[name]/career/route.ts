/**
 * GET /lounge/<name>/career?game=<mkworld12p|mkworld24p|mk8dx>
 * → { ok: true, seasons: CareerSeason[] } (oldest first) for the player page's Career tab, or
 *   { ok: false, reason: "not_found" | "unavailable" | "slow_down" }.
 * Public, rate limited per address: a first career read asks MKCentral for every past season
 * (kept for good after that), so a stranger can't use this to walk the whole lounge.
 */

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { LoungeUnavailable, loungePlayer } from "@/lib/mmr/mkcentral";
import { isMmrGame } from "@/lib/mmr/rules";
import { loungeCareer } from "@/lib/lounge/store";

export const runtime = "nodejs";

const HEADERS = { "X-Robots-Tag": "noindex", "Cache-Control": "private, max-age=60" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name).trim().slice(0, 40);
  const g = req.nextUrl.searchParams.get("game");
  const game = isMmrGame(g) ? g : "mkworld12p";
  if (!name) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404, headers: HEADERS });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await rateLimit(`lounge-career:${ip}`, { max: 20, windowMs: 60_000 })).ok) {
    return NextResponse.json({ ok: false, reason: "slow_down" }, { status: 429, headers: HEADERS });
  }
  try {
    const current = await loungePlayer({ name }, game);
    if (!current) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404, headers: HEADERS });
    const seasons = await loungeCareer(current, game);
    return NextResponse.json({ ok: true, seasons }, { headers: HEADERS });
  } catch (err) {
    if (!(err instanceof LoungeUnavailable)) console.error("[lounge/career]", err);
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
