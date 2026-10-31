/**
 * GET /api/mmr/lookup?name=<lounge name>&game=<mkworld12p|mkworld24p|mk8dx>
 * → { ok: true, source } for the studio's "Find me" and its live preview (with the country rank
 *   and the season's player count, so every piece the studio can switch on has its number), or
 *   { ok: false, reason: "not_found" | "unavailable" }. Rate limited per account, or per connection for visitors
 *   building a card before making an account (try before paying, 2026-10-29).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { LoungeUnavailable, countryCountAbove, loungePlayer, loungeStats } from "@/lib/mmr/mkcentral";
import { isMmrGame } from "@/lib/mmr/rules";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = user ? `mmr-lookup:${user.id}` : `mmr-lookup-ip:${ip}`;
  if (!(await rateLimit(key, { max: user ? 30 : 15, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  const game = req.nextUrl.searchParams.get("game");
  if (!name || name.length > 40 || !isMmrGame(game)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const [player, stats] = await Promise.all([loungePlayer({ name }, game), loungeStats(game)]);
    if (!player) return NextResponse.json({ ok: false, reason: "not_found" });
    const above = player.country && player.mmr != null && player.eventsPlayed > 0 ? await countryCountAbove(game, player.country, player.mmr + 1).catch(() => null) : null;
    return NextResponse.json({
      ok: true,
      playerId: player.playerId,
      eventsPlayed: player.eventsPlayed,
      source: {
        name: player.name, country: player.country, game, mmr: player.mmr, maxMmr: player.maxMmr, division: player.division,
        worldRank: player.worldRank, steps: stats.steps, changes: player.changes, since: gsDayStart(gsDay()).toISOString(), avatar: null,
        countryRank: above == null ? null : above + 1, totalPlayers: stats.totalPlayers,
      },
    });
  } catch (err) {
    if (!(err instanceof LoungeUnavailable)) console.error("[mmr/lookup]", err);
    return NextResponse.json({ ok: false, reason: "unavailable" });
  }
}
