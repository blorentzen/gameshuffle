/**
 * Daily Duel data checks: the trainer roster, the player pool, the generated card facts and the
 * trainers' pictures fit together and fit the game's rules.
 *
 *   npx tsx scripts/test-duel-data.ts
 */

import fs from "node:fs";
import path from "node:path";
import { DUEL_TRAINERS, DUEL_TRAINER_PLANS } from "../src/data/originals/duel/trainers";
import { DUEL_POOL } from "../src/data/originals/duel/pool";
import { DUEL_CARDS } from "../src/data/originals/duel/cards.generated";
import { canHit, MAX_MOVE_COST, OWNER_PREFIX } from "../src/data/originals/duel/cardRules";
import { peopleOf, personKey, personOf } from "../src/lib/originals/duel/rules";
import type { DuelTier, EnergyType } from "../src/lib/originals/duel/types";
import { ACE_ART, DUEL_TRAINER_CARDS, OFFICIAL_ART, OFFICIAL_ART_ON, SUPPORTER_ART, supporterEra } from "../src/data/originals/duel/trainer-cards";
import { DUEL_OFFICIAL_ART } from "../src/data/originals/duel/official-art.generated";
import { DUEL_TRAINER_ART } from "../src/data/originals/duel/trainer-art.generated";
import { artCrop, pictureCredit, trainerPicture } from "../src/lib/originals/duel/pictures";

let checks = 0;
const failures: string[] = [];
function ok(cond: unknown, msg: string) {
  checks++;
  if (!cond) failures.push(msg);
}

const ENERGY: EnergyType[] = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless"];
/**
 * Team sizes by tier. Gym battles are the first one in the game named, however many it has: some
 * Johto, Unova, Kalos and Galar leaders bring 2, Brock (HeartGold), Janine and Juan 5. Blueberry
 * Academy's Elite Four bring 6; Shauna's battles never go past 3, Brendan's and May's past 4.
 */
const SIZES: Record<DuelTier, [number, number]> = { gym: [2, 5], elite: [4, 6], rival: [3, 6], boss: [5, 6], champion: [6, 6], grunt: [2, 3], admin: [2, 6] };
const MIN_TIER: Record<DuelTier, number> = { gym: 60, elite: 25, rival: 15, boss: 10, champion: 12, grunt: 9, admin: 9 };
const TIERS: DuelTier[] = ["gym", "elite", "rival", "boss", "champion"];
const ENGLISH = /^[A-Za-z0-9 .,'’:\-éÉ♀♂&()]+$/;
const norm = (x: string) => x.replace(/[’‘]/g, "'").toLowerCase();

// Trainers
ok(DUEL_TRAINERS.length >= 140, `at least 140 trainers (have ${DUEL_TRAINERS.length})`);
ok(DUEL_TRAINERS.length === DUEL_TRAINER_PLANS.length, `every trainer has all cards picked (${DUEL_TRAINERS.length} of ${DUEL_TRAINER_PLANS.length})`);
for (const tier of TIERS) {
  const n = peopleOf(DUEL_TRAINERS.filter((t) => t.tier === tier)).length;
  ok(n >= MIN_TIER[tier], `at least ${MIN_TIER[tier]} ${tier} people (have ${n})`);
}
// People: a key on every trainer, and the name's key unless the roster says otherwise.
for (const p of DUEL_TRAINER_PLANS) {
  const t = DUEL_TRAINERS.find((x) => x.id === p.id);
  if (!t) continue;
  ok(t.person && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.person), `${t.id}: person key "${t.person}"`);
  ok(t.person === (p.person ?? personKey(p.name)) && personOf(t) === t.person, `${t.id}: person follows the roster`);
}
// Two people never share a key in a tier unless they're the same person (same name).
for (const tier of TIERS) {
  for (const { person, teams } of peopleOf(DUEL_TRAINERS.filter((t) => t.tier === tier))) {
    ok(new Set(teams.map((t) => t.name)).size === 1, `${tier} ${person}: one name across the person's teams (${teams.map((t) => t.name).join(", ")})`);
  }
}
ok(DUEL_TRAINERS.some((t) => t.person === "giovanni" && t.tier === "gym") && DUEL_TRAINERS.some((t) => t.person === "giovanni" && t.tier === "boss"), "Giovanni is one person in the gym and boss tiers");
const trainerIds = new Set<string>();
for (const t of DUEL_TRAINERS) {
  ok(/^[a-z0-9]+(-[a-z0-9]+)+$/.test(t.id), `${t.id}: id is lower-case words with dashes`);
  ok(!trainerIds.has(t.id), `${t.id}: id is unique`);
  trainerIds.add(t.id);
  ok(t.name && t.title && t.game, `${t.id}: has a name, title and game`);
  ok(t.signature?.title && ["energy2", "heal50", "boost30"].includes(t.signature.effect), `${t.id}: has a signature event`);
  const [lo, hi] = SIZES[t.tier];
  ok(t.team.length >= lo && t.team.length <= hi, `${t.id}: ${t.tier} team has ${lo}-${hi} cards (has ${t.team.length})`);
  ok(new Set(t.team).size === t.team.length, `${t.id}: no card twice on the team`);
  const plan = DUEL_TRAINER_PLANS.find((p) => p.id === t.id)!;
  t.team.forEach((id, i) => {
    const card = DUEL_CARDS[id];
    ok(card, `${t.id}: ${id} is in DUEL_CARDS`);
    if (!card) return;
    const sp = plan.species[i];
    const bare = norm(card.name).replace(OWNER_PREFIX, "").replace(/ (ex|v|gx|vmax|vstar)$/, "");
    ok(bare === norm(sp), `${t.id}: slot ${i + 1} card ${id} (${card.name}) is a ${sp}`);
  });
}

// Pool
const teamCards = new Set(DUEL_TRAINERS.flatMap((t) => t.team));
ok(DUEL_POOL.length >= 250, `pool has at least 250 cards (has ${DUEL_POOL.length})`);
ok(new Set(DUEL_POOL).size === DUEL_POOL.length, "no card twice in the pool");
const perType = new Map<EnergyType, number>();
let ex = 0;
const hps: number[] = [];
for (const id of DUEL_POOL) {
  const card = DUEL_CARDS[id];
  ok(card, `pool: ${id} is in DUEL_CARDS`);
  if (!card) continue;
  ok(!teamCards.has(id), `pool: ${id} isn't on a trainer's team`);
  ok(!OWNER_PREFIX.test(card.name), `pool: ${id} (${card.name}) isn't a trainer's own card`);
  perType.set(card.t, (perType.get(card.t) ?? 0) + 1);
  if (card.ex) ex++;
  hps.push(card.hp);
}
for (const t of ENERGY) ok((perType.get(t) ?? 0) >= 15, `pool: at least 15 ${t} cards (has ${perType.get(t) ?? 0})`);
ok(ex / DUEL_POOL.length <= 0.2, `pool: at most 20% ex/V/Mega (has ${Math.round((ex / DUEL_POOL.length) * 100)}%)`);
ok(Math.min(...hps) >= 60 && Math.min(...hps) <= 70, `pool: smallest card 60-70 HP (has ${Math.min(...hps)})`);
ok(Math.max(...hps) >= 300, `pool: biggest card at least 300 HP (has ${Math.max(...hps)})`);
const bands = [0, 0, 0, 0, 0];
for (const hp of hps) bands[hp <= 80 ? 0 : hp <= 130 ? 1 : hp <= 200 ? 2 : hp <= 260 ? 3 : 4]++;
ok(bands.every((b) => b >= 10), `pool: at least 10 cards in each HP band (≤80, ≤130, ≤200, ≤260, more: ${bands.join(", ")})`);

// Cards
const used = new Set([...teamCards, ...DUEL_POOL]);
for (const [id, c] of Object.entries(DUEL_CARDS)) {
  ok(c.id === id, `${id}: id matches its key`);
  ok(used.has(id), `${id}: used by a trainer or the pool`);
  ok(ENGLISH.test(c.name) && ENGLISH.test(c.short), `${id}: English name (${c.name})`);
  ok(c.short.length <= c.name.length && c.short.length > 0, `${id}: short name`);
  ok(ENERGY.includes(c.t), `${id}: type ${c.t}`);
  ok(c.weak === null || ENERGY.includes(c.weak), `${id}: weakness ${c.weak}`);
  ok(Number.isInteger(c.hp) && c.hp >= 30 && c.hp <= 400, `${id}: HP ${c.hp}`);
  ok(c.moves.length > 0 && c.moves.every((m) => m.n && m.d > 0 && m.cost.every((e) => ENERGY.includes(e))), `${id}: every move has a name, damage and Energy types`);
  ok(canHit(c), `${id}: a damaging move costs ${MAX_MOVE_COST} Energy or less`);
  ok(typeof c.img === "string" && c.img.startsWith("https://images.scrydex.com/") && !/\/large$/.test(c.img), `${id}: Scrydex image (small/medium only)`);
}

// Trainer pictures (picks 2026-10-21): every person has one, their own Supporter card, else official
// artwork (2026-10-23), else their ace's card art, with a face point, a credit and an art window.
const inUnit = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
const boxOk = (b: readonly number[]) => b.length === 4 && b.every(inUnit) && b[2] > 0.3 && b[3] > 0.15 && b[0] + b[2] <= 1.0001 && b[1] + b[3] <= 1.0001;
const seenPeople = new Set<string>();
for (const t of DUEL_TRAINERS) {
  const person = personOf(t);
  const plan = DUEL_TRAINER_CARDS[person];
  if (!seenPeople.has(person)) {
    seenPeople.add(person);
    ok(plan, `${person}: listed in trainer-cards.ts (a card, or { card: null } for the ace)`);
    if (plan?.card) {
      ok(DUEL_TRAINER_ART[plan.card]?.img.startsWith("https://images.scrydex.com/") && !/\/large$/.test(DUEL_TRAINER_ART[plan.card].img), `${person}: their card ${plan.card} has a Scrydex picture in trainer-art.generated.ts`);
      ok(plan.name && plan.set && plan.artist, `${person}: their card's name, set and illustrator for the credit`);
      ok(plan.face.length === 3 && inUnit(plan.face[0]) && inUnit(plan.face[1]) && plan.face[2] >= 1 && plan.face[2] <= 3, `${person}: a face point and zoom (${plan.face})`);
      ok(boxOk(plan.box ?? SUPPORTER_ART[supporterEra(plan.card)]), `${person}: an art window inside the card`);
      ok(!Object.values(DUEL_CARDS).some((c) => c.id === plan.card), `${person}: their Supporter card isn't also a team or pool card`);
    }
  }
  const ace = DUEL_CARDS[t.team[t.team.length - 1]];
  const pic = trainerPicture(t, ace);
  ok(pic, `${t.id}: has a picture`);
  if (!pic) continue;
  const want = plan?.card ? "card" : OFFICIAL_ART_ON && OFFICIAL_ART[person] ? "official" : "ace";
  ok(pic.kind === want, `${t.id}: picture is ${want} (got ${pic.kind})`);
  if (pic.kind === "official") {
    ok(pic.img === `/images/duel/trainers/${person}.webp`, `${t.id}: official picture is our own copy (${pic.img})`);
    ok(pic.ratio > 0.3 && pic.ratio < 2, `${t.id}: official picture shape ${pic.ratio}`);
    ok(pic.credit.replace(/\.$/, "") === `${t.name}'s picture: official artwork from ${OFFICIAL_ART[person].game}`, `${t.id}: credit names the official source (${pic.credit})`);
  } else {
    ok(pic.img.startsWith("https://images.scrydex.com/"), `${t.id}: picture is a Scrydex image`);
    ok(pic.ratio > 0.68 && pic.ratio < 0.76, `${t.id}: picture shape ${pic.ratio} is a card's`);
  }
  ok(boxOk(pic.box) && pic.face.length === 3 && inUnit(pic.face[0]) && inUnit(pic.face[1]) && pic.face[2] >= 1, `${t.id}: picture has an art window and a face point`);
  ok(pic.credit.startsWith(`${t.name}'s picture: `) && /[.!]$/.test(pic.credit) && !/\.\.$|!\.$/.test(pic.credit) && !/[–—]/.test(pic.credit), `${t.id}: credit line (${pic.credit})`);
  ok(pic.kind !== "card" || pic.credit.includes("illustrated by "), `${t.id}: credit names the illustrator`);
  ok(pic.alt.startsWith(t.name), `${t.id}: alt text names the trainer (${pic.alt})`);
  if (pic.kind === "ace") ok(DUEL_TRAINER_ART[pic.id] && ACE_ART[pic.id], `${t.id}: ace ${pic.id} measured and framed by hand (trainer-art.generated.ts, ACE_ART)`);
  // The crop rule: a round crop stays inside the art window and is square on the card.
  const [x, y, w, h] = artCrop(pic, 1, 1, { zoom: pic.face[2] });
  ok(x >= pic.box[0] - 1e-6 && y >= pic.box[1] - 1e-6 && x + w <= pic.box[0] + pic.box[2] + 1e-6 && y + h <= pic.box[1] + pic.box[3] + 1e-6, `${t.id}: the round crop stays inside the art window`);
  ok(Math.abs((w * pic.ratio) / h - 1) < 1e-6, `${t.id}: the round crop is square`);
}
// Official artwork: only for people with no card of their own, each with its picture on disk, a source on
// an official Pokémon site (scripts/data/duel-official-art.json) and a face point; every one of them still
// has a framed ace for when the switch is off.
const officialSources = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/data/duel-official-art.json"), "utf8")) as { people: Record<string, { url: string }> }).people;
const OFFICIAL_HOSTS = /^https:\/\/(www\.pokemon\.co\.jp\/|cdn\.pokemonmasters-game\.com\/|web\.archive\.org\/web\/\d+id_\/http:\/\/pokemonblackwhite\.com\/)/;
for (const [person, art] of Object.entries(OFFICIAL_ART)) {
  ok(DUEL_TRAINER_CARDS[person] && !DUEL_TRAINER_CARDS[person].card, `${person}: official artwork only for someone with no card of their own`);
  ok(DUEL_OFFICIAL_ART[person] && fs.existsSync(path.join(process.cwd(), "public", DUEL_OFFICIAL_ART[person].img)), `${person}: official picture on disk (run scripts/pull-duel-official-art.ts)`);
  ok(OFFICIAL_HOSTS.test(officialSources[person]?.url ?? ""), `${person}: official picture from an official Pokémon site (${officialSources[person]?.url})`);
  ok(/^Pokémon/.test(art.game), `${person}: the source game for the credit (${art.game})`);
  ok(art.face.length === 3 && inUnit(art.face[0]) && inUnit(art.face[1]) && art.face[2] >= 1 && art.face[2] <= 6, `${person}: a face point and zoom (${art.face})`);
  const t = DUEL_TRAINERS.find((x) => personOf(x) === person)!;
  const aceId = t ? DUEL_CARDS[t.team[t.team.length - 1]]?.id : null;
  ok(aceId && DUEL_TRAINER_ART[aceId] && ACE_ART[aceId], `${person}: their ace is still framed, for when the switch is off`);
}
for (const person of Object.keys(DUEL_OFFICIAL_ART)) ok(OFFICIAL_ART[person], `official-art.generated.ts: ${person} has a credit and face in OFFICIAL_ART`);
ok(pictureCredit("Viola", { kind: "official", card: "official artwork", set: "Pokémon X and Y", artist: null }) === "Viola's picture: official artwork from Pokémon X and Y.", "the official credit line");

// The data covers only the roster's people.
for (const person of Object.keys(DUEL_TRAINER_CARDS)) ok(seenPeople.has(person), `trainer-cards.ts: ${person} is someone on the roster`);
// An unknown person falls back to the ace; no ace picture, no picture.
const stranger = trainerPicture({ name: "Nobody Atall" }, DUEL_CARDS[DUEL_TRAINERS[0].team[0]]);
ok(stranger?.kind === "ace" && stranger.credit === `Nobody Atall's picture: the art from Nobody Atall's ace, ${DUEL_CARDS[DUEL_TRAINERS[0].team[0]].short}.`, "a person the data doesn't know gets their ace");
ok(trainerPicture({ name: "Nobody Atall" }, null) === null, "no card and no ace: no picture");
ok(pictureCredit("Bertha", { kind: "card", card: "Bertha's Warmth", set: "Rising Rivals", artist: "Ken Sugimori" }) === "Bertha's picture: Bertha's Warmth (Rising Rivals), illustrated by Ken Sugimori.", "the credit reads as on the picks page");

if (failures.length) {
  console.error(`${failures.length} of ${checks} checks failed:\n  ${failures.slice(0, 60).join("\n  ")}`);
  process.exit(1);
}
const tiers = TIERS.map((t) => `${t} ${DUEL_TRAINERS.filter((x) => x.tier === t).length}`).join(" · ");
console.log(`All ${checks} checks passed. ${DUEL_TRAINERS.length} trainers (${tiers}) · pictures ${Object.values(DUEL_TRAINER_CARDS).filter((p) => p.card).length} cards, ${Object.keys(DUEL_TRAINER_CARDS).filter((k) => !DUEL_TRAINER_CARDS[k].card && OFFICIAL_ART_ON && OFFICIAL_ART[k] && DUEL_OFFICIAL_ART[k]).length} official, ${Object.keys(DUEL_TRAINER_CARDS).filter((k) => !DUEL_TRAINER_CARDS[k].card && !(OFFICIAL_ART_ON && OFFICIAL_ART[k] && DUEL_OFFICIAL_ART[k])).length} aces · pool ${DUEL_POOL.length} (${ENERGY.map((t) => `${t} ${perType.get(t) ?? 0}`).join(", ")}) · ${Object.keys(DUEL_CARDS).length} cards.`);
