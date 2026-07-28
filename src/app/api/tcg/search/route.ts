/**
 * GET /api/tcg/search?q=<term>  → up to 25 matching cards.
 *
 * Auth-required (auth is the gate — anon callers can never drive credit
 * spend). Free tier ALLOWED: browsing card data is not the paid capability;
 * gating browse would break the deck-sales funnel. Rate-limited 30/min/user
 * as a credit-drain backstop.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCards } from "@/lib/scrydex/ingest";
import {
  checkSearchRateLimit,
  requireAuthedUser,
} from "@/lib/scrydex/routeAuth";
import { TCG_ERROR } from "@/lib/scrydex/types";

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
      { code: TCG_ERROR.RATE_LIMITED },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) {
    // Below the floor: return empty, spend nothing.
    return NextResponse.json({ cards: [] });
  }

  try {
    const cards = await searchCards(q);
    // Exclude Pokémon TCG Pocket (mobile-game) cards — `tcgp-*` ids are not
    // sellable paper singles — and non-English printings, so they don't
    // pollute the (English) shop/collection picker.
    const paper = cards.filter(
      (c) => !c.id.startsWith("tcgp-") && c.language_code === "English",
    );
    return NextResponse.json({ cards: paper });
  } catch (err) {
    console.error("[api/tcg/search]", err);
    return NextResponse.json(
      { code: TCG_ERROR.UPSTREAM_ERROR },
      { status: 502 },
    );
  }
}
