/**
 * GET /api/board-games/search?q=<term> → up to 25 matching board games.
 *
 * Auth-required (auth is the gate — anon callers can't drive BGG calls),
 * rate-limited per user, cache-first (BGG is only hit on a cache miss/stale
 * read). Used by the game night create flow to add games being brought.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchBoardGames, searchLocalBoardGames } from "@/lib/bgg/catalog";
import { requireAuthedUser, checkSearchRateLimit } from "@/lib/bgg/routeAuth";
import { SEARCH_MIN_CHARS } from "@/lib/bgg/config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireAuthedUser(supabase);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code }, { status: auth.status });
  }

  const rl = checkSearchRateLimit(auth.userId);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < SEARCH_MIN_CHARS) {
    return NextResponse.json({ games: [] });
  }

  // Prod-safe path: read our seeded cache first (no live call).
  const local = await searchLocalBoardGames(q);
  if (local.length > 0) {
    return NextResponse.json({ games: local });
  }

  // Cache miss → best-effort live enrichment. BGG blocks datacenter IPs, so this
  // usually no-ops in prod; failures are expected and swallowed (no log spam).
  try {
    const games = await searchBoardGames(q);
    return NextResponse.json({ games });
  } catch {
    return NextResponse.json({ games: [] });
  }
}
