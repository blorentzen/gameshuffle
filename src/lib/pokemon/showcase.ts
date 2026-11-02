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

/**
 * Kept on this server for an hour: every page is rendered per request (the root layout reads
 * cookies), so the pages' `revalidate` didn't cache this and each view of the Pokémon randomizers
 * read ~315 card rows. The picks only change when the populate script runs.
 */
const artCache = new Map<string, { at: number; art: Record<number, ShowcaseArt> }>();
const ART_MS = 3_600_000;

export async function getShowcaseArt(dexes?: number[]): Promise<Record<number, ShowcaseArt>> {
  const key = dexes ? [...dexes].sort((a, b) => a - b).join(",") : "all";
  const hit = artCache.get(key);
  if (hit && Date.now() - hit.at < ART_MS) return hit.art;
  const art = await loadShowcaseArt(dexes);
  // An empty answer (a database hiccup) isn't kept, so the next view tries again.
  if (Object.keys(art).length) {
    if (artCache.size > 500) artCache.clear();
    artCache.set(key, { at: Date.now(), art });
  }
  return art;
}

async function loadShowcaseArt(dexes?: number[]): Promise<Record<number, ShowcaseArt>> {
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
