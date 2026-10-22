import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { LoungeUnavailable } from "@/lib/mmr/mkcentral";
import { MMR_GAME_IDS, isMmrGame } from "@/lib/mmr/rules";
import { parseFriendCode } from "@/lib/lounge/lookup";
import { playersByFriendCode, suggestPlayers } from "@/lib/lounge/lookupServer";

/**
 * GET /api/lounge/suggest?q=<two letters or more, or a friend code>&game=<all|mkworld12p|mkworld24p|mk8dx>
 * → { ok: true, kind: "name" | "fc", results: Suggestion[] } for the lounge search as you type,
 *   or { ok: false, reason: "unavailable" | "slow_down" }. Anyone; rate limited per address.
 */

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`lounge-suggest:${ip}`, { max: 90, windowMs: 60_000 })).ok) {
    return NextResponse.json({ ok: false, reason: "slow_down" }, { status: 429 });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  const g = req.nextUrl.searchParams.get("game");
  const games = isMmrGame(g) ? [g] : MMR_GAME_IDS;
  const fc = parseFriendCode(q);
  try {
    const results = fc ? await playersByFriendCode(fc, games) : await suggestPlayers(q, games);
    return NextResponse.json(
      { ok: true, kind: fc ? "fc" : "name", results },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (err) {
    if (!(err instanceof LoungeUnavailable)) console.error("[lounge/suggest]", err);
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
