/**
 * Operator populate: one showcase TCG card per Pokémon the randomizers can
 * show (Pokémon Stadium rentals + the FireRed/LeafGreen run), so their cards
 * can show real card art read from `tcg_cards` at render (0 credits).
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-pokemon-showcase.ts           # plan only, no calls
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-pokemon-showcase.ts --run     # spend credits
 *   ... --run --limit 10        first 10 species still missing a card
 *   ... --run --only 1,4,7      just these dex numbers (re-pick)
 *   ... --local                 only illustration rares already in tcg_cards (0 credits)
 *   ... --warm                  load the picked cards into THIS database's tcg_cards
 *                               (1 credit per missing card; for production after dev picks)
 *
 * A curated, operator-run request over a fixed list tied to a feature we ship
 * (like the deck marquees), never an expansion pull. Cards already in tcg_cards
 * are used first (0 credits). Otherwise per species: 1 credit for
 * the best English Special Illustration / Illustration Rare; if there is none,
 * 1 more for any English printing (prefers the 151 set for Gen 1, else holos,
 * newest first). Writes the picks to src/data/pokemon/showcase-cards.ts and
 * keeps existing picks unless --only names them.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { searchCardsByQuery, type NormalizedCard } from "../src/lib/scrydex/client";
import { persistSearchResults, resolveCard } from "../src/lib/scrydex/ingest";
import { createServiceClient } from "../src/lib/supabase/admin";
import type { TcgCard } from "../src/lib/scrydex/types";

const OUT = "src/data/pokemon/showcase-cards.ts";

type Species = { dex: number; name: string };

function speciesList(): Species[] {
  const names = new Map<number, Map<string, number>>();
  const add = (dex: number, name: string) => {
    const m = names.get(dex) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    names.set(dex, m);
  };
  const stadium = JSON.parse(readFileSync("src/data/pokemon/stadium.json", "utf8")) as { games: { cups: { rentals: { dex: number; name: string }[] }[] }[] };
  for (const g of stadium.games) for (const c of g.cups) for (const r of c.rentals) add(r.dex, r.name);
  const frlg = JSON.parse(readFileSync("src/data/pokemon/frlg-run.json", "utf8")) as { segments: { areas: { encounters: { dex: number; name: string }[] }[] }[] };
  for (const s of frlg.segments) for (const a of s.areas) for (const e of a.encounters) add(e.dex, e.name);
  for (const [dex, name] of [[1, "Bulbasaur"], [4, "Charmander"], [7, "Squirtle"]] as const) add(dex, name);
  // The species' usual name: the most common spelling (rentals like "Surfing Pikachu" lose to "Pikachu").
  return [...names.entries()].sort((a, b) => a[0] - b[0])
    .map(([dex, m]) => ({ dex, name: [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0] }));
}

function existing(): Record<number, string> {
  if (!existsSync(OUT)) return {};
  const src = readFileSync(OUT, "utf8");
  return Object.fromEntries([...src.matchAll(/^\s*(\d+): "([^"]+)",/gm)].map((m) => [Number(m[1]), m[2]]));
}

const english = (n: NormalizedCard) => /^en/i.test(n.card.language_code ?? "") && !n.card.id.startsWith("tcgp");
const named = (n: NormalizedCard, s: string) => n.card.name === s || n.card.name === `${s} ex`;
const TOP = ["Special Illustration Rare", "Illustration Rare"];
function rank(n: NormalizedCard): number {
  const r = n.card.rarity ?? "";
  const top = TOP.indexOf(r);
  if (top >= 0) return top;
  if (/holo/i.test(r)) return 3;
  if (/^rare/i.test(r)) return 4;
  return 5;
}
function best(cards: NormalizedCard[], s: Species): NormalizedCard | null {
  const pool = cards.filter((n) => english(n) && named(n, s.name) && (n.card.images?.medium || n.card.images?.small));
  if (!pool.length) return null;
  return pool.sort((a, b) =>
    rank(a) - rank(b)
    // Gen 1: the 151 set's art is the most consistent set for these.
    || Number(b.card.expansion_id === "sv3pt5" && s.dex <= 151) - Number(a.card.expansion_id === "sv3pt5" && s.dex <= 151)
    || (b.card.expansion_sort_order ?? 0) - (a.card.expansion_sort_order ?? 0))[0];
}

/** Cards for this species already in tcg_cards, shaped like search results. */
async function localCards(s: Species): Promise<NormalizedCard[]> {
  const { data } = await createServiceClient().from("tcg_cards").select("*").in("name", [s.name, `${s.name} ex`]).limit(200);
  return ((data ?? []) as TcgCard[]).map((card) => ({ card, expansion: null }));
}

async function warm(picks: Record<number, string>) {
  const ids = Object.values(picks);
  const { data } = await createServiceClient().from("tcg_cards").select("id").in("id", ids);
  const have = new Set((data ?? []).map((r) => (r as { id: string }).id));
  const missing = ids.filter((id) => !have.has(id));
  console.log(`${ids.length} picked · ${missing.length} missing here (about ${missing.length} credits)`);
  if (!process.argv.includes("--run")) { console.log("Plan only. Add --run to spend credits."); return; }
  for (const id of missing) console.log(`  ${id} → ${(await resolveCard(id))?.name ?? "not found"}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--warm")) return warm(existing());
  const localOnly = args.includes("--local");
  const run = args.includes("--run") || localOnly;
  const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity;
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",").map(Number)) : null;
  const picks = existing();
  const all = speciesList();
  const todo = all.filter((s) => (only ? only.has(s.dex) : !picks[s.dex])).slice(0, limit);
  console.log(`${all.length} species · ${Object.keys(picks).length} already picked · ${todo.length} to look up (at most ${todo.length * 2} credits; cards already stored cost nothing)`);
  if (!run) { console.log("Plan only. Add --run to spend credits, or --local for stored cards only."); return; }

  let credits = 0;
  for (const s of todo) {
    const q = s.name.replace(/"/g, '\\"');
    // Stored cards first: an illustration rare we already have costs nothing.
    const local = await localCards(s);
    let pick = best(local, s);
    let stored = !!pick && rank(pick) < TOP.length;
    if (!stored && !localOnly) {
      const found = await searchCardsByQuery(`name:"${q}" (rarity:"${TOP[0]}" OR rarity:"${TOP[1]}")`, "operator: randomizer showcase card", 25);
      credits++;
      const top = best(found, s);
      if (top) { pick = top; stored = false; } else if (pick) stored = true;
    }
    if (!pick && !localOnly) {
      const found = await searchCardsByQuery(`name:"${q}"`, "operator: randomizer showcase fallback", 25);
      credits++;
      pick = best(found, s);
    } else if (pick && !stored && rank(pick) >= TOP.length) stored = true;
    // --local only takes illustration rares and up, so a later --run can still upgrade the rest.
    if (localOnly && pick && rank(pick) >= TOP.length) pick = null;
    if (!pick) { if (!localOnly) console.log(`  #${s.dex} ${s.name}: no English card found`); continue; }
    if (!local.some((n) => n.card.id === pick!.card.id)) await persistSearchResults([pick]);
    picks[s.dex] = pick.card.id;
    console.log(`  #${s.dex} ${s.name} → ${pick.card.id} [${pick.card.rarity}] ${pick.expansion?.name ?? ""}`);
  }

  const body = Object.keys(picks).map(Number).sort((a, b) => a - b).map((d) => `  ${d}: "${picks[d]}",`).join("\n");
  writeFileSync(OUT, `/**
 * One showcase TCG card per Pokémon (dex → Scrydex card id), picked by
 * scripts/populate-pokemon-showcase.ts: the best English Special Illustration /
 * Illustration Rare, else another English printing. The cards live in
 * tcg_cards; pages read them with getCatalogCards (0 credits). Generated: edit
 * by re-running the script with --only.
 */
export const SHOWCASE_CARDS: Record<number, string> = {
${body}
};
`);
  console.log(`\nDone: ${credits} credits, ${Object.keys(picks).length} species with a card. Wrote ${OUT}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
