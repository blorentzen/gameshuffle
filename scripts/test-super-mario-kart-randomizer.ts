/**
 * Super Mario Kart randomizer checks (Retro Mario Kart picks 2026-11-12): the data against the game (Super Mario
 * Wiki's Super Mario Kart page), every picture on disk, two players never sharing a character, the class filter,
 * cups and their order, races, battle courses, saved setups, the chat roll and match setups, and the Retro Mario
 * Kart space's five-game switch.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-super-mario-kart-randomizer.ts
 */

import fs from "node:fs";
import path from "node:path";
import { SUPER_MARIO_KART as G } from "../src/data/super-mario-kart/super-mario-kart";
import { describeSuperMarioKartSetup } from "../src/data/super-mario-kart";
import {
  SMK_MAX_PLAYERS, battleArt, characterArt, characterPool, classOf, courseArt, cupArt, drawCharacters, rollBattleCourses, rollCharacter, rollCup,
  rollEngine, rollRaces,
} from "../src/lib/super-mario-kart/roll";
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
import { SUPER_MARIO_KART_PUBLIC, randomizerPublic } from "../src/lib/games-visibility";
import { rollForSpace, rollSigned, spaceRoller } from "../src/lib/rolls/spaceRoll";

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
const rng = rngFrom(19920827);
const onDisk = (src: string | null | undefined) => !!src && fs.existsSync(path.join(process.cwd(), "public", src));

// ── The roster ──────────────────────────────────────────────────────────────
check(G.characters.map((c) => c.name).join() === "Mario,Luigi,Princess,Yoshi,Bowser,Donkey Kong Jr.,Koopa Troopa,Toad", "the eight drivers, the game's names");
const PAIRS: Record<string, [string, string, string]> = {
  bros: ["The Bros.", "Mario", "Luigi"],
  dragon: ["The Dragon and The Lady", "Princess", "Yoshi"],
  showdown: ["The Showdown", "Bowser", "Donkey Kong Jr."],
  small: ["The Small Guys", "Koopa Troopa", "Toad"],
};
for (const [id, [name, a, b]] of Object.entries(PAIRS)) {
  check(G.classes.find((k) => k.id === id)?.name === name, `${name} is a class`);
  check(characterPool(G, [id as never]).map((c) => c.name).join() === `${a},${b}`, `${name}: ${a} and ${b}`);
  check(classOf(G, a)?.name === name && classOf(G, b)?.name === name, `${a} and ${b} are ${name}`);
}
check(G.classes.map((k) => k.line).join() === "Standard Performance,Fast Acceleration,High Top Speed,Good Control", "the manual's lines");
for (const c of G.characters) check(onDisk(characterArt(G, c.name)), `${c.name} picture on disk`);

// Two players, never the same character.
check(SMK_MAX_PLAYERS === 2, "two players at most");
const pairsSeen = new Set<string>();
for (let n = 0; n < 2000; n++) {
  const two = drawCharacters(G, 2, [], rng);
  check(two.length === 2 && two[0] !== two[1], "two players, two different characters");
  pairsSeen.add(two.join("|"));
  check(drawCharacters(G, 5, [], rng).length === 2, "never more than two");
  const one = drawCharacters(G, 2, ["showdown"], rng);
  check(one.sort().join() === "Bowser,Donkey Kong Jr.", "one class picked: its two drivers");
  check(rollCharacter(G, ["bros"], ["Mario"], rng) === "Luigi", "the other player's pick is never rolled");
}
check(pairsSeen.size === 56, `every ordered pair of different drivers comes up (${pairsSeen.size} of 56)`);

// ── Cups, races and battle courses ──────────────────────────────────────────
const CUPS: Record<string, string[]> = {
  "Mushroom Cup": ["Mario Circuit 1", "Donut Plains 1", "Ghost Valley 1", "Bowser Castle 1", "Mario Circuit 2"],
  "Flower Cup": ["Choco Island 1", "Ghost Valley 2", "Donut Plains 2", "Bowser Castle 2", "Mario Circuit 3"],
  "Star Cup": ["Koopa Beach 1", "Choco Island 2", "Vanilla Lake 1", "Bowser Castle 3", "Mario Circuit 4"],
  "Special Cup": ["Donut Plains 3", "Koopa Beach 2", "Ghost Valley 3", "Vanilla Lake 2", "Rainbow Road"],
};
check(G.cups.map((c) => c.name).join() === Object.keys(CUPS).join(), "four cups in order");
for (const [cup, courses] of Object.entries(CUPS)) check(G.cups.find((c) => c.name === cup)?.courses.map((c) => c.name).join() === courses.join(), `${cup}: five courses in order`);
const all = G.cups.flatMap((c) => c.courses);
check(all.length === 20 && new Set(all.map((c) => c.name)).size === 20, "20 different courses");
for (const c of all) check(onDisk(courseArt(G, c.name)), `${c.name} map on disk`);
for (const c of G.cups) check(onDisk(cupArt(G, c.slug)), `${c.name} emblem on disk`);
check(G.battleCourses.map((b) => b.name).join() === "Battle Course 1,Battle Course 2,Battle Course 3,Battle Course 4", "four battle courses");
for (const b of G.battleCourses) check(onDisk(battleArt(G, b.name)), `${b.name} map on disk`);
check(G.engines.join() === "50cc,100cc,150cc", "50cc, 100cc and 150cc (no Mirror)");
const engines = new Set<string>();
for (let n = 0; n < 300; n++) engines.add(rollEngine(G, [], rng));
check(engines.size === 3, "all three engine classes come up");
const cups = new Set<string>();
for (let n = 0; n < 200; n++) cups.add(rollCup(G, rng).name);
check(cups.size === 4, "all four cups come up");
for (const count of [5, 10, 15, 20]) for (let n = 0; n < 100; n++) {
  const list = rollRaces(G, count, rng);
  check(list.length === count && new Set(list.map((c) => c.name)).size === count, `${count} races, no course twice`);
}
for (const count of [1, 2, 4]) for (let n = 0; n < 100; n++) {
  const bs = rollBattleCourses(G, count, rng);
  check(bs.length === count && new Set(bs.map((b) => b.name)).size === count, `${count} battle courses, none twice`);
}

// ── Saved setups ────────────────────────────────────────────────────────────
const rows = describeSuperMarioKartSetup({
  type: "super-mario-kart-setup", gameSlug: G.slug,
  racers: [{ name: "Sam", character: "Toad" }, { name: "Jo", character: "Bowser" }],
  races: { title: "Star Cup", engine: "150cc", courses: CUPS["Star Cup"] }, battles: [{ course: "Battle Course 3", mode: "Balloon Battle" }],
});
check(rows.find((r) => r.label === "Racers")?.value === "Sam: Toad; Jo: Bowser", "saved setup names the racers");
check(rows.some((r) => r.label === "Star Cup, 150cc") && rows.some((r) => r.label === "Battle course" && r.value === "Battle Course 3"), "saved setup names the cup and battle course");
check(describeSuperMarioKartSetup({ gameSlug: "mario-kart-64" }).length === 0, "another game's setup reads empty");

// ── Chat ────────────────────────────────────────────────────────────────────
const chat = CHAT_GAMES[G.slug];
check(!!chat && chat.lobbyCap === 2 && chat.unique === true, "chat roll registered, two in the lobby, never the same character");
for (let n = 0; n < 300; n++) {
  const taken = n % 2 ? [G.characters[n % 8].name] : [];
  const r = chat.roll({ owned: null, arg: "", taken });
  const [racer] = r.slots;
  check(r.slots.length === 1 && racer.label === "Racer" && G.characters.some((c) => c.name === racer.name) && !taken.includes(racer.name), "chat roll: a racer the other player doesn't hold");
  check(racer.detail === classOf(G, racer.name)?.name && onDisk(racer.img), "chat roll names the class, picture on disk");
}
const setup = CHAT_SETUPS[G.slug];
check(!!setup && (setup.choices?.length ?? 0) === 3, "match setup registered");
for (let n = 0; n < 60; n++) {
  const cup = setup.roll({ arg: "", players: 2 });
  check(cup.slots.length === 5 && G.cups.some((c) => c.courses.map((x) => x.name).join() === cup.slots.map((s) => s.name).join()) && /Cup, (50cc|100cc|150cc)$/.test(cup.title ?? ""), `!gs setup: a cup's five courses in order (${cup.title})`);
  const many = setup.roll({ arg: "20", players: 2 });
  check(many.slots.length === 20 && new Set(many.slots.map((s) => s.name)).size === 20, "!gs setup 20: all 20, none twice");
  const battle = setup.roll({ arg: "battle", players: 2 });
  check(battle.slots.length === 1 && G.battleCourses.some((b) => b.name === battle.slots[0].name), "!gs setup battle: a battle course");
}
check(chatGameSlugForCategory("17470", null) === G.slug && chatGameSlugForCategory(null, "Super Mario Kart") === G.slug, "Twitch category maps to Super Mario Kart");
check(resolveYouTubeGameFromTitle("Super Mario Kart 150cc") === G.slug && resolveYouTubeGameFromTitle("SMK match races") === G.slug, "YouTube titles find Super Mario Kart");

// ── The space and the catalog ───────────────────────────────────────────────
const space = spaceById("retro-mario-kart")!;
check(space.games.at(-1) === G.slug && space.rollGames?.at(-1)?.game === G.slug, "Super Mario Kart is last on the switch");
check(spaceFor("SMK")?.id === "retro-mario-kart" && GAME_SPACES.filter((s) => s.games.includes(G.slug)).length === 1, "Super Mario Kart belongs to the space, and only it");
check(spaceRoller(space, G.slug)?.slug === G.slug, "the switch picks Super Mario Kart");
for (let n = 0; n < 30; n++) {
  const r = rollForSpace(space, G.slug)!;
  check(r.roll.game === G.slug && r.roll.slots.length === 1 && rollSigned(r.roll, r.sig), "a Super Mario Kart roll in the space, signed");
}
check(space.tools.some((t) => t.href === "/randomizers/super-mario-kart") && space.tools.some((t) => t.href === "/tier-list-maker/super-mario-kart-tracks"), "the randomizer and track tier list in Tools");
check(gameKey("smk") === G.slug && catalogGame("Super Mario Kart")?.status === "live", "the game's names find it, live outside production");
check(!NIGHT_GAMES.some((g) => g.slug === G.slug), "not a live-night game (two players only)");
check(randomizerPublic(G.slug) === SUPER_MARIO_KART_PUBLIC && SUPER_MARIO_KART_PUBLIC === false, "hidden while the flag is off");
for (const k of ["tracks", "characters"]) {
  const t = TIER_TEMPLATES.find((x) => x.slug === `super-mario-kart-${k}`);
  check(!!t && t.items.length > 0 && new Set(t.items.map((i) => i.label)).size === t.items.length && t.items.every((i) => onDisk(i.image ?? null)), `${k} tier list: names unique, pictures on disk`);
}
const landing = RANDOMIZER_LANDINGS[G.slug];
check(!!landing && landing.metaTitle.length <= 60 && landing.metaDescription.length <= 160, `landing copy within limits (${landing?.metaTitle.length}, ${landing?.metaDescription.length})`);
for (const f of ["public/images/opengraph/super-mario-kart-og.jpg", "public/images/super-mario-kart/super-mario-kart-keyart.webp", "public/images/box-art/super-mario-kart.webp"]) check(fs.existsSync(path.join(process.cwd(), f)), `${f} on disk`);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
