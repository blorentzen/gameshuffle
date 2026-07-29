import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import type { TcgCard } from "./types";

/**
 * Read-only catalog access for PUBLIC pages. Plain SELECT from `tcg_cards` —
 * 0 credits, never touches Scrydex. This is the compliance-safe path for
 * anonymous-hittable surfaces: a card that hasn't been populated simply
 * doesn't render (no live resolve, so an anon page view can never drive
 * credit spend). Populate curated ids out-of-band via the operator script.
 *
 * Uses the service client because `tcg_cards` RLS grants SELECT to
 * `authenticated` only, and these surfaces serve anon visitors server-side.
 */
/**
 * Recently-populated paper cards for a browse/example grid (0 credits).
 * Read-only from `tcg_cards`; excludes Pokémon TCG Pocket (`tcgp-*`) and
 * cards without a thumbnail so the picker always has real visual examples.
 */
export async function browseRecentCatalog(limit = 18): Promise<TcgCard[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("tcg_cards")
    .select("*")
    .not("id", "like", "tcgp-%")
    .not("images", "is", null)
    .eq("language_code", "English")
    .order("fetched_at", { ascending: false })
    .limit(limit * 6); // over-fetch; filter no-image + dedupe by name below
  const seen = new Set<string>();
  const cards: TcgCard[] = [];
  for (const c of (data ?? []) as TcgCard[]) {
    if (!c.images?.small) continue;
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue; // one card per name for varied examples
    seen.add(key);
    cards.push(c);
    if (cards.length >= limit) break;
  }
  return cards;
}

export async function getCatalogCards(ids: string[]): Promise<TcgCard[]> {
  if (ids.length === 0) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from("tcg_cards")
    .select("*, expansion:tcg_expansions(name)")
    .in("id", ids);
  const byId = new Map(
    ((data ?? []) as (TcgCard & { expansion?: { name?: string } | null })[]).map(
      (c) => [
        c.id,
        { ...c, expansion_name: c.expansion?.name ?? null } as TcgCard,
      ],
    ),
  );
  // Preserve the caller's curated order; drop any not-yet-populated ids.
  return ids.map((id) => byId.get(id)).filter((c): c is TcgCard => Boolean(c));
}
