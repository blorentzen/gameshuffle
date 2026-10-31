/**
 * GET /api/tcg/showcase?dex=25 → { card } — the showcase TCG card picked for
 * that Pokémon (src/data/pokemon/showcase-cards.ts), read from our catalog
 * (0 Scrydex credits, never a live lookup), or { card: null } when it has no
 * pick here yet. The Daily Dex's card of the day asks for it only once the
 * game is over, so it never gives the answer away.
 */

import { NextResponse } from "next/server";
import { SHOWCASE_CARDS } from "@/data/pokemon/showcase-cards";
import { getCatalogCards } from "@/lib/scrydex/catalog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const dex = Number(new URL(req.url).searchParams.get("dex"));
  if (!Number.isInteger(dex) || dex < 1 || dex > 1025) return NextResponse.json({ card: null }, { status: 400 });
  const id = SHOWCASE_CARDS[dex];
  const [c] = id ? await getCatalogCards([id]).catch(() => []) : [];
  const card = c && (c.images?.medium || c.images?.small)
    ? { id: c.id, name: c.name, set: c.expansion_name ?? null, number: c.number ?? null, rarity: c.rarity ?? null, images: c.images }
    : null;
  return NextResponse.json({ card }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
