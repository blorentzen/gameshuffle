/**
 * Mario Kart 7 randomizer checks (Retro Mario Kart picks 2026-11-12): the data against the game (Super Mario Wiki's
 * Mario Kart 7 page), every picture on disk, the parts setting at both steps, the options, cups and their order,
 * races, battles, saved setups, the chat roll and match setups, and the Retro Mario Kart space's five-game switch.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-mario-kart-7-randomizer.ts
 */

import fs from "node:fs";
import path from "node:path";
import { MARIO_KART_7 as G } from "../src/data/mario-kart-7/mario-kart-7";
import { describeMarioKart7Setup } from "../src/data/mario-kart-7";
import {
  DEFAULT_PARTS, MK7_CLASSES, PARTS_LEVELS, battleArt, bodyArt, characterArt, characterPool, comboFits, courseArt, courseNote, cupArt,
  drawCombos, gliderArt, kartData, partPool, partsLevel, rollBattles, rollCombo, rollCup, rollEngine, rollRaces, tiresArt, toKartCombo,
} from "../src/lib/mario-kart-7/roll";
import type { Mk7Class } from "../src/lib/mario-kart-7/types";
import { CHAT_GAMES } from "../src/lib/twitch/chatGames";
import { CHAT_SETUPS } from "../src/lib/twitch/chatSetups";
import { chatGameSlugForCategory } from "../src/lib/twitch/chatGameCategories";
import { resolveYouTubeGameFromTitle } from "../src/lib/youtube/games";
import { RANDOMIZER_LANDINGS } from "../src/data/randomizer-landings";
import { TIER_TEMPLATES } from "../src/data/tier-templates";
import { spaceById, spaceFor, GAME_SPACES } from "../src/lib/games/spaces";
import { gameKey } from "../src/lib/games/key";
import { catalogGame } from "../src/data/game-catalog";
import { NIGHT_GAMES } from "../src/lib/nights/games";
import { MARIO_KART_7_PUBLIC, randomizerPublic } from "../src/lib/games-visibility";
import { rollForSpace, rollSigned, spaceRollGames, spaceRoller } from "../src/lib/rolls/spaceRoll";

process.env.ACTIVITY_SESSION_SECRET ??= "test-only-secret";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string) {
  if (ok) passed++;
  else { failed++; console.log(`FAIL ${label}`); }
}
function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rng = rngFrom(20261112);
const onDisk = (src: string | null | undefined) => !!src && fs.existsSync(path.join(process.cwd(), "public", src));

// ── The roster ──────────────────────────────────────────────────────────────
check(G.characters.length === 17 && new Set(G.characters.map((c) => c.name)).size === 17, "17 characters, names unique");
const WEIGHTS: Record<Mk7Class, string[]> = {
  Feather: ["Toad", "Koopa Troopa", "Shy Guy", "Lakitu"],
  Light: ["Peach", "Yoshi", "Daisy"],
  Medium: ["Mario", "Luigi", "Mii"],
  Cruiser: ["Donkey Kong", "Rosalina", "Wiggler"],
  Heavy: ["Bowser", "Wario", "Metal Mario", "Honey Queen"],
};
check(MK7_CLASSES.join() === "Feather,Light,Medium,Cruiser,Heavy", "five weight classes, lightest first");
for (const [cls, names] of Object.entries(WEIGHTS) as [Mk7Class, string[]][]) {
  check(G.characters.filter((c) => c.weight === cls).length === names.length, `${names.length} ${cls} characters`);
  for (const n of names) check(G.characters.find((c) => c.name === n)?.weight === cls, `${n} is ${cls}`);
}
const STARTERS = ["Mario", "Luigi", "Peach", "Yoshi", "Bowser", "Donkey Kong", "Toad", "Koopa Troopa"];
check(G.characters.filter((c) => !c.unlock).map((c) => c.name).join() === STARTERS.join(), "the eight starters, in the game's order");
const UNLOCK: Record<string, string> = { Daisy: "Mushroom", Wario: "Flower", Rosalina: "Star", "Metal Mario": "Special", "Shy Guy": "Shell", "Honey Queen": "Banana", Wiggler: "Leaf", Lakitu: "Lightning" };
for (const [n, cup] of Object.entries(UNLOCK)) check(G.characters.find((c) => c.name === n)?.unlock === `Win the 150cc ${cup} Cup`, `${n}: win the 150cc ${cup} Cup`);
check(!!G.characters.find((c) => c.name === "Mii")?.unlock, "the Mii unlocks too");
for (const c of G.characters) check(onDisk(characterArt(G, c.name)), `${c.name} picture on disk`);

// ── Parts ───────────────────────────────────────────────────────────────────
check(G.bodies.length === 17 && G.tires.length === 10 && G.gliders.length === 7, "17 bodies, 10 tires, 7 gliders");
check(G.bodies.length * G.tires.length * G.gliders.length === 1190, "1,190 combinations");
for (const [kind, list] of [["bodies", G.bodies], ["tires", G.tires], ["gliders", G.gliders]] as const) check(new Set(list.map((p) => p.name)).size === list.length, `${kind}: names unique`);
check(partPool(G.bodies, "start").map((p) => p.name).join() === "Standard,Birthday Girl,Bolt Buggy", "starting bodies: Standard, Birthday Girl, Bolt Buggy");
check(partPool(G.tires, "start").map((p) => p.name).join() === "Standard,Roller,Monster", "starting tires: Standard, Roller, Monster");
check(partPool(G.gliders, "start").map((p) => p.name).join() === "Super Glider", "starting glider: Super Glider");
check(["Gold Standard", "Gold Tires", "Gold Glider", "Beast Glider"].every((n) => [...G.bodies, ...G.tires, ...G.gliders].some((p) => p.name === n && p.unlock && !/at random/.test(p.unlock))), "the gold parts and the Beast Glider have their own conditions");
for (const p of G.bodies) check(onDisk(bodyArt(G, p.name)), `body ${p.name} on disk`);
for (const p of G.tires) check(onDisk(tiresArt(G, p.name)), `tires ${p.name} on disk`);
for (const p of G.gliders) check(onDisk(gliderArt(G, p.name)), `glider ${p.name} on disk`);
check(PARTS_LEVELS.map((l) => l.id).join() === "start,all" && DEFAULT_PARTS === "all" && partsLevel("nope") === "all" && partsLevel("start") === "start", "two parts steps, starting on every part");

// Rolls at each step: always fitting, and every allowed part comes up.
for (const level of ["start", "all"] as const) {
  const seen = { body: new Set<string>(), tires: new Set<string>(), glider: new Set<string>(), character: new Set<string>() };
  for (let n = 0; n < 3000; n++) {
    const c = rollCombo(G, { parts: level }, [], rng);
    check(comboFits(G, c, level), `${level}: ${c.character} in ${c.body}, ${c.tires}, ${c.glider} fits`);
    seen.body.add(c.body); seen.tires.add(c.tires); seen.glider.add(c.glider); seen.character.add(c.character);
  }
  check(seen.body.size === partPool(G.bodies, level).length && seen.tires.size === partPool(G.tires, level).length && seen.glider.size === partPool(G.gliders, level).length, `${level}: every allowed part comes up`);
  check(seen.character.size === 17, `${level}: all 17 characters come up (parts don't limit characters)`);
}
check(!comboFits(G, { character: "Mario", body: "Pipe Frame", tires: "Standard", glider: "Super Glider" }, "start") && comboFits(G, { character: "Mario", body: "Pipe Frame", tires: "Standard", glider: "Super Glider" }, "all"), "comboFits follows the step");
// Options.
check(characterPool(G).length === 17 && characterPool(G, { unlockables: false }).length === 8, "unlockables switch: 17 or 8");
for (let n = 0; n < 300; n++) {
  const room = drawCombos(G, 8, { unique: true }, rng);
  check(new Set(room.map((c) => c.character)).size === 8, "8 players, everyone a different character");
  const feather = drawCombos(G, 6, { unique: true, classes: ["Feather"] }, rng);
  check(new Set(feather.map((c) => c.character)).size === 6 && feather.slice(0, 4).every((c) => WEIGHTS.Feather.includes(c.character)), "6 players, feather only, different: the class gives way after four");
  check(drawCombos(G, 4, { unlockables: false }, rng).every((c) => STARTERS.includes(c.character)), "unlockables off: only the eight starters");
}
let repeats = 0;
for (let n = 0; n < 200; n++) if (new Set(drawCombos(G, 8, {}, rng).map((c) => c.character)).size < 8) repeats++;
check(repeats > 100, `repeats allowed by default (${repeats} of 200 rooms had one)`);
const kc = toKartCombo(G, { character: "Lakitu", body: "Cloud 9", tires: "Sponge", glider: "Beast Glider" });
check(kc.character.name === "Lakitu" && kc.vehicle.name === "Cloud 9" && kc.wheels.name === "Sponge" && kc.glider.name === "Beast Glider" && onDisk(kc.vehicle.img) && kc.character.weight === "Feather", "the shared card's combo shape");
const kd = kartData(G);
check(kd.characters.length === 17 && kd.vehicles.length === 17 && kd.wheels?.length === 10 && kd.gliders?.length === 7, "the shared card's reels");

// ── Cups and races ──────────────────────────────────────────────────────────
check(G.cups.map((c) => c.name).join() === "Mushroom Cup,Flower Cup,Star Cup,Special Cup,Shell Cup,Banana Cup,Leaf Cup,Lightning Cup", "eight cups in order");
check(G.cups.slice(0, 4).every((c) => c.kind === "new") && G.cups.slice(4).every((c) => c.kind === "classic"), "four new, then four classic");
const all = G.cups.flatMap((c) => c.courses);
check(all.length === 32 && new Set(all.map((c) => c.name)).size === 32 && G.cups.every((c) => c.courses.length === 4), "32 different courses, four a cup");
const CUPS: Record<string, string[]> = {
  "Mushroom Cup": ["Toad Circuit", "Daisy Hills", "Cheep Cheep Lagoon", "Shy Guy Bazaar"],
  "Flower Cup": ["Wuhu Loop", "Mario Circuit", "Music Park", "Rock Rock Mountain"],
  "Star Cup": ["Piranha Plant Slide", "Wario Shipyard", "Neo Bowser City", "Maka Wuhu"],
  "Special Cup": ["DK Jungle", "Rosalina's Ice World", "Bowser's Castle", "Rainbow Road"],
  "Shell Cup": ["N64 Luigi Raceway", "GBA Bowser Castle 1", "Wii Mushroom Gorge", "DS Luigi's Mansion"],
  "Banana Cup": ["N64 Koopa Beach", "SNES Mario Circuit 2", "Wii Coconut Mall", "DS Waluigi Pinball"],
  "Leaf Cup": ["N64 Kalimari Desert", "DS DK Pass", "GCN Daisy Cruiser", "Wii Maple Treeway"],
  "Lightning Cup": ["Wii Koopa Cape", "GCN Dino Dino Jungle", "DS Airship Fortress", "SNES Rainbow Road"],
};
for (const [cup, courses] of Object.entries(CUPS)) check(G.cups.find((c) => c.name === cup)?.courses.map((c) => c.name).join() === courses.join(), `${cup} in order`);
check(G.cups.filter((c) => c.kind === "classic").flatMap((c) => c.courses).every((c) => /^(SNES|N64|GBA|GCN|DS|Wii) /.test(c.name)), "classic courses carry their console");
check(all.filter((c) => c.sections).map((c) => c.name).join() === "Wuhu Loop,Maka Wuhu,Rainbow Road" && courseNote({ sections: true }) === "3 sections", "three courses raced in sections");
for (const c of all) check(onDisk(courseArt(G, c.name)), `${c.name} picture on disk`);
for (const c of G.cups) check(onDisk(cupArt(G, c.slug)), `${c.name} emblem on disk`);
for (let n = 0; n < 200; n++) check(rollCup(G, "new", rng).kind === "new" && rollCup(G, "classic", rng).kind === "classic", "new and classic cups keep to their kind");
for (const count of [4, 8, 12, 16, 32]) for (let n = 0; n < 60; n++) {
  const list = rollRaces(G, count, rng);
  check(list.length === count && new Set(list.map((c) => c.name)).size === count, `${count} races, no course twice`);
}
const engines = new Set<string>();
for (let n = 0; n < 400; n++) engines.add(rollEngine(G, [], rng));
check(G.engines.join() === "50cc,100cc,150cc,Mirror" && engines.size === 4, "four engine classes, all come up");

// ── Battle ──────────────────────────────────────────────────────────────────
check(G.battleCourses.map((b) => b.name).join() === "Honeybee Hive,Sherbet Rink,Wuhu Town,GBA Battle Course 1,N64 Big Donut,DS Palm Shore", "six battle courses, the classics with their console");
check(G.battleModes.map((m) => m.name).join() === "Balloon Battle,Coin Runners", "the two battle modes");
for (const b of G.battleCourses) check(onDisk(battleArt(G, b.name)), `${b.name} picture on disk`);
for (const count of [1, 3, 5]) for (let n = 0; n < 100; n++) {
  const bs = rollBattles(G, count, {}, rng);
  check(bs.length === count && new Set(bs.map((b) => b.course)).size === count, `${count} battles, no course twice`);
  check(rollBattles(G, count, { modes: ["coin"] }, rng).every((b) => b.mode === "Coin Runners"), `${count} battles: Coin Runners only`);
}

// ── Saved setups ────────────────────────────────────────────────────────────
const rows = describeMarioKart7Setup({
  type: "mario-kart-7-setup", gameSlug: G.slug, parts: "start",
  racers: [{ name: "Sam", character: "Toad", body: "Bolt Buggy", tires: "Roller", glider: "Super Glider" }],
  races: { title: "Banana Cup", engine: "150cc", courses: CUPS["Banana Cup"] }, battles: [{ course: "Wuhu Town", mode: "Coin Runners" }],
});
check(rows.find((r) => r.label === "Racers")?.value === "Sam: Toad (Bolt Buggy, Roller, Super Glider)", "saved setup names the kart");
check(rows.find((r) => r.label === "Parts")?.value === "Starting parts", "saved setup names the parts step");
check(rows.some((r) => r.label === "Banana Cup, 150cc") && rows.some((r) => r.label === "Battle" && r.value === "Coin Runners on Wuhu Town"), "saved setup names the cup and battle");
check(describeMarioKart7Setup({ gameSlug: "mario-kart-ds" }).length === 0, "another game's setup reads empty");

// ── Chat ────────────────────────────────────────────────────────────────────
const chat = CHAT_GAMES[G.slug];
check(!!chat && chat.lobbyCap === 8 && !chat.unique, "chat roll registered, a room of eight, repeats allowed");
for (let n = 0; n < 300; n++) {
  const arg = ["", "start", "feather", "start heavy"][n % 4];
  const r = chat.roll({ owned: null, arg, taken: [] });
  const [who, body, tires, glider] = r.slots;
  const c = { character: who.name, body: body.name, tires: tires.name, glider: glider.name };
  check(r.slots.length === 4 && who.label === "Character" && body.label === "Body" && tires.label === "Tires" && glider.label === "Glider", "chat roll: character, body, tires, glider");
  check(comboFits(G, c, arg.includes("start") ? "start" : "all"), `chat roll fits: ${r.text}`);
  if (arg === "feather") check(WEIGHTS.Feather.includes(who.name), "!gs-shuffle feather gives a feather character");
  if (arg === "start heavy") check(WEIGHTS.Heavy.includes(who.name), "!gs-shuffle start heavy gives a heavy character");
  check(r.slots.every((s) => onDisk(s.img)), "chat roll pictures on disk");
}
const setup = CHAT_SETUPS[G.slug];
check(!!setup && (setup.choices?.length ?? 0) === 3, "match setup registered");
for (let n = 0; n < 60; n++) {
  const cup = setup.roll({ arg: "", players: 4 });
  check(G.cups.some((c) => c.courses.map((x) => x.name).join() === cup.slots.map((s) => s.name).join()) && /Cup, (50cc|100cc|150cc|Mirror)$/.test(cup.title ?? ""), `!gs setup: a cup in order (${cup.title})`);
  const classic = setup.roll({ arg: "classic", players: 4 });
  check(G.cups.filter((c) => c.kind === "classic").some((c) => (classic.title ?? "").startsWith(c.name)), "!gs setup classic: a classic cup");
  const nw = setup.roll({ arg: "new", players: 4 });
  check(G.cups.filter((c) => c.kind === "new").some((c) => (nw.title ?? "").startsWith(c.name)), "!gs setup new: a new cup");
  const many = setup.roll({ arg: "32", players: 8 });
  check(many.slots.length === 32 && new Set(many.slots.map((s) => s.name)).size === 32, "!gs setup 32: all 32, none twice");
  const battle = setup.roll({ arg: "battle", players: 4 });
  check(G.battleCourses.some((b) => b.name === battle.slots[0].name) && G.battleModes.some((m) => m.name === battle.title), "!gs setup battle: a course and a mode");
}
check(chatGameSlugForCategory("28588", null) === G.slug && chatGameSlugForCategory(null, "Mario Kart 7") === G.slug, "Twitch category maps to Mario Kart 7");
check(resolveYouTubeGameFromTitle("MK7 with chat") === G.slug && resolveYouTubeGameFromTitle("Mario Kart 7 cups") === G.slug && resolveYouTubeGameFromTitle("Mario Kart 64 night") === "mario-kart-64", "YouTube titles find Mario Kart 7 (and leave 64 alone)");

// ── The space and the catalog ───────────────────────────────────────────────
const space = spaceById("retro-mario-kart")!;
const FIVE = "mario-kart-double-dash,mario-kart-ds,mario-kart-64,mario-kart-7,super-mario-kart";
check(space.games.join() === FIVE && (space.rollGames ?? []).map((g) => g.game).join() === FIVE, "the space and its switch: Double Dash, DS, 64, 7, Super Mario Kart");
check(space.main.href === "/randomizers/mario-kart-double-dash", "the main button stays Double Dash's roll");
check(spaceFor("MK7")?.id === "retro-mario-kart" && GAME_SPACES.filter((s) => s.games.includes(G.slug)).length === 1, "Mario Kart 7 belongs to the space, and only it");
check(spaceRollGames(space).length === 5 && spaceRoller(space, G.slug)?.slug === G.slug, "five games roll here outside production; the switch picks Mario Kart 7");
for (let n = 0; n < 30; n++) {
  const r = rollForSpace(space, G.slug)!;
  check(r.roll.game === G.slug && r.roll.slots.length === 4 && rollSigned(r.roll, r.sig) && r.reel.length === 4, "a Mario Kart 7 roll in the space, signed, with its reel");
}
check(space.tools.some((t) => t.href === "/randomizers/mario-kart-7") && space.tools.some((t) => t.href === "/tier-list-maker/mario-kart-7-tracks"), "the randomizer and track tier list in Tools");
for (const t of space.tools.filter((x) => x.href.startsWith("/tier-list-maker/"))) check(TIER_TEMPLATES.some((x) => `/tier-list-maker/${x.slug}` === t.href), `${t.label} exists`);
check(gameKey("mk7") === G.slug && catalogGame("Mario Kart 7")?.status === "live", "the game's names find it, live outside production");
check(NIGHT_GAMES.some((g) => g.slug === G.slug && g.unit === "race"), "a live-night game with placements");
check(randomizerPublic(G.slug) === MARIO_KART_7_PUBLIC && MARIO_KART_7_PUBLIC === false, "hidden while the flag is off");
for (const k of ["tracks", "characters"]) {
  const t = TIER_TEMPLATES.find((x) => x.slug === `mario-kart-7-${k}`);
  check(!!t && t.items.length > 0 && new Set(t.items.map((i) => i.label)).size === t.items.length && t.items.every((i) => onDisk(i.image ?? null)), `${k} tier list: names unique, pictures on disk`);
}
const landing = RANDOMIZER_LANDINGS[G.slug];
check(!!landing && landing.metaTitle.length <= 60 && landing.metaDescription.length <= 160, `landing copy within limits (${landing?.metaTitle.length}, ${landing?.metaDescription.length})`);
for (const f of ["public/images/opengraph/mario-kart-7-og.jpg", "public/images/mario-kart-7/mario-kart-7-keyart.webp", "public/images/box-art/mario-kart-7.webp"]) check(fs.existsSync(path.join(process.cwd(), f)), `${f} on disk`);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
