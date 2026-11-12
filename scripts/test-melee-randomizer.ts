/**
 * Super Smash Bros. Melee checks (built 2026-11-11): the roster and costumes against SmashWiki's alternate costume
 * list, every picture on disk, the stage list and its competitive status, rolls (costume ranges, no stage forms, the
 * rules the game has), the tournament engine on Melee's own stages (strike order, counterpicks, presets, stored
 * rules), chat rolls and match setups, and the space, tier lists, catalog and landing that ride on them.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-melee-randomizer.ts
 */

import fs from "node:fs";
import path from "node:path";
import { MELEE } from "../src/data/smash/melee";
import { ULTIMATE } from "../src/data/smash/ultimate";
import { smashGame } from "../src/data/smash";
import {
  competitiveRules, costumeArt, costumeCount, costumeLabel, drawFighters, fighterPool, rollPartyRules, rollStage, stagePool, COMPETITIVE_RULES,
} from "../src/lib/smash/roll";
import {
  counterpickOptions, defaultRules, isSmashGame, newSet, nextStriker, readRules, remainingStarters, rollSetFighters, rollSetStage, rollSmashRound,
  smashTourneyGame, stageName, starterPresetOf, starterPresetsFor, strikeSequence, type SmashSet,
} from "../src/lib/smash/tournament";
import { CHAT_GAMES } from "../src/lib/twitch/chatGames";
import { CHAT_SETUPS } from "../src/lib/twitch/chatSetups";
import { chatGameSlugForCategory } from "../src/lib/twitch/chatGameCategories";
import { RANDOMIZER_LANDINGS } from "../src/data/randomizer-landings";
import { TIER_TEMPLATES } from "../src/data/tier-templates";
import { spaceById, spaceFor, spaceOpen, spaceTabs } from "../src/lib/games/spaces";
import { gameKey } from "../src/lib/games/key";
import { catalogGame } from "../src/data/game-catalog";
import { drawPick, hasRoster } from "../src/lib/tournaments/rosters";
import { nightGame } from "../src/lib/nights/games";
import { MELEE_PUBLIC, meleeShown, randomizerPublic } from "../src/lib/games-visibility";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string) {
  if (ok) passed++;
  else { failed++; console.log(`FAIL ${label}`); }
}
const onDisk = (url: string) => fs.existsSync(path.join(process.cwd(), "public", url));
/** A seeded rng so a failure can be replayed. */
function seeded(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

// ── The roster ──────────────────────────────────────────────────────────────
const ROSTER = ["Dr. Mario", "Mario", "Luigi", "Bowser", "Peach", "Yoshi", "Donkey Kong", "Captain Falcon", "Ganondorf", "Falco", "Fox", "Ness",
  "Ice Climbers", "Kirby", "Samus", "Zelda", "Sheik", "Link", "Young Link", "Pichu", "Pikachu", "Jigglypuff", "Mewtwo", "Mr. Game & Watch", "Marth", "Roy"];
check(MELEE.fighters.length === 26, `26 fighters with Sheik (got ${MELEE.fighters.length})`);
check(JSON.stringify(MELEE.fighters.map((f) => f.name)) === JSON.stringify(ROSTER), "the select screen's order, Sheik after Zelda");
check(new Set(MELEE.fighters.map((f) => f.name)).size === 26, "fighter names unique");
check(MELEE.fighters.every((f) => !f.mii && !f.echoOf && !f.pack), "no Miis, Echo Fighters or DLC");
// SmashWiki, Alternate costume (SSBM): 4 to 6 each, 123 in all (Sheik's five included).
const COSTUMES: Record<string, number> = {
  "Dr. Mario": 5, Mario: 5, Luigi: 4, Bowser: 4, Peach: 5, Yoshi: 6, "Donkey Kong": 5, "Captain Falcon": 6, Ganondorf: 5, Falco: 4, Fox: 4, Ness: 4,
  "Ice Climbers": 4, Kirby: 6, Samus: 5, Zelda: 5, Sheik: 5, Link: 5, "Young Link": 5, Pichu: 4, Pikachu: 4, Jigglypuff: 5, Mewtwo: 4, "Mr. Game & Watch": 4, Marth: 5, Roy: 5,
};
for (const f of MELEE.fighters) check(costumeCount(f) === COSTUMES[f.name], `${f.name}: ${COSTUMES[f.name]} costumes (got ${costumeCount(f)})`);
check(MELEE.fighters.reduce((n, f) => n + costumeCount(f), 0) === 123, "123 costumes in all");
check(MELEE.fighters.find((f) => f.name === "Fox")?.costumes?.join() === "White,Red,Blue,Green", "Fox's colors in the game's order");
const sheik = MELEE.fighters.find((f) => f.name === "Sheik")!;
const zelda = MELEE.fighters.find((f) => f.name === "Zelda")!;
check(sheik.img === "" && !sheik.costumeImgs, "Sheik has no select screen portrait (Image coming soon)");
check(costumeArt(MELEE, sheik, 2) === "", "Sheik's art is empty for every costume");
check(sheik.series === zelda.series && costumeCount(sheik) === costumeCount(zelda), "Sheik wears Zelda's five costumes");
// Every other fighter has a portrait per costume, on disk.
for (const f of MELEE.fighters.filter((x) => x.name !== "Sheik")) {
  check(f.costumeImgs?.length === costumeCount(f), `${f.name}: a portrait per costume`);
  for (let c = 1; c <= costumeCount(f); c++) check(onDisk(costumeArt(MELEE, f, c)), `${f.name} costume ${c} art on disk`);
}
check(costumeArt(MELEE, MELEE.fighters.find((f) => f.name === "Fox"), 3).endsWith("fighters/fox-3.webp"), "costume 3 draws portrait 3");
check(costumeLabel(MELEE.fighters.find((f) => f.name === "Fox"), 3) === "Costume 3 · Blue", "costume label names the color");
check(costumeLabel(ULTIMATE.fighters[0], 5) === "Costume 5", "Ultimate keeps numbered costumes");
check(MELEE.fighters.every((f) => MELEE.series[f.series]), "every fighter's series has a name");

// ── Stages ──────────────────────────────────────────────────────────────────
check(MELEE.stages.length === 29, `29 stages (got ${MELEE.stages.length})`);
check(new Set(MELEE.stages.map((s) => s.id)).size === 29 && new Set(MELEE.stages.map((s) => s.name)).size === 29, "stage ids and names unique");
for (const s of MELEE.stages) check(onDisk(`${MELEE.assetBase}${s.img}`), `${s.name} picture on disk`);
const status = (st: string) => MELEE.stages.filter((s) => s.status === st).map((s) => s.name).sort();
check(JSON.stringify(status("starter")) === JSON.stringify(["Battlefield", "Dream Land", "Final Destination", "Fountain of Dreams", "Yoshi's Story"]), "five starters");
check(JSON.stringify(status("counterpick")) === JSON.stringify(["Pokémon Stadium"]), "Pokémon Stadium is the counterpick");
check(status("sometimes").length === 0 && status("banned").length === 23, "the other 23 are casual only");
check(onDisk("/images/super-smash-bros-melee/super-smash-bros-melee-keyart.webp"), "header art on disk");

// ── Rolls ───────────────────────────────────────────────────────────────────
const rng = seeded(11);
const pool = fighterPool(MELEE, { echoes: "separate", miis: false });
check(pool.length === 26, "the pool is all 26 (Sheik included)");
const seen = new Map<string, Set<number>>();
for (let i = 0; i < 6000; i++) {
  const [r] = drawFighters(pool, 1, {}, rng);
  const f = MELEE.fighters.find((x) => x.name === r.name)!;
  if (r.costume < 1 || r.costume > costumeCount(f)) { check(false, `${r.name} costume ${r.costume} out of range`); break; }
  if (!seen.has(r.name)) seen.set(r.name, new Set());
  seen.get(r.name)!.add(r.costume);
}
check(seen.size === 26, "every fighter comes up");
check([...seen].every(([n, cs]) => cs.size === COSTUMES[n]), "every costume comes up, none past the fighter's count");
const ult = new Set<number>();
for (let i = 0; i < 2000; i++) ult.add(drawFighters(fighterPool(ULTIMATE, { echoes: "separate", miis: false }), 1, {}, rng)[0].costume);
check(ult.size === 8 && Math.min(...ult) === 1 && Math.max(...ult) === 8, "Ultimate still rolls costumes 1 to 8");
const four = drawFighters(pool, 4, { unique: true }, rng);
check(new Set(four.map((f) => f.name)).size === 4, "four players, all different when asked");
const all = stagePool(MELEE, { list: "all", sometimes: false });
const legal = stagePool(MELEE, { list: "competitive", sometimes: false });
check(all.length === 29 && legal.length === 6, "every stage, or the legal six");
for (let i = 0; i < 500; i++) {
  const r = rollStage(all, false, rng, false);
  if (r.form !== "normal" || r.hazards) { check(false, "a Melee party stage came with a form or hazards"); break; }
}
check(true, "party stages have no forms or hazard switch");
const comp = competitiveRules(MELEE);
check(comp.kind === "stock" && comp.stocks === 4 && comp.minutes === 8 && comp.items === "off" && !comp.finalSmashMeter, "competitive: 4 stocks, 8 minutes, items off");
check(competitiveRules(ULTIMATE) === COMPETITIVE_RULES && competitiveRules() === COMPETITIVE_RULES, "Ultimate keeps 3 stocks, 7 minutes");
let stamina = 0, meter = 0;
for (let i = 0; i < 2000; i++) { const r = rollPartyRules(rng, MELEE); if (r.kind === "stamina") stamina++; if (r.finalSmashMeter) meter++; }
check(stamina === 0 && meter === 0, "Melee party rules: no Stamina battles or Final Smash meter");
let ultStamina = 0, ultMeter = 0;
for (let i = 0; i < 2000; i++) { const r = rollPartyRules(rng); if (r.kind === "stamina") ultStamina++; if (r.finalSmashMeter) ultMeter++; }
check(ultStamina > 0 && ultMeter > 0, "Ultimate party rules still roll both");
// The same draws in the same order for Ultimate: one seed gives the same rules before and after Melee joined.
check(JSON.stringify(rollPartyRules(seeded(5))) === JSON.stringify(rollPartyRules(seeded(5), ULTIMATE)), "Ultimate's party rules don't depend on passing the game");

// ── Tournaments ─────────────────────────────────────────────────────────────
check(isSmashGame("super-smash-bros-melee") && isSmashGame("super-smash-bros-ultimate") && !isSmashGame("street-fighter-6"), "Melee runs Smash sets");
check(smashTourneyGame("super-smash-bros-melee") === MELEE && smashTourneyGame("anything") === ULTIMATE, "a tournament's Smash game by slug");
const rules = defaultRules(MELEE);
check(JSON.stringify([...rules.starters].sort()) === JSON.stringify(["battlefield", "dream-land", "final-destination", "fountain-of-dreams", "yoshis-story"]), "default starters");
check(rules.legal.length === 6 && rules.legal.includes("pokemon-stadium"), "default legal list is the six");
check(rules.bestOf === 3 && rules.finalsBestOf === 5 && rules.stages === "strike", "best of 3, finals best of 5, strike then counterpick");
check(JSON.stringify(strikeSequence(5)) === JSON.stringify(["first", "second", "second", "first"]), "five starters strike 1-2-1");
// Strike a whole game 1: four strikes, one stage left.
let set: SmashSet = newSet("m1", "p1", "p2", 3, "b");
const order: string[] = [];
for (let i = 0; i < 4; i++) {
  const who = nextStriker(set, rules);
  order.push(who ?? "none");
  set = { ...set, strikes: [...set.strikes, remainingStarters(set, rules)[0]] };
}
check(order.join() === "b,a,a,b", `the first striker strikes once, the other twice, then once (got ${order.join()})`);
check(nextStriker(set, rules) === null && remainingStarters(set, rules).length === 1, "striking ends with one stage left");
const game1 = remainingStarters(set, rules)[0];
set = { ...set, games: [{ fighters: { a: null, b: null }, stageId: game1, winner: "a" }] };
const cp = counterpickOptions(set, rules);
check(cp.picker === "b" && cp.stages.length === 6, "the loser counterpicks from all six");
set = { ...set, games: [...set.games, { fighters: { a: null, b: null }, stageId: "pokemon-stadium", winner: "b" }] };
const cp2 = counterpickOptions(set, rules);
check(cp2.picker === "a" && !cp2.stages.includes(game1) && cp2.stages.length === 5, "Dave's Stupid Rule: not a stage you already won on");
check(stageName("fountain-of-dreams", MELEE) === "Fountain of Dreams" && stageName("smashville", MELEE) === "No stage yet", "stage names come from the game's own list");
const r2 = rollSetStage(set, rules, rng);
check(!!r2 && rules.legal.includes(r2), "a random set stage is legal");
const fighters = rollSetFighters(set, { ...rules, fighters: "random_unique" }, [], MELEE);
check(!!fighters && ROSTER.includes(fighters.a.name) && fighters.a.costume <= COSTUMES[fighters.a.name], "set fighters come from Melee's roster");
const round = rollSmashRound([], rules, true, [], MELEE);
check(!!round && rules.legal.includes(round.stageId) && round.fighters.every((f) => ROSTER.includes(f.name)), "points rounds roll Melee stages and fighters");
// Stored rules: Ultimate's stage ids mean nothing in Melee and fall back to the defaults.
const stored = readRules({ legal: ["smashville", "battlefield", "pokemon-stadium"], starters: ["smashville", "battlefield"] }, MELEE);
check(JSON.stringify(stored.legal) === JSON.stringify(["battlefield", "pokemon-stadium"]) && JSON.stringify(stored.starters) === JSON.stringify(["battlefield"]), "stored rules keep only Melee stages");
const sorted = (o: object) => JSON.stringify(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
check(sorted(readRules(undefined, MELEE)) === sorted(rules), "no stored rules = the defaults");
const presets = starterPresetsFor(MELEE);
check(presets.length === 3 && presets.every((p) => p.stages.length === 5 && p.stages.every((id) => MELEE.stages.some((s) => s.id === id))), "three presets of five real stages");
check(starterPresetOf(rules.starters, MELEE) === "singles", "the defaults are the singles preset");
check(starterPresetOf(["battlefield", "dream-land", "final-destination", "pokemon-stadium", "yoshis-story"], MELEE) === "doubles", "doubles preset recognized");
check(!presets.find((p) => p.id === "doubles")!.stages.includes("fountain-of-dreams"), "doubles leaves out Fountain of Dreams");
check(starterPresetsFor(ULTIMATE).map((p) => p.id).join() === "three,five", "Ultimate keeps its presets");
check(hasRoster("super-smash-bros-melee"), "random-fighter tournament rounds");
const picks = Array.from({ length: 40 }, () => drawPick("super-smash-bros-melee"));
check(picks.every((p) => !!p && ROSTER.includes(p.pick) && /^Costume \d · /.test(p.detail ?? "")), "random-fighter picks come with a costume");

// ── Chat ────────────────────────────────────────────────────────────────────
const chat = CHAT_GAMES["super-smash-bros-melee"];
check(!!chat && chat.lobbyCap === 4 && chat.noun === "fighter", "chat roll: four to a room");
for (let i = 0; i < 300; i++) {
  const r = chat.roll({ owned: null, arg: "", taken: [] });
  const slot = r.slots[0];
  const f = MELEE.fighters.find((x) => x.name === slot?.name);
  if (!f || slot.kind !== "portrait" || !/^Costume \d · /.test(slot.detail ?? "") || (f.name !== "Sheik" && !slot.img) || (f.name === "Sheik" && slot.img) || !r.text.startsWith(`🥊 ${f.name} (costume `)) {
    check(false, `chat roll ${JSON.stringify(r)}`);
    break;
  }
}
check(true, "chat rolls: a portrait in the rolled costume, Sheik without one");
const battle = chat.battleSetting?.();
check(!!battle && legal.some((s) => s.name === battle), "viewer battles on a legal stage");
const taken = ROSTER.filter((n) => n !== "Marth");
check(chat.roll({ owned: null, arg: "", taken }).slots[0].name === "Marth", "a viewer battle deals a fighter nobody has");
const setup = CHAT_SETUPS["super-smash-bros-melee"];
const legalSetup = setup.roll({ arg: "", players: 2 });
check(legalSetup.kind === "setup" && legal.some((s) => s.name === legalSetup.slots[0].name) && /4 stocks, 8 minutes, items off/.test(legalSetup.text), "!gs setup: a legal stage and the competitive rules");
const strikes = setup.roll({ arg: "starters", players: 2 });
check(strikes.slots.filter((x) => x.label === "Starter").length === 5 && /Pokémon Stadium is the counterpick/.test(strikes.text) && !strikes.title!.includes(": "), "!gs setup starters: the five starters and the counterpick");
check(strikes.slots.filter((x) => x.label === "Starter").every((x) => !!x.img), "starter pictures on the setup card");
const partySetup = setup.roll({ arg: "party", players: 4 });
check(all.some((s) => s.name === partySetup.slots[0].name) && !/stamina|Final Smash/i.test(partySetup.text), "!gs setup party: any stage, rules Melee has");
check(chatGameSlugForCategory("16282", "Super Smash Bros. Melee") === "super-smash-bros-melee", "Twitch category 16282");

// ── Space, lists and pages ──────────────────────────────────────────────────
check(MELEE_PUBLIC === false && meleeShown() && !randomizerPublic("super-smash-bros-melee"), "staff only until opened (development shows it)");
const sp = spaceById("super-smash-bros-melee");
check(!!sp && sp.opens === null && sp.shown === false && !spaceOpen(sp, "2030-01-01"), "space: staff only until an opening day and the flag");
check(!!sp && JSON.stringify(spaceTabs(sp)) === JSON.stringify(["now", "events", "rolls", "people", "posts", "ideas"]), "space: its six tabs");
check(!!sp && sp.main.label === "Run a bracket" && sp.main.href === "/tournament/create?game=super-smash-bros-melee" && sp.roll?.label === "Roll a fighter", "space: Run a bracket, with the roll on Rolls");
check(!!sp && sp.strikes === "super-smash-bros-melee", "space: Now explains the tournament stages");
check(spaceFor("ssbm")?.id === "super-smash-bros-melee" && spaceFor("super-smash-bros-ultimate")?.id === "smash", "Melee has its own space, apart from Ultimate");
check(gameKey("SSBM") === "super-smash-bros-melee" && gameKey("Melee") === "super-smash-bros-melee", "game keys");
check(catalogGame("Super Smash Bros. Melee")?.status === "live", "catalog: live (development)");
check(nightGame("super-smash-bros-melee")?.unit === "game", "live nights count games");
const t = (slug: string) => TIER_TEMPLATES.find((x) => x.slug === slug);
check(t("smash-melee-fighters")?.items.length === 26 && t("smash-melee-stages")?.items.length === 29, "tier lists (development)");
check(new Set(t("smash-melee-fighters")?.items.map((x) => x.label)).size === 26, "tier list names unique");
check(t("smash-melee-fighters")!.items.filter((x) => x.image).every((x) => onDisk(x.image!)), "tier list pictures on disk");
const l = RANDOMIZER_LANDINGS["super-smash-bros-melee"];
check(!!l && l.metaTitle.length <= 60 && l.metaDescription.length <= 160, `landing title ${l?.metaTitle.length} and description ${l?.metaDescription.length} fit`);
check(!/[–—]/.test(JSON.stringify(l)), "landing has no dashes");
check(onDisk("/images/opengraph/super-smash-bros-melee-og.jpg"), "share image on disk");
check(smashGame("super-smash-bros-melee") === MELEE, "saved setups know Melee");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
