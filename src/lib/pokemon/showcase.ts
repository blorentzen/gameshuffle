import "server-only";

/**
 * Showcase card art for the Pokémon randomizers: the curated card per species
 * (src/data/pokemon/showcase-cards.ts) read from tcg_cards. A read-only SELECT,
 * 0 Scrydex credits; species without a populated card are left out, and their
 * cards fall back to the type card. Medium images only (Scrydex terms).
 */

import { SHOWCASE_CARDS } from "@/data/pokemon/showcase-cards";
import { getCatalogCards } from "@/lib/scrydex/catalog";
import type { ShowcaseArt } from "@/components/pokemon/TypeCard";

export async function getShowcaseArt(dexes?: number[]): Promise<Record<number, ShowcaseArt>> {
  const wanted = (dexes ?? Object.keys(SHOWCASE_CARDS).map(Number)).filter((d) => SHOWCASE_CARDS[d]);
  if (!wanted.length) return {};
  const cards = await getCatalogCards(wanted.map((d) => SHOWCASE_CARDS[d])).catch(() => []);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: Record<number, ShowcaseArt> = {};
  for (const d of wanted) {
    const c = byId.get(SHOWCASE_CARDS[d]);
    const src = c?.images?.medium ?? c?.images?.small;
    if (c && src) out[d] = { src, card: c.name, set: c.expansion_name ?? null, number: c.number ?? null, rarity: c.rarity ?? null, fullArt: /illustration|art rare|gallery|character/i.test(c.rarity ?? "") };
  }
  return out;
}
