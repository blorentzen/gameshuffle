/**
 * Discover Scrydex ids for the shop's featured high-value cards.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/discover-shop-cards.ts
 *
 * Searches each card by a distinctive term (Scrydex name: is a contains match)
 * and prints candidates so we can match by number + set. Curated, demand-driven.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { searchCards } from "../src/lib/scrydex/ingest";

// term → the number we're looking for (to highlight the match)
const TARGETS: { term: string; want: string; note: string }[] = [
  { term: "Greninja", want: "116", note: "Mega Greninja ex 116/086 (ME04 Chaos Rising)" },
  { term: "Umbreon", want: "161", note: "Umbreon Master Ball Pattern (Prismatic Evolutions)" },
  { term: "Timburr", want: "125", note: "Timburr 125/086 (SV Black Bolt)" },
  { term: "Weezing", want: "199", note: "Team Rocket's Weezing 199/182 (sv10 Destined Rivals)" },
  { term: "Primarina", want: "088", note: "Primarina 088/084 (ME05 Pitch Black)" },
  { term: "Starmie", want: "102", note: "Mega Starmie ex 102/088 (ME03 Perfect Order)" },
  { term: "Togekiss", want: "235", note: "Togekiss 235/217 (ME Ascended Heroes)" },
  { term: "Scrafty", want: "270", note: "Mega Scrafty ex 270/217 (ME Ascended Heroes)" },
];

async function main() {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.note}  (search "${t.term}", want #${t.want}) ===`);
    try {
      const cards = await searchCards(t.term);
      const matches = cards.filter(
        (c) => (c.number ?? "").replace(/^0+/, "") === t.want.replace(/^0+/, ""),
      );
      const show = matches.length ? matches : cards.slice(0, 12);
      if (!matches.length) console.log("  (no exact number match — showing candidates)");
      for (const c of show) {
        const hit = (c.number ?? "").replace(/^0+/, "") === t.want.replace(/^0+/, "") ? " <== MATCH" : "";
        console.log(`  ${c.id}  | ${c.name}  | #${c.number ?? "?"} (${c.expansion_id ?? "?"})  | ${c.rarity ?? "?"}${hit}`);
      }
    } catch (err) {
      console.error("  ERROR:", (err as Error).message);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
