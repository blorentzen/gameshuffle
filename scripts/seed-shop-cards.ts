/**
 * Seed the storefront's featured high-value cards.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/seed-shop-cards.ts
 *
 * Requires the `featured-shop-cards-m1.sql` migration to be applied first.
 * Idempotent: skips any card_id already present. Resolves each card's Scrydex
 * catalog row (demand-driven), then inserts the featured row with its
 * TCGplayer product link.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createServiceClient } from "../src/lib/supabase/admin";
import { resolveCard } from "../src/lib/scrydex/ingest";

const SEED: {
  cardId: string;
  label?: string;
  variantName?: string;
  productUrl: string;
}[] = [
  {
    cardId: "me4-116",
    label: "Mega Greninja ex",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/693517/mega-greninja-ex---116086",
  },
  {
    cardId: "sv8pt5-161",
    label: "Umbreon (Master Ball Pattern)",
    variantName: "Master Ball Pattern",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/610679/umbreon-master-ball-pattern",
  },
  {
    cardId: "zsv10pt5-125",
    label: "Timburr",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/642580/timburr---125086",
  },
  {
    cardId: "sv10-199",
    label: "Team Rocket's Weezing",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/632999/team-rockets-weezing---199182",
  },
  {
    cardId: "me5-88",
    label: "Primarina",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/704845/primarina---088084",
  },
  {
    cardId: "me3-102",
    label: "Mega Starmie ex",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/684361/mega-starmie-ex---102088",
  },
  {
    cardId: "me2pt5-235",
    label: "Togekiss",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/676047/togekiss---235217",
  },
  {
    cardId: "me2pt5-270",
    label: "Mega Scrafty ex",
    productUrl:
      "https://www.tcgplayer.com/sellers/GameShuffle-TCG/f28a38a9/product/676082/mega-scrafty-ex---270217",
  },
];

async function main() {
  const svc = createServiceClient();
  let order = 0;
  let added = 0;
  let skipped = 0;

  for (const item of SEED) {
    const { data: existing } = await svc
      .from("gs_featured_shop_cards")
      .select("id")
      .eq("card_id", item.cardId)
      .maybeSingle();
    if (existing) {
      console.log(`  = ${item.cardId}  already present, skipping`);
      skipped++;
      order++;
      continue;
    }

    const card = await resolveCard(item.cardId);
    if (!card) {
      console.log(`  ✗ ${item.cardId}  NOT FOUND — skipping`);
      continue;
    }

    const { error } = await svc.from("gs_featured_shop_cards").insert({
      card_id: item.cardId,
      variant_name: item.variantName ?? null,
      label: item.label ?? null,
      product_url: item.productUrl,
      sort_order: order,
    });
    if (error) {
      console.log(`  ✗ ${item.cardId}  ERROR: ${error.message}`);
    } else {
      console.log(`  ✓ ${item.cardId}  | ${card.name}  (order ${order})`);
      added++;
      order++;
    }
  }
  console.log(`\nDone. ${added} added, ${skipped} already present.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
