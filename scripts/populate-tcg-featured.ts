/**
 * Operator populate: warm the curated marquee card ids into `tcg_cards` so the
 * public promotional surfaces can read them (read-only, 0 credits at render).
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-tcg-featured.ts
 *
 * This is a REAL, authorized request over a small curated set tied to a deck
 * we feature — NOT a bulk/expansion pull. It force-fetches (1 credit each) so
 * it also corrects any rows cached before the image-normalization fix, and
 * prints each card for verification against the deck list.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { forceResolveCard } from "../src/lib/scrydex/ingest";
import { ALL_FEATURED_CARD_IDS } from "../src/data/tcg-featured";

async function main() {
  console.log(`Populating ${ALL_FEATURED_CARD_IDS.length} curated card(s)…\n`);
  let ok = 0;
  let missing = 0;
  for (const id of ALL_FEATURED_CARD_IDS) {
    try {
      const card = await forceResolveCard(id);
      if (!card) {
        console.log(`  ✗ ${id}  — NOT FOUND (check the id / set code)`);
        missing++;
        continue;
      }
      const img = card.images?.small ? "img✓" : "img✗";
      console.log(
        `  ✓ ${id}  | ${card.name}  | ${card.rarity ?? "?"}  | #${card.number ?? "?"}  | ${img}`,
      );
      ok++;
    } catch (err) {
      console.error(`  ✗ ${id}  — ERROR:`, (err as Error).message);
      missing++;
    }
  }
  console.log(`\nDone. ${ok} populated, ${missing} missing/errored.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
