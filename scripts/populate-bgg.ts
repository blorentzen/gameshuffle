/**
 * Operator populate: seed `bgg_games` with popular board games so the
 * board-game-night game picker has art + details WITHOUT a live BGG call at
 * request time. BGG blocks datacenter IPs (Cloudflare 401), so prod reads only
 * this table — this script fills it.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-bgg.ts
 *
 * Run from an environment BGG actually answers (a residential IP — most likely
 * your local machine, NOT a cloud box). Re-runnable; upserts. Widen coverage by
 * extending POPULAR below. If BGG blocks even your local network, this exits
 * with a note and we fall back to a curated static seed instead.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { bggHot, bggSearch } from "../src/lib/bgg/client";
import { getBoardGames } from "../src/lib/bgg/catalog";

/** Evergreen popular titles, so coverage isn't just whatever's "hot" today. */
const POPULAR = [
  "Catan", "Ticket to Ride", "Carcassonne", "Pandemic", "7 Wonders", "Azul",
  "Wingspan", "Codenames", "Dominion", "Splendor", "Terraforming Mars",
  "Gloomhaven", "Root", "Scythe", "Everdell", "Cascadia", "Spirit Island",
  "Brass: Birmingham", "Dixit", "The Crew", "Ark Nova", "Lost Ruins of Arnak",
  "Sushi Go!", "Kingdomino", "Patchwork", "Love Letter", "Blood Rage",
  "Twilight Imperium", "Betrayal at House on the Hill", "Camel Up", "Clank!",
  "King of Tokyo", "Concordia", "Coup", "Exploding Kittens", "Photosynthesis",
  "Wavelength", "Just One", "Ticket to Ride: Europe", "Pandemic Legacy",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ids = new Set<number>();

  try {
    const hot = await bggHot();
    for (const h of hot) ids.add(h.id);
    console.log(`hot list: +${hot.length}`);
  } catch (e) {
    console.warn("hot list failed (BGG may be blocking this network):", (e as Error).message);
  }

  for (const name of POPULAR) {
    try {
      const hits = await bggSearch(name);
      const hit = hits.find((h) => h.name.toLowerCase() === name.toLowerCase()) ?? hits[0];
      if (hit) ids.add(hit.id);
      await sleep(1500); // be polite to BGG's rate limits
    } catch (e) {
      console.warn(`search "${name}" failed:`, (e as Error).message);
    }
  }

  if (ids.size === 0) {
    console.error(
      "\nNo game ids collected — BGG is blocking this network too.\n" +
        "Run from a residential IP, or tell me and we'll seed a curated static dataset instead.",
    );
    process.exit(1);
  }

  console.log(`\nFetching + caching details for ${ids.size} games…`);
  const rows = await getBoardGames([...ids]); // batched /thing fetch + upsert
  console.log(`\n✓ Seeded ${rows.length} games into bgg_games.`);
  console.log("The game picker will now show these with art + details.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
