/**
 * Scrydex integration smoke test + card discovery.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-scrydex-resolve.ts
 *
 * Searches for a few Team Rocket (Mewtwo ex) deck cards through the real
 * pipeline (search-cache → local trigram → Scrydex API), then persists them
 * into tcg_cards. Prints the real card id / expansion / number / rarity /
 * image URLs so we can (a) confirm keys + wrapper work, (b) learn the real
 * image host for CSP, (c) verify the deck's flagged set numbers.
 *
 * Demand-driven, curated set — NOT a bulk/expansion pull.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { searchCards } from "../src/lib/scrydex/ingest";

const TERMS = ["Wobbuffet"]; // fresh term (uncached) to verify the image fix

async function main() {
  for (const term of TERMS) {
    console.log(`\n=== search: "${term}" ===`);
    try {
      const cards = await searchCards(term);
      console.log(`  ${cards.length} result(s)`);
      for (const c of cards.slice(0, 8)) {
        const img = c.images?.small ?? c.images?.medium ?? "(no image)";
        console.log(
          `  • ${c.id}  | ${c.name}  | ${c.rarity ?? "?"}  | #${c.number ?? "?"} (${c.expansion_id ?? "?"})`,
        );
        console.log(`      img: ${img}`);
      }
    } catch (err) {
      console.error(`  ERROR:`, (err as Error).message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
