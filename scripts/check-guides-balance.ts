/**
 * Guard the guides catalog against becoming a Mario Kart site.
 *
 * GameShuffle's highest-authority pages already lean one game: two randomizers,
 * a competitive hub, a dedicated tournaments page. If the guides cluster leaned
 * the same way it would confirm to a search engine that this is a Mario Kart
 * site rather than a game-night platform that happens to be very good at Mario
 * Kart, and that is a hard thing to unwind once it sticks.
 *
 * So: at most a third of planned guides may be tied to a single game, and the
 * game-agnostic hosting cluster has to stay the largest. Run it in CI or by
 * hand after editing the manifest.
 *
 *   npm run guides:balance
 */

import { GUIDES, GUIDE_CLUSTERS, gameSpecificShare } from "../src/lib/guides/manifest";

const MAX_GAME_SPECIFIC_PCT = 33;

const balance = gameSpecificShare();
const byCluster = new Map<string, number>();
for (const g of GUIDES) byCluster.set(g.cluster, (byCluster.get(g.cluster) ?? 0) + 1);

const rows = GUIDE_CLUSTERS.map((c) => ({ id: c.id, label: c.label, n: byCluster.get(c.id) ?? 0 }));
const biggest = rows.reduce((a, b) => (b.n > a.n ? b : a));

console.log(`guides planned      ${balance.total}`);
console.log(`tied to one game    ${balance.specific} (${balance.pct}%, ceiling ${MAX_GAME_SPECIFIC_PCT}%)`);
for (const r of rows) console.log(`  ${String(r.n).padStart(2)}  ${r.label}`);

const problems: string[] = [];
if (balance.pct > MAX_GAME_SPECIFIC_PCT) {
  problems.push(`${balance.pct}% of guides are tied to one game, over the ${MAX_GAME_SPECIFIC_PCT}% ceiling. Add game-agnostic guides rather than removing the game-specific ones.`);
}
if (biggest.id !== "hosting") {
  problems.push(`"${biggest.label}" is the largest cluster. The game-agnostic hosting cluster should lead, because it is the one that ranks for intent nobody associates with a single game.`);
}

const perGame = new Map<string, number>();
for (const g of GUIDES) if (g.gameSpecific) perGame.set(g.gameSpecific, (perGame.get(g.gameSpecific) ?? 0) + 1);
for (const [game, n] of perGame) {
  const pct = Math.round((n / GUIDES.length) * 100);
  if (pct > MAX_GAME_SPECIFIC_PCT) problems.push(`${game} alone accounts for ${pct}% of the catalog.`);
}

if (problems.length) {
  console.error("\nOut of balance:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nBalanced.");
