import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDeck } from "@/lib/party/deckSource";

export const runtime = "nodejs";

/**
 * GET /api/decks/public?family=mario-party — the deck the randomizer deals
 * from: the official live cards, plus the signed-in person's own Pro+ cards.
 * Retired cards are included (marked) so older saved setups still render.
 */
export async function GET(req: NextRequest) {
  const family = req.nextUrl.searchParams.get("family") ?? "mario-party";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const deck = await loadDeck(family, user?.id ?? null);
  return NextResponse.json({ ok: true, ...deck }, { headers: { "Cache-Control": "private, max-age=30" } });
}
