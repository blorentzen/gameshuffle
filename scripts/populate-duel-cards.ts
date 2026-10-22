/**
 * Operator populate for Daily Duel: one real card per Pokémon on each trainer's team, plus the few
 * species the player pool needs that the catalog doesn't have yet.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/populate-duel-cards.ts              # plan only, no calls
 *   ... --run                       pick every team slot still without a card
 *   ... --run --fill                also store prints for the pool's growth (POOL_FILL), then run --pool
 *   ... --run --only cynthia-platinum,misty-heartgold      re-pick these trainers
 *   ... --run --max 120             stop before spending more than 120 credits (default 400)
 *   ... --pool                      pick the player pool from cards already stored (0 credits) and
 *                                   write src/data/originals/duel/pool.ts. Append only: ids already
 *                                   in DUEL_POOL stay where they are.
 *   ... --trainers [--run] [--max 180]   store each trainer's own Supporter card for their picture
 *                                   (src/data/originals/duel/trainer-cards.ts): fetched by its id,
 *                                   1 credit per card not stored yet; a miss searches its name (1 more)
 *   ... --clean [--run] [--max 60]  re-pick every team slot and pool card whose print has an attack
 *                                   the duel can't play (cardRules cleanAttacks) with a clean print of
 *                                   the same Pokémon: stored cards first (0 credits), else one search
 *                                   each. Pinned slots are reported, not changed; a pool card with no
 *                                   clean print anywhere leaves the pool. Built days keep their own
 *                                   copy of their cards, so only days not built yet change.
 *   ... --warm [--run]              load every card the game uses (team picks, DUEL_POOL and the
 *                                   trainers' picture cards) into THIS database's tcg_cards: 1 credit
 *                                   per missing card. For production after the picks are made on dev.
 *
 * A curated, operator-run request over fixed lists tied to a feature we ship (the trainer roster in
 * src/data/originals/duel/trainers.ts and POOL_FILL below), never an expansion pull. Per team slot:
 * cards already in tcg_cards are used first (0 credits); a trainer with their own cards ("Misty's
 * Starmie") gets one search for them (1 credit); a species with no usable English card stored gets
 * one search (1 credit). A card already in the player pool (DUEL_POOL, append only) is never picked for
 * a team, so a pack can't deal a trainer's own card. Only the picked card is stored. Picks go to
 * src/data/originals/duel/team-picks.generated.ts and are kept on reruns unless --only names the
 * trainer, because a day that already used a trainer must keep showing the same cards.
 * Then run scripts/build-duel-cards.ts to write the card facts.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { searchCardsByQuery, type NormalizedCard } from "../src/lib/scrydex/client";
import { forceResolveCard, persistSearchResults, resolveCard } from "../src/lib/scrydex/ingest";
import { createServiceClient } from "../src/lib/supabase/admin";
import { DUEL_TRAINER_PLANS, type DuelTrainerPlan } from "../src/data/originals/duel/trainers";
import { DUEL_POOL } from "../src/data/originals/duel/pool";
import { DUEL_TRAINER_CARDS } from "../src/data/originals/duel/trainer-cards";
import { cleanAttacks, duelReady, isRuleBox, OWNER_PREFIX, type DuelCatalogRow } from "../src/data/originals/duel/cardRules";
import type { DuelCard, EnergyType } from "../src/lib/originals/duel/types";

const PICKS_OUT = "src/data/originals/duel/team-picks.generated.ts";
/** The player pool: never a team pick (scripts/test-duel-data.ts checks no pool card is on a team). */
const POOL = new Set(DUEL_POOL);
const WHY = "operator: daily duel trainer card";

/**
 * Species the player pool wanted more of when it was built (2026-10-21): Metal, Darkness and Dragon
 * ran thin once the pool takes one print per species and leaves out every card on a trainer's team.
 * One search each, skipped when a print of that type is already stored that no team uses; the best
 * English non-ex print of that type that no team uses is stored.
 */
type Fill = { species: string; t: EnergyType; ex?: boolean };
const fills = (t: EnergyType, names: string[], ex = false): Fill[] => names.map((species) => ({ species, t, ...(ex ? { ex } : {}) }));

/** The first pool fill (kept for the record; `--fill` now runs POOL_FILL below). */
export const POOL_FILL_PASS1: Fill[] = [
  ...fills("Metal", ["Copperajah", "Corviknight", "Klinklang", "Bronzong", "Excadrill", "Aggron", "Scizor", "Steelix",
    "Magnezone", "Metagross", "Kingambit", "Duraludon", "Orthworm", "Skarmory", "Bisharp",
    "Gholdengo", "Archaludon", "Revavroom", "Ferrothorn", "Durant", "Cobalion", "Registeel", "Jirachi",
    "Dialga", "Heatran", "Bastiodon", "Melmetal", "Doublade", "Lairon", "Metang"]),
  ...fills("Darkness", ["Tyranitar", "Weavile", "Honchkrow", "Darkrai", "Yveltal", "Pangoro", "Malamar",
    "Thievul", "Grafaiai", "Lokix", "Bombirdier", "Roaring Moon", "Zarude", "Brute Bonnet"]),
  ...fills("Dragon", ["Noivern", "Goodra", "Dragalge", "Turtonator", "Drampa", "Kommo-o", "Appletun", "Regidrago",
    "Raging Bolt", "Tatsugiri", "Cyclizar", "Druddigon", "Latias", "Latios", "Hydreigon",
    "Garchomp", "Salamence", "Flygon", "Kyurem", "Zygarde", "Altaria",
    "Reshiram", "Zekrom", "Palkia", "Zweilous", "Sliggoo", "Hakamo-o", "Drakloak", "Fraxure", "Gabite"]),
];

/**
 * The pool's growth to about 450 (roster round pass 2, 2026-10-21): species not in the pool yet, by
 * the type their modern cards play as, mostly middle and big cards so every HP band fills; the `ex`
 * ones store an "ex" print instead (the pool keeps about 16% ex). A species already in the pool is
 * skipped without a search, so is one with a usable print of that kind stored already. Searched with
 * nothing usable on 2026-10-21, so left out: Iron Moth ex, Flutter Mane ex, Overqwil, Ting-Lu ex,
 * Celesteela, Giratina, Tyrantrum, Black Kyurem ex, Dragonite ex, Bloodmoon Ursaluna ex.
 */
const POOL_FILL: Fill[] = [
  ...fills("Fire", ["Arcanine", "Ninetales", "Rapidash", "Houndoom", "Infernape", "Blaziken", "Typhlosion", "Camerupt",
    "Torkoal", "Volcarona", "Emboar", "Talonflame", "Incineroar", "Cinderace", "Centiskorch", "Skeledirge",
    "Magmortar", "Darmanitan", "Victini", "Heatmor", "Litleo"]),
  ...fills("Fire", ["Chi-Yu"], true),
  ...fills("Lightning", ["Raichu", "Electivire", "Eelektross", "Zebstrika", "Emolga", "Galvantula", "Vikavolt", "Toxtricity",
    "Pawmot", "Pachirisu", "Dedenne", "Togedemaru", "Rotom", "Thundurus", "Magneton", "Boltund", "Stunfisk",
    "Tapu Koko", "Regieleki", "Plusle", "Minun"]),
  ...fills("Lightning", ["Miraidon"], true),
  ...fills("Psychic", ["Gardevoir", "Gallade", "Mismagius", "Gengar", "Banette", "Dusknoir", "Reuniclus", "Gothitelle",
    "Musharna", "Sigilyph", "Hatterene", "Mimikyu", "Tinkaton", "Espathra", "Slowking", "Jynx", "Mr. Mime",
    "Golurk", "Drifblim"]),
  ...fills("Fighting", ["Hariyama", "Conkeldurr", "Mienshao", "Throh", "Sawk", "Passimian", "Crabominable", "Falinks",
    "Grapploct", "Annihilape", "Donphan", "Rhyperior", "Garganacl", "Lycanroc", "Mudsdale", "Hippowdon",
    "Regirock", "Rampardos"]),
  ...fills("Fighting", ["Great Tusk", "Koraidon"], true),
  ...fills("Darkness", ["Absol", "Sharpedo", "Krookodile", "Liepard", "Zoroark", "Mightyena", "Spiritomb", "Sableye",
    "Crawdaunt", "Cacturne", "Shiftry", "Skuntank", "Mandibuzz", "Mabosstiff", "Galarian Obstagoon", "Hoopa",
    "Arbok", "Seviper"]),
  ...fills("Darkness", ["Okidogi"], true),
  ...fills("Metal", ["Aegislash", "Empoleon", "Probopass", "Galarian Perrserker", "Magearna", "Solgaleo",
    "Escavalier", "Genesect", "Bronzor", "Beldum", "Klang"]),
  ...fills("Metal", ["Iron Treads", "Copperajah"], true),
  ...fills("Dragon", ["Haxorus", "Axew", "Deino", "Noibat", "Dreepy", "Flapple", "Dratini", "Bagon", "Shelgon", "Gible",
    "Jangmo-o", "Goomy", "Vibrava", "Kingdra"]),
  ...fills("Dragon", ["Dragapult"], true),
  ...fills("Grass", ["Decidueye", "Sceptile", "Leafeon", "Lilligant", "Exeggutor", "Roserade"]),
  ...fills("Grass", ["Iron Leaves", "Teal Mask Ogerpon"], true),
  ...fills("Water", ["Gyarados", "Milotic", "Swampert", "Samurott", "Palafin", "Clawitzer"]),
  ...fills("Water", ["Chien-Pao"], true),
  ...fills("Colorless", ["Staraptor", "Braviary", "Unfezant", "Swellow", "Tauros", "Bouffalant", "Zangoose", "Persian",
    "Lopunny", "Slaking", "Exploud", "Cinccino", "Stoutland", "Greedent", "Oinkologne", "Porygon-Z", "Regigigas"]),
  ...fills("Colorless", ["Pidgeot", "Dudunsparce"], true),
  // A second round of ex prints for the types with room left under the ex share.
  ...fills("Fire", ["Ceruledge", "Gouging Fire"], true),
  ...fills("Psychic", ["Gardevoir"], true),
  ...fills("Darkness", ["Mabosstiff", "Pecharunt"], true),
  ...fills("Metal", ["Orthworm"], true),
  ...fills("Dragon", ["Raging Bolt", "Noivern"], true),
  ...fills("Grass", ["Meowscarada"], true),
  ...fills("Psychic", ["Iron Valiant"], true),
  ...fills("Fighting", ["Iron Boulder"], true),
  ...fills("Darkness", ["Absol"], true),
  ...fills("Metal", ["Registeel"], true),
  ...fills("Colorless", ["Lugia", "Bouffalant"], true),
];

/**
 * The pool's shape: cards per type (Fairy counts as Psychic), at most this share of ex/V/Mega cards.
 * Grown from 294 to 450 in the roster round's pass 2 (2026-10-21), the ex cap from 18% to 17% (each
 * type's share counts the ex cards it already has), which lands the pool at about 16% ex.
 */
const POOL_TYPES: Record<EnergyType, number> = {
  Grass: 48, Fire: 44, Water: 50, Lightning: 44, Psychic: 48, Fighting: 48, Darkness: 42, Metal: 40, Dragon: 38, Colorless: 48,
};
const POOL_EX_SHARE = 0.17;
const POOL_OUT = "src/data/originals/duel/pool.ts";

type Row = DuelCatalogRow & { rarity: string | null; expansion_id: string | null; release: string | null };

const norm = (x: string) => x.replace(/[’‘]/g, "'").replace(/\s+(?=[♀♂])/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const quoteSafe = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s*[♀♂]/g, "").replace(/"/g, '\\"');

/** Exact name, its ex print, or the trainer's own print of it (which may be a V: "Lance's Charizard V"). */
function nameFits(row: Row, species: string, owner?: string): "own" | "plain" | null {
  const n = norm(row.name);
  const s = norm(species);
  if (owner && ["", " ex", " v", " gx", " vmax", " vstar"].some((x) => n === norm(`${owner}'s ${species}`) + x)) return "own";
  if (n === s || n === `${s} ex`) return "plain";
  return null;
}

const TOP = ["Special Illustration Rare", "Illustration Rare"];
function rarityRank(r: string | null): number {
  const x = r ?? "";
  if (TOP.includes(x)) return 0;
  if (/ultra|hyper|secret|rainbow|shiny|amazing|radiant|ace spec/i.test(x)) return 1;
  if (/holo|double rare|promo/i.test(x)) return 2;
  if (/^rare/i.test(x)) return 3;
  return 4;
}

/** Lower is better. Gym leaders and the Elite Four lean away from ex cards (their days are the easy ones). */
function score(row: Row, fit: "own" | "plain", plan: DuelTrainerPlan, slot: number, used: Set<string>): number {
  // A print whose every attack plays comes first (a clean own card, then any clean print); then the
  // trainer's own card; among those, nicer prints first.
  let s = (cleanAttacks(row) ? 0 : 30) + (fit === "own" ? 0 : 10) + rarityRank(row.rarity) * 2;
  const ace = slot === plan.species.length - 1;
  if (fit !== "own" && isRuleBox(row.subtypes, row.name)) {
    if (plan.tier === "gym") s += 12;
    else if (plan.tier === "elite" && !ace) s += 8;
  }
  if (used.has(row.id)) s += 3; // the same print on another team is fine, a different one is nicer
  return s;
}

const fromSearch = (n: NormalizedCard): Row => ({ ...n.card, release: n.expansion?.release_date ?? null });

function existingPicks(): Record<string, string[]> {
  if (!existsSync(PICKS_OUT)) return {};
  const src = readFileSync(PICKS_OUT, "utf8");
  return Object.fromEntries([...src.matchAll(/^\s*"([^"]+)": \[([^\]]*)\],/gm)].map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]));
}

function writePicks(picks: Record<string, string[]>) {
  const order = DUEL_TRAINER_PLANS.map((p) => p.id).filter((id) => picks[id]);
  const body = order.map((id) => `  "${id}": [${picks[id].map((c) => `"${c}"`).join(", ")}],`).join("\n");
  writeFileSync(PICKS_OUT, `/**
 * Daily Duel: the card for each Pokémon on each trainer's team (trainer id → card ids in team order),
 * picked by scripts/populate-duel-cards.ts: the trainer's own card when one exists ("Misty's
 * Starmie"), else an illustration rare or other good-looking English print that can hit for 4 Energy
 * or less. Generated: picks are kept on reruns; re-pick a trainer with --only. Never change a pick a
 * past day has used.
 */
export const DUEL_TEAM_PICKS: Record<string, string[]> = {
${body}
};
`);
}

async function loadLocal(): Promise<Row[]> {
  const svc = createServiceClient();
  const { data: exps } = await svc.from("tcg_expansions").select("id, release_date");
  const release = new Map(((exps ?? []) as { id: string; release_date: string | null }[]).map((e) => [e.id, e.release_date]));
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from("tcg_cards")
      .select("id, name, supertype, subtypes, types, hp, attacks, weaknesses, rarity, language_code, images, expansion_id")
      .ilike("supertype", "pok%").order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as Omit<Row, "release">[]) rows.push({ ...r, release: release.get(r.expansion_id ?? "") ?? null });
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** The trainers' own Supporter cards, for their pictures. */
const trainerCardIds = () => [...new Set(Object.values(DUEL_TRAINER_CARDS).flatMap((p) => (p.card ? [p.card] : [])))];

async function warm() {
  const { DUEL_TEAM_PICKS } = await import("../src/data/originals/duel/team-picks.generated");
  const ids = [...new Set([...Object.values(DUEL_TEAM_PICKS).flat(), ...DUEL_POOL, ...trainerCardIds()])];
  const svc = createServiceClient();
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await svc.from("tcg_cards").select("id").in("id", ids.slice(i, i + 200));
    for (const r of data ?? []) have.add((r as { id: string }).id);
  }
  const missing = ids.filter((id) => !have.has(id));
  console.log(`${ids.length} cards in the game · ${missing.length} missing here (about ${missing.length} credits)`);
  if (!process.argv.includes("--run")) { console.log("Plan only. Add --run to spend credits."); return; }
  let found = 0;
  for (const id of missing) {
    const card = await resolveCard(id);
    if (card) found++;
    console.log(`  ${id} → ${card?.name ?? "NOT FOUND"}`);
  }
  console.log(`\nDone: ${missing.length} credits, ${found} stored.`);
}

/**
 * The trainers' picture cards (trainer-cards.ts) into this database's tcg_cards: each one not stored
 * yet (or stored without its picture) is fetched by its id, 1 credit; an id Scrydex doesn't know
 * searches the card's name instead (1 credit) and keeps the print from the right set. Only the
 * listed cards are stored.
 */
async function trainerCards(run: boolean, max: number) {
  const plans = Object.entries(DUEL_TRAINER_CARDS).flatMap(([person, p]) => (p.card ? [{ person, ...p }] : []));
  const ids = [...new Set(plans.map((p) => p.card))];
  const svc = createServiceClient();
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await svc.from("tcg_cards").select("id, images").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as { id: string; images: { medium?: string; small?: string } | null }[]) if (r.images?.medium || r.images?.small) have.add(r.id);
  }
  const missing = plans.filter((p, i) => !have.has(p.card) && plans.findIndex((q) => q.card === p.card) === i);
  console.log(`${ids.length} trainer cards · ${have.size} stored · ${missing.length} to fetch (about ${missing.length} credits, limit ${max})`);
  if (!run) { console.log("Plan only. Add --run to spend credits."); return; }
  let credits = 0;
  const failed: string[] = [];
  for (const p of missing) {
    if (credits >= max) { console.log(`  credit limit ${max} reached: ${missing.length - missing.indexOf(p)} left`); break; }
    credits++;
    let got: { id: string; name: string } | null = null;
    try {
      const c = await forceResolveCard(p.card);
      if (c) got = { id: c.id, name: c.name };
    } catch (e) {
      console.log(`  ${p.card}: ${(e as Error).message}`);
    }
    if (!got && credits < max) {
      credits++;
      const found = await searchCardsByQuery(`name:"${quoteSafe(p.name)}"`, WHY, 50).catch(() => [] as NormalizedCard[]);
      const hit = found.find((n) => n.card.id === p.card) ?? found.find((n) => n.expansion?.name === p.set && /trainer/i.test(n.card.supertype ?? ""));
      if (hit) { await persistSearchResults([hit]); got = { id: hit.card.id, name: hit.card.name }; }
    }
    if (got && got.id !== p.card) console.log(`  ! ${p.person}: stored ${got.id} (${got.name}), not ${p.card}: change trainer-cards.ts`);
    if (!got) failed.push(`${p.person} (${p.card})`);
    console.log(`  ${p.person} → ${got ? `${got.id} ${got.name}` : "NOT FOUND"}`);
  }
  console.log(`\nDone: ${credits} credits.${failed.length ? ` Not found: ${failed.join(", ")}.` : ""} Then run scripts/build-duel-cards.ts.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--warm")) return warm();
  if (args.includes("--trainers")) return trainerCards(args.includes("--run"), args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : 180);
  if (args.includes("--pool")) return pickPool();
  if (args.includes("--clean")) return cleanPass(args.includes("--run"), args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : 60);
  const run = args.includes("--run");
  const max = args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : 400;
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;

  const picks = existingPicks();
  const todo = DUEL_TRAINER_PLANS.filter((p) => (only ? only.has(p.id) : !picks[p.id] || picks[p.id].length !== p.species.length));
  const local = await loadLocal();
  console.log(`${DUEL_TRAINER_PLANS.length} trainers · ${Object.keys(picks).length} with picks · ${todo.length} to pick · ${local.length} Pokémon cards stored`);

  const localReady = local.filter((r) => duelReady(r));
  const teamReady = localReady.filter((r) => !POOL.has(r.id));
  const needOwner = new Set<string>();
  const needSpecies = new Set<string>();
  for (const p of todo) {
    p.species.forEach((sp, i) => {
      if (p.pin?.[i]) return;
      const fits = teamReady.filter((r) => nameFits(r, sp, p.owner));
      if (p.owner && !fits.some((r) => nameFits(r, sp, p.owner) === "own")) needOwner.add(p.owner);
      const repeats = p.species.slice(0, i + 1).filter((x) => x === sp).length;
      if (fits.length < repeats) needSpecies.add(sp);
    });
  }
  const teamIds = () => new Set(Object.values(picks).flat());
  /** A stored print the pool could take for this fill: its kind (ex or not), type and HP, on no team and not already in the pool. */
  const fillFits = (r: Row, f: Fill, onTeam: Set<string>) => {
    const c = duelReady(r);
    return !!c && !onTeam.has(r.id) && !POOL.has(r.id) && nameFits(r, f.species) === "plain" && c.t === f.t
      && c.hp >= 60 && c.hp <= 340 && isRuleBox(r.subtypes, r.name) === !!f.ex;
  };
  const fillHave = (f: Fill, rows: Row[]) => {
    const onTeam = teamIds();
    return rows.some((r) => fillFits(r, f, onTeam));
  };
  // Species the pool already has: a fill for one of them would never be picked.
  const names = new Map(local.map((r) => [r.id, r.name]));
  const poolSpecies = new Set(DUEL_POOL.map((id) => speciesKey(names.get(id) ?? id)));
  // Pool fill is for growing the pool (then --pool): only with --fill, so a roster run doesn't spend on it.
  const fill = args.includes("--fill") ? POOL_FILL.filter((f) => !poolSpecies.has(speciesKey(f.species)) && !fillHave(f, localReady)) : [];
  console.log(`Searches: ${needOwner.size} trainer-card (${[...needOwner].join(", ") || "none"}) · ${needSpecies.size} species (${[...needSpecies].join(", ") || "none"}) · ${fill.length} pool fill (${fill.map((f) => f.species).join(", ") || "none"})`);
  console.log(`At most ${needOwner.size + needSpecies.size + fill.length} credits (limit ${max}).`);
  if (!run) { console.log("Plan only. Add --run to pick and spend credits."); return; }

  let credits = 0;
  const memo = new Map<string, Row[]>();
  /** Search results by card id, kept whole (with the expansion each one came with) so a pick can be stored. */
  const searched = new Map<string, NormalizedCard>();
  async function search(q: string): Promise<Row[]> {
    if (memo.has(q)) return memo.get(q)!;
    if (credits >= max) throw new Error(`credit limit ${max} reached`);
    credits++;
    const raw = await searchCardsByQuery(q, WHY, 100);
    for (const n of raw) searched.set(n.card.id, n);
    const found = raw.map(fromSearch);
    memo.set(q, found);
    return found;
  }
  /** Store only the picked card (0 credits: the search paid for it); a stored copy without its picture is stored again from the search. */
  async function keep(id: string) {
    if (stored.has(id) && !noImage.has(id)) return;
    const n = searched.get(id);
    if (!n) throw new Error(`no search result for ${id}`);
    await persistSearchResults([n]);
    stored.add(id);
    noImage.delete(id);
  }
  const stored = new Set(local.map((r) => r.id));
  const noImage = new Set(local.filter((r) => !r.images?.medium && !r.images?.small).map((r) => r.id));

  let stopped = false;
  for (const p of todo) {
    if (stopped) break;
    try {
    // "Used on another team" means another trainer: a re-pick doesn't count its own old picks.
    const usedAcross = new Set(Object.entries(picks).filter(([id]) => id !== p.id).flatMap(([, ids]) => ids));
    const team: string[] = [];
    for (let i = 0; i < p.species.length; i++) {
      const sp = p.species[i];
      if (p.pin?.[i]) { team.push(p.pin[i]); continue; }
      // Usable, not in the player pool and not already on this team (Lance brings three Dragonite: three different prints).
      const open = (rows: Row[], fit?: "own") => rows.some((r) => !team.includes(r.id) && !POOL.has(r.id) && !!duelReady(r) && (fit ? nameFits(r, sp, p.owner) === fit : !!nameFits(r, sp, p.owner)));
      let pool = local.filter((r) => nameFits(r, sp, p.owner));
      if (p.owner && !open(pool, "own")) pool = pool.concat(await search(`name:"${quoteSafe(p.owner)}'s"`));
      if (!open(pool)) pool = pool.concat(await search(`name:"${quoteSafe(sp)}"`));
      const rank = (rows: Row[]) => rows
        .map((r) => ({ r, fit: nameFits(r, sp, p.owner) }))
        .filter((x): x is { r: Row; fit: "own" | "plain" } => !!x.fit && !!duelReady(x.r) && !team.includes(x.r.id) && !POOL.has(x.r.id))
        .sort((a, b) => score(a.r, a.fit, p, i, usedAcross) - score(b.r, b.fit, p, i, usedAcross) || (b.r.release ?? "").localeCompare(a.r.release ?? ""));
      let ranked = rank(pool);
      // Easy days stay easy: a gym leader's card, or an Elite Four card before the ace, that would be
      // someone else's ex print gets one search for a plain print first.
      const top = ranked[0];
      const gentle = p.tier === "gym" || (p.tier === "elite" && i < p.species.length - 1);
      if (gentle && top && top.fit === "plain" && isRuleBox(top.r.subtypes, top.r.name)) {
        pool = pool.concat(await search(`name:"${quoteSafe(sp)}"`));
        ranked = rank(pool);
      }
      const best = ranked[0]?.r;
      if (!best) { console.log(`  ✗ ${p.id} slot ${i + 1} ${sp}: no usable English card`); team.push(""); continue; }
      if (!stored.has(best.id) || noImage.has(best.id)) { await keep(best.id); local.push(best); }
      team.push(best.id);
      usedAcross.add(best.id);
      console.log(`  ${p.id} ${i + 1}. ${sp} → ${best.id} ${best.name} [${best.rarity ?? "?"}]`);
    }
    if (team.every(Boolean)) picks[p.id] = team;
    } catch (e) {
      // The credit limit: keep every trainer picked so far, skip the pool fill, and say who's left.
      if (!/credit limit/.test((e as Error).message)) throw e;
      stopped = true;
      const left = todo.slice(todo.indexOf(p)).map((x) => x.id);
      console.log(`  credit limit ${max} reached before ${p.id}: ${left.length} trainers left (${left.join(", ")})`);
    }
  }

  const onTeam = teamIds();
  let filled = 0;
  for (const [n, f] of (stopped ? [] : fill).entries()) {
    if (fillHave(f, local)) continue; // a team pick this run may have stored one
    let found: Row[];
    try {
      found = (await search(`name:"${quoteSafe(f.species)}"`)).filter((r) => fillFits(r, f, onTeam));
    } catch (e) {
      if (!/credit limit/.test((e as Error).message)) throw e;
      console.log(`  credit limit ${max} reached: ${fill.length - n} pool fills left (${fill.slice(n).map((x) => x.species).join(", ")})`);
      break;
    }
    const best = found.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || (b.release ?? "").localeCompare(a.release ?? ""))[0];
    if (!best) { console.log(`  ✗ pool fill ${f.species}${f.ex ? " ex" : ""} (${f.t}): nothing usable`); continue; }
    await keep(best.id);
    local.push(best);
    filled++;
    console.log(`  pool fill ${f.species}${f.ex ? " ex" : ""} → ${best.id} ${best.name} · ${duelReady(best)?.hp} HP [${best.rarity ?? "?"}]`);
  }
  if (fill.length) console.log(`Pool fill: ${filled} of ${fill.length} stored.`);

  writePicks(picks);
  console.log(`\nDone: ${credits} credits. ${Object.keys(picks).length} trainers with picks. Wrote ${PICKS_OUT}.`);
}

/** The species a card shows, for one-card-per-species: "Alolan Ninetales-GX" → "alolan ninetales". */
function speciesKey(name: string): string {
  return norm(name.replace(OWNER_PREFIX, ""))
    .replace(/[-\s]+(ex|gx|v|vmax|vstar|v-union|break|lv\.? ?x|prime|legend|δ|star|◇)$/i, "")
    .replace(/\s+(e4|gl|fb|c|g|4)$/i, "") // Diamond & Pearl era: "Drapion E4", "Luxray GL"
    .replace(/^(mega|m|radiant|shining|dark|light) /, "").trim();
}

function hpBand(hp: number): number {
  return hp <= 80 ? 0 : hp <= 130 ? 1 : hp <= 200 ? 2 : hp <= 260 ? 3 : 4;
}

/**
 * The player pool: from cards already stored (0 credits), one print per species (illustration rares
 * and newer prints first), no trainer's own cards, none on a trainer's team, spread across each
 * type's HP bands, ex/V/Mega cards capped at POOL_EX_SHARE. Ids already in DUEL_POOL stay in
 * place (a pool that's already dealt days must only grow).
 */
async function pickPool() {
  const { DUEL_TEAM_PICKS } = await import("../src/data/originals/duel/team-picks.generated");
  const teamIds = new Set(Object.values(DUEL_TEAM_PICKS).flat());
  const local = await loadLocal();
  const ready = new Map<string, { row: Row; card: DuelCard }>();
  for (const row of local) {
    const card = duelReady(row);
    if (!card || teamIds.has(row.id) || OWNER_PREFIX.test(card.name)) continue;
    if (/[^\x00-\x7FéÉ♀♂’'.:\- ]/.test(card.name)) continue; // English names only
    if (card.hp < 60 || card.hp > 340) continue; // the pool runs 60 to 340 HP
    ready.set(row.id, { row, card });
  }
  const keep = DUEL_POOL.filter((id) => ready.has(id));
  const out = [...keep];
  const takenSpecies = new Set(out.map((id) => speciesKey(ready.get(id)!.card.name)));
  const perType = new Map<EnergyType, number>();
  let exCount = 0;
  const exPerType = new Map<EnergyType, number>();
  for (const id of out) {
    const c = ready.get(id)!.card;
    perType.set(c.t, (perType.get(c.t) ?? 0) + 1);
    if (c.ex) { exCount++; exPerType.set(c.t, (exPerType.get(c.t) ?? 0) + 1); }
  }
  const total = Object.values(POOL_TYPES).reduce((a, b) => a + b, 0);
  const exCap = Math.floor(total * POOL_EX_SHARE);

  /** ex prints held back by a type's share of the cap; a second pass spends what's left of the cap on types still short. */
  const deferred = new Map<EnergyType, { row: Row; card: DuelCard; key: string }[]>((Object.keys(POOL_TYPES) as EnergyType[]).map((t) => [t, []]));
  const prefer = (a: { row: Row; card: DuelCard }, b: { row: Row; card: DuelCard }) =>
    Number(!cleanAttacks(a.row)) - Number(!cleanAttacks(b.row)) || rarityRank(a.row.rarity) - rarityRank(b.row.rarity) || (b.row.release ?? "").localeCompare(a.row.release ?? "") || a.row.id.localeCompare(b.row.id);

  for (const t of Object.keys(POOL_TYPES) as EnergyType[]) {
    const want = POOL_TYPES[t] - (perType.get(t) ?? 0);
    if (want <= 0) continue;
    // One print per species: the best-looking non-ex print, else the best ex print.
    const bySpecies = new Map<string, { row: Row; card: DuelCard }[]>();
    for (const x of ready.values()) {
      if (x.card.t !== t) continue;
      const k = speciesKey(x.card.name);
      if (takenSpecies.has(k)) continue;
      bySpecies.set(k, [...(bySpecies.get(k) ?? []), x]);
    }
    // Each species can come in through its best non-ex print or its best ex print, whichever band
    // needs it; bands are filled round-robin, big cards first each round, so every type gets small,
    // middle and big cards. Taking a species from one band takes it everywhere.
    type Pick = { row: Row; card: DuelCard; key: string };
    const bands: Pick[][] = [[], [], [], [], []];
    for (const [key, xs] of bySpecies) {
      const plain = xs.filter((x) => !x.card.ex).sort(prefer)[0];
      const exPrint = xs.filter((x) => x.card.ex).sort(prefer)[0];
      if (plain) bands[hpBand(plain.card.hp)].push({ ...plain, key });
      if (exPrint && (!plain || hpBand(exPrint.card.hp) !== hpBand(plain.card.hp))) bands[hpBand(exPrint.card.hp)].push({ ...exPrint, key });
    }
    // ex prints first in their band while the type has room under its ex share (the cap below holds the rest back).
    for (const b of bands) b.sort((a, b2) => Number(b2.card.ex) - Number(a.card.ex) || prefer(a, b2));
    let added = 0;
    // Each type gets its share of the ex cap (counting the ex cards it already has), so the first types can't use it all.
    let typeEx = exPerType.get(t) ?? 0;
    const typeExCap = Math.floor(POOL_TYPES[t] * POOL_EX_SHARE);
    while (added < want && bands.some((b) => b.length)) {
      let progressed = false;
      for (const b of [...bands].reverse()) {
        if (added >= want) break;
        let next = b.shift();
        while (next && (takenSpecies.has(next.key) || (next.card.ex && (exCount >= exCap || typeEx >= typeExCap)))) {
          if (next.card.ex && !takenSpecies.has(next.key)) deferred.get(t)!.push(next);
          next = b.shift();
        }
        if (!next) continue;
        out.push(next.row.id);
        takenSpecies.add(next.key);
        if (next.card.ex) { exCount++; typeEx++; }
        added++;
        progressed = true;
      }
      if (!progressed) break;
    }
    perType.set(t, (perType.get(t) ?? 0) + added);
  }
  for (const t of Object.keys(POOL_TYPES) as EnergyType[]) {
    const extra = deferred.get(t)!.sort((a, b) => b.card.hp - a.card.hp);
    for (const x of extra) {
      if ((perType.get(t) ?? 0) >= POOL_TYPES[t] || exCount >= exCap) break;
      if (takenSpecies.has(x.key)) continue;
      out.push(x.row.id);
      takenSpecies.add(x.key);
      exCount++;
      perType.set(t, (perType.get(t) ?? 0) + 1);
    }
    if ((perType.get(t) ?? 0) < POOL_TYPES[t]) console.log(`  ${t}: ${perType.get(t) ?? 0} of ${POOL_TYPES[t]}`);
  }

  const counts = (Object.keys(POOL_TYPES) as EnergyType[]).map((t) => `${t} ${perType.get(t) ?? 0}`).join(" · ");
  console.log(`${out.length} cards (${keep.length} kept) · ${exCount} ex (${Math.round((exCount / out.length) * 100)}%) · ${counts}`);
  const lines = out.map((id) => {
    const c = ready.get(id)!.card;
    return `  "${id}", // ${c.name} · ${c.t} · ${c.hp} HP`;
  }).join("\n");
  writeFileSync(POOL_OUT, `/**
 * Daily Duel: the player's pool. Each day deals six of these (the same six for everyone). Picked by
 * \`scripts/populate-duel-cards.ts --pool\` from cards already in our catalog: English prints, one per
 * species, every type with small, middle and big cards, ex/V/Mega at most ~${Math.round(POOL_EX_SHARE * 100)}%, no trainer's own
 * cards and none on a trainer's team. APPEND ONLY: past days were dealt from this list in this order.
 */
export const DUEL_POOL: string[] = [
${lines}
];
`);
  console.log(`Wrote ${POOL_OUT}.`);
}

/**
 * Clean prints for the cards already picked: every team slot and pool card whose print has an attack
 * the duel can't play gets a clean print of the same Pokémon (a clean own card first, as in score),
 * from stored cards when there is one, else one search (1 credit). The pool keeps its order (a
 * replacement takes the old card's place); a pool card with no clean print leaves the pool.
 */
async function cleanPass(run: boolean, max: number) {
  const local = await loadLocal();
  const byId = new Map(local.map((r) => [r.id, r]));
  const picks = existingPicks();
  const onTeams = () => new Set(Object.values(picks).flat());
  const pool = [...DUEL_POOL];
  const poolSet = () => new Set(pool);
  let credits = 0;
  const searched = new Map<string, NormalizedCard>();
  const memo = new Map<string, Row[]>();
  async function search(q: string): Promise<Row[]> {
    if (memo.has(q)) return memo.get(q)!;
    if (!run || credits >= max) return [];
    credits++;
    const raw = await searchCardsByQuery(q, WHY, 100);
    for (const n of raw) searched.set(n.card.id, n);
    const found = raw.map(fromSearch);
    memo.set(q, found);
    return found;
  }
  async function keep(row: Row) {
    if (byId.has(row.id) && (row.images?.medium || row.images?.small)) return;
    const n = searched.get(row.id);
    if (n) await persistSearchResults([n]);
    byId.set(row.id, row);
    local.push(row);
  }
  const unclean = (id: string) => { const r = byId.get(id); return !!r && !cleanAttacks(r); };

  // Team slots.
  let teamFixed = 0, teamLeft = 0, pinnedLeft = 0;
  for (const p of DUEL_TRAINER_PLANS) {
    const team = picks[p.id];
    if (!team) continue;
    for (let i = 0; i < team.length; i++) {
      if (!unclean(team[i])) continue;
      const sp = p.species[i];
      if (p.pin?.[i]) { pinnedLeft++; console.log(`  pinned, kept: ${p.id} ${i + 1}. ${sp} ${team[i]}`); continue; }
      const usedAcross = new Set(Object.entries(picks).filter(([id]) => id !== p.id).flatMap(([, ids]) => ids));
      const fits = (rows: Row[]) => rows
        .map((r) => ({ r, fit: nameFits(r, sp, p.owner) }))
        .filter((x): x is { r: Row; fit: "own" | "plain" } => !!x.fit && !!duelReady(x.r) && cleanAttacks(x.r) && !poolSet().has(x.r.id) && !team.some((id, j) => j !== i && id === x.r.id))
        .sort((a, b) => score(a.r, a.fit, p, i, usedAcross) - score(b.r, b.fit, p, i, usedAcross) || (b.r.release ?? "").localeCompare(a.r.release ?? ""));
      let best = fits(local)[0];
      if (!best) best = fits(await search(`name:"${quoteSafe(sp)}"`))[0];
      if (!best) { teamLeft++; console.log(`  no clean print: ${p.id} ${i + 1}. ${sp} (${byId.get(team[i])?.name})`); continue; }
      if (run) await keep(best.r);
      console.log(`  ${p.id} ${i + 1}. ${sp}: ${team[i]} ${byId.get(team[i])?.name} → ${best.r.id} ${best.r.name} [${best.r.rarity ?? "?"}]`);
      team[i] = best.r.id;
      teamFixed++;
    }
  }

  // Pool cards.
  let poolFixed = 0, poolDropped = 0;
  for (let k = 0; k < pool.length; k++) {
    const id = pool[k];
    if (!unclean(id)) continue;
    const old = byId.get(id)!;
    const oldCard = duelReady(old);
    const key = speciesKey(old.name);
    const ok = (r: Row) => {
      const c = duelReady(r);
      return !!c && cleanAttacks(r) && !onTeams().has(r.id) && !poolSet().has(r.id) && speciesKey(r.name) === key && !OWNER_PREFIX.test(c.name)
        && c.hp >= 60 && c.hp <= 340 && c.ex === !!oldCard?.ex && !/[^\x00-\x7FéÉ♀♂’'.:\- ]/.test(c.name);
    };
    const rank = (rows: Row[]) => rows.filter(ok).sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || (b.release ?? "").localeCompare(a.release ?? ""));
    let best = rank(local)[0];
    if (!best) best = rank(await search(`name:"${quoteSafe(old.name.replace(/\s+(ex|V|VMAX|VSTAR|GX|EX)$/, ""))}"`))[0];
    if (best) {
      if (run) await keep(best);
      console.log(`  pool: ${id} ${old.name} → ${best.id} ${best.name} [${best.rarity ?? "?"}]`);
      pool[k] = best.id;
      poolFixed++;
    } else {
      console.log(`  pool: ${id} ${old.name} has no clean print: ${run ? "leaves the pool" : "would leave the pool"}`);
      pool.splice(k, 1);
      k--;
      poolDropped++;
    }
  }
  console.log(`\nTeams: ${teamFixed} slots get clean prints, ${teamLeft} have none, ${pinnedLeft} pinned kept. Pool: ${poolFixed} swapped, ${poolDropped} leave (${pool.length} left). ${credits} credits${run ? "" : " (plan only: searches skipped)"}.`);
  if (!run) { console.log("Plan only. Add --run to apply (stored cards first, then up to --max searches)."); return; }
  writePicks(picks);
  const names = new Map([...byId.values()].map((r) => [r.id, r]));
  const lines = pool.map((pid) => { const c = duelReady(names.get(pid)!); return `  "${pid}", // ${c?.name ?? pid} · ${c?.t ?? "?"} · ${c?.hp ?? "?"} HP`; }).join("\n");
  const src = readFileSync(POOL_OUT, "utf8");
  const head = src.slice(0, src.indexOf("export const DUEL_POOL"));
  writeFileSync(POOL_OUT, `${head}export const DUEL_POOL: string[] = [\n${lines}\n];\n`);
  console.log(`Wrote ${PICKS_OUT} and ${POOL_OUT}. Then run scripts/build-duel-cards.ts.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
