/**
 * Mario Kart DS randomizer checks (Retro Mario Kart picks 2026-11-12): the data against the game (Super Mario Wiki's
 * Mario Kart DS page), every picture on disk, the kart setting at each of its four steps over every character, the
 * options, cups and their order, races, battles, Mission Mode rolls, saved setups, the chat roll and match setups,
 * and the Retro Mario Kart space with its three-game switch, tier lists and landing.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-mario-kart-ds-randomizer.ts
 */

import fs from "node:fs";
import path from "node:path";
import { MARIO_KART_DS as G } from "../src/data/mario-kart-ds/mario-kart-ds";
import { describeMarioKartDsSetup } from "../src/data/mario-kart-ds";
import {
  DEFAULT_KART_LEVEL, KART_LEVELS, battleArt, bossArt, characterArt, characterPool, courseArt, cupArt, cupOf, drawRacers, kartArt,
  kartFits, kartLevel, kartNote, kartsFor, missionArt, missionId, missionPlace, missionPool, missionShows, missionTitle, rollBattles, rollCup,
  rollEngine, rollMissions, rollRacer, rollRaces,
} from "../src/lib/mario-kart-ds/roll";
import type { DsClass, DsKartLevel } from "../src/lib/mario-kart-ds/types";
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
import { MARIO_KART_DS_PUBLIC, randomizerPublic } from "../src/lib/games-visibility";
import { rollForSpace, rollSigned, spaceRollGames, spaceRoller } from "../src/lib/rolls/spaceRoll";

process.env.ACTIVITY_SESSION_SECRET ??= "test-only-secret";

let passed = 0;
let failed = 0;
function check(ok: boolean, label: string) {
  if (ok) passed++;
  else { failed++; console.log(`FAIL ${label}`); }
}
/** A seeded rng, so a failure can be rerun. */
function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const rng = rngFrom(20261112);
const onDisk = (src: string | null) => !!src && fs.existsSync(path.join(process.cwd(), "public", src));

// ── The roster ──────────────────────────────────────────────────────────────
check(G.characters.length === 12, `12 characters (got ${G.characters.length})`);
check(new Set(G.characters.map((c) => c.name)).size === 12, "character names unique");
check(!G.characters.some((c) => c.name === "Shy Guy"), "Shy Guy left out (DS Download Play only)");
const WEIGHTS: Record<DsClass, string[]> = {
  Light: ["Peach", "Yoshi", "Toad", "Dry Bones"],
  Medium: ["Mario", "Luigi", "Daisy", "Waluigi"],
  Heavy: ["Donkey Kong", "Wario", "Bowser", "R.O.B."],
};
for (const [cls, names] of Object.entries(WEIGHTS) as [DsClass, string[]][]) {
  check(G.characters.filter((c) => c.weight === cls).length === names.length, `${names.length} ${cls} characters`);
  for (const n of names) check(G.characters.find((c) => c.name === n)?.weight === cls, `${n} is ${cls}`);
}
const STARTERS = ["Mario", "Luigi", "Peach", "Yoshi", "Toad", "Donkey Kong", "Wario", "Bowser"];
check(G.characters.slice(0, 8).map((c) => c.name).join() === STARTERS.join(), "the eight starters in the game's order");
check(G.characters.filter((c) => c.unlock).map((c) => c.name).join() === "Daisy,Dry Bones,Waluigi,R.O.B.", "four unlockable characters");
check(/50cc Retro/.test(G.characters.find((c) => c.name === "Daisy")!.unlock!) && /50cc Nitro/.test(G.characters.find((c) => c.name === "Dry Bones")!.unlock!)
  && /100cc Retro/.test(G.characters.find((c) => c.name === "Waluigi")!.unlock!) && /Mirror/.test(G.characters.find((c) => c.name === "R.O.B.")!.unlock!), "unlock cups as the wiki gives them");
for (const c of G.characters) check(onDisk(characterArt(G, c.name)), `${c.name} picture on disk`);

// ── Karts ───────────────────────────────────────────────────────────────────
check(G.karts.length === 36, `36 karts (got ${G.karts.length})`);
check(new Set(G.karts.map((k) => k.name)).size === 36, "kart names unique");
for (const c of G.characters) {
  const own = G.karts.filter((k) => k.owner === c.name);
  check(own.length === 3 && own.map((k) => k.kind).sort().join() === "second,signature,standard", `${c.name} owns a signature, a standard and a second signature kart`);
}
check(G.karts.every((k) => G.characters.some((c) => c.name === k.owner)), "every kart's owner is on the roster");
for (const k of G.karts) check(onDisk(kartArt(G, k.name)), `${k.name} picture on disk`);
const SIGNATURE: Record<string, [string, string, string]> = {
  Mario: ["B Dasher", "Standard MR", "Shooting Star"], Luigi: ["Poltergust 4000", "Standard LG", "Streamliner"],
  Peach: ["Royale", "Standard PC", "Light Tripper"], Yoshi: ["Egg 1", "Standard YS", "Cucumber"],
  Toad: ["Mushmellow", "Standard TD", "4-Wheel Cradle"], "Donkey Kong": ["Rambi Rider", "Standard DK", "Wildlife"],
  Wario: ["Brute", "Standard WR", "Dragonfly"], Bowser: ["Tyrant", "Standard BW", "Hurricane"],
  Daisy: ["Power Flower", "Standard DS", "Light Dancer"], "Dry Bones": ["Banisher", "Standard DB", "Dry Bomber"],
  Waluigi: ["Gold Mantis", "Standard WL", "Zipper"], "R.O.B.": ["ROB-BLS", "Standard RB", "ROB-LGS"],
};
for (const [who, [sig, std, second]] of Object.entries(SIGNATURE)) {
  const k = (n: string) => G.karts.find((x) => x.name === n);
  check(k(sig)?.owner === who && k(sig)?.kind === "signature" && k(std)?.owner === who && k(std)?.kind === "standard" && k(second)?.owner === who && k(second)?.kind === "second", `${who}: ${sig}, ${std}, ${second}`);
}
// Borrowed karts (150cc): four other characters' signature karts each, every one taken by exactly two characters.
const borrowedBy = new Map<string, string[]>();
for (const c of G.characters) {
  check(c.borrows.length === 4 && new Set(c.borrows).size === 4, `${c.name} borrows four different karts`);
  for (const b of c.borrows) {
    const k = G.karts.find((x) => x.name === b);
    check(!!k && k.owner !== c.name && k.kind !== "standard", `${c.name} borrows ${b}: another character's signature kart`);
    borrowedBy.set(b, [...(borrowedBy.get(b) ?? []), c.name]);
  }
}
check(borrowedBy.size === 24 && [...borrowedBy.values()].every((v) => v.length === 2), "the 24 signature karts are each borrowed by two characters (48 in all)");
check(borrowedBy.get("Cucumber")?.sort().join() === "Dry Bones,Luigi", "the Cucumber goes to Luigi and Dry Bones (its own page)");
check(borrowedBy.get("ROB-LGS")?.sort().join() === "Bowser,Donkey Kong", "the ROB-LGS goes to Donkey Kong and Bowser (its own page)");

// The kart setting, step by step, over every character.
check(KART_LEVELS.map((l) => l.id).join() === "start,own,borrowed,all" && DEFAULT_KART_LEVEL === "own", "four steps, starting on each character's own karts");
check(kartLevel("nope") === "own" && kartLevel("all") === "all", "an unknown step reads as the default");
const EACH: Record<DsKartLevel, number> = { start: 2, own: 3, borrowed: 7, all: 36 };
let combos = 0;
for (const level of Object.keys(EACH) as DsKartLevel[]) {
  for (const c of G.characters) {
    const ks = kartsFor(G, c.name, level);
    check(ks.length === EACH[level], `${c.name}, ${level}: ${EACH[level]} karts (got ${ks.length})`);
    if (level === "start") check(ks.map((k) => k.kind).sort().join() === "signature,standard" && ks.every((k) => k.owner === c.name), `${c.name}, start: signature and standard`);
    if (level === "own") check(ks.every((k) => k.owner === c.name), `${c.name}, own: only their own`);
    if (level === "borrowed") check(ks.filter((k) => k.owner !== c.name).map((k) => k.name).sort().join() === [...c.borrows].sort().join(), `${c.name}, borrowed: their four`);
    if (level === "all") combos += ks.length;
    // Every allowed kart comes up, and nothing else does.
    const seen = new Set<string>();
    for (let n = 0; n < (level === "all" ? 3000 : 400); n++) {
      const r = rollRacer(G, { level, classes: [c.weight], unlockables: true }, [], rng);
      if (r.character !== c.name) continue;
      check(kartFits(G, r, level), `${level}: ${r.character} in ${r.kart} fits`);
      seen.add(r.kart);
    }
    check(seen.size === ks.length, `${c.name}, ${level}: all ${ks.length} karts come up (${seen.size})`);
  }
}
check(combos === 432, `every kart: 432 combinations (got ${combos})`);
check(!kartFits(G, { character: "Mario", kart: "Royale" }, "own") && kartFits(G, { character: "Mario", kart: "Royale" }, "all") && !kartFits(G, { character: "Mario", kart: "Shooting Star" }, "start"), "kartFits follows the step");
check(kartNote(G, { character: "Mario", kart: "B Dasher" }) === "Signature kart" && kartNote(G, { character: "Mario", kart: "Standard MR" }) === "Standard kart"
  && kartNote(G, { character: "Mario", kart: "Shooting Star" }) === "Second signature kart" && kartNote(G, { character: "Mario", kart: "Banisher" }) === "Dry Bones's signature kart", "kart notes");

// Options.
check(characterPool(G).length === 12 && characterPool(G, { unlockables: false }).length === 8, "unlockables switch: 12 or 8");
check(characterPool(G, { classes: ["Heavy"], unlockables: false }).map((c) => c.name).join() === "Donkey Kong,Wario,Bowser", "heavy starters");
for (let n = 0; n < 300; n++) {
  const room = drawRacers(G, 8, { unique: true }, rng);
  check(room.length === 8 && new Set(room.map((r) => r.character)).size === 8, "8 players, everyone a different character");
  check(room.every((r) => kartFits(G, r, DEFAULT_KART_LEVEL)), "every kart fits at the default step");
  const heavy = drawRacers(G, 6, { unique: true, classes: ["Heavy"] }, rng);
  check(heavy.length === 6 && new Set(heavy.map((r) => r.character)).size === 6, "6 players, heavy only, different characters: the class gives way");
  check(heavy.slice(0, 4).every((r) => G.characters.find((c) => c.name === r.character)?.weight === "Heavy"), "the heavy ones come first");
  const starters = drawRacers(G, 8, { unlockables: false }, rng);
  check(starters.every((r) => STARTERS.includes(r.character)), "unlockables off: only the eight starters");
}
let repeats = 0;
for (let n = 0; n < 200; n++) { const room = drawRacers(G, 8, {}, rng); if (new Set(room.map((r) => r.character)).size < 8) repeats++; }
check(repeats > 150, `repeats allowed by default, as in the game (${repeats} of 200 rooms had one)`);

// ── Cups and races ──────────────────────────────────────────────────────────
check(G.cups.map((c) => c.name).join() === "Mushroom Cup,Flower Cup,Star Cup,Special Cup,Shell Cup,Banana Cup,Leaf Cup,Lightning Cup", "eight cups in order");
check(G.cups.slice(0, 4).every((c) => c.kind === "nitro") && G.cups.slice(4).every((c) => c.kind === "retro"), "four Nitro, then four Retro");
check(G.cups.every((c) => c.courses.length === 4), "four courses a cup");
const all = G.cups.flatMap((c) => c.courses);
check(all.length === 32 && new Set(all.map((c) => c.name)).size === 32, "32 different courses");
const CUPS: Record<string, string[]> = {
  "Mushroom Cup": ["Figure-8 Circuit", "Yoshi Falls", "Cheep Cheep Beach", "Luigi's Mansion"],
  "Flower Cup": ["Desert Hills", "Delfino Square", "Waluigi Pinball", "Shroom Ridge"],
  "Star Cup": ["DK Pass", "Tick-Tock Clock", "Mario Circuit", "Airship Fortress"],
  "Special Cup": ["Wario Stadium", "Peach Gardens", "Bowser Castle", "Rainbow Road"],
  "Shell Cup": ["SNES Mario Circuit 1", "N64 Moo Moo Farm", "GBA Peach Circuit", "GCN Luigi Circuit"],
  "Banana Cup": ["SNES Donut Plains 1", "N64 Frappe Snowland", "GBA Bowser Castle 2", "GCN Baby Park"],
  "Leaf Cup": ["SNES Koopa Beach 2", "N64 Choco Mountain", "GBA Luigi Circuit", "GCN Mushroom Bridge"],
  "Lightning Cup": ["SNES Choco Island 2", "N64 Banshee Boardwalk", "GBA Sky Garden", "GCN Yoshi Circuit"],
};
for (const [cup, courses] of Object.entries(CUPS)) check(G.cups.find((c) => c.name === cup)?.courses.map((c) => c.name).join() === courses.join(), `${cup}: ${courses.join(", ")}`);
for (const c of G.cups.filter((x) => x.kind === "retro")) check(c.courses.map((x) => x.name.split(" ")[0]).join() === "SNES,N64,GBA,GCN", `${c.name}: SNES, N64, GBA, GCN in that order`);
check(all.filter((c) => c.laps !== 3).map((c) => `${c.name} ${c.laps}`).join() === "GCN Baby Park 5", "every course 3 laps but GCN Baby Park (5)");
for (const c of all) check(onDisk(courseArt(G, c.name)), `${c.name} picture on disk`);
for (const c of G.cups) check(onDisk(cupArt(G, c.slug)), `${c.name} emblem on disk`);
check(cupOf(G, "GCN Baby Park")?.name === "Banana Cup", "cupOf finds the cup");
for (let n = 0; n < 200; n++) {
  check(rollCup(G, "nitro", rng).kind === "nitro" && rollCup(G, "retro", rng).kind === "retro", "Nitro and Retro cups keep to their kind");
}
const cupsSeen = new Set<string>();
for (let n = 0; n < 400; n++) cupsSeen.add(rollCup(G, "any", rng).name);
check(cupsSeen.size === 8, "all eight cups come up");
for (const count of [4, 8, 12, 16, 32]) {
  for (let n = 0; n < 100; n++) {
    const list = rollRaces(G, count, rng);
    check(list.length === count && new Set(list.map((c) => c.name)).size === count, `${count} races, no course twice`);
  }
}
const enginesSeen = new Set<string>();
for (let n = 0; n < 400; n++) enginesSeen.add(rollEngine(G, [], rng));
check(G.engines.join() === "50cc,100cc,150cc,Mirror" && enginesSeen.size === 4, "four engine classes, all come up");
for (let n = 0; n < 200; n++) check(["150cc", "Mirror"].includes(rollEngine(G, ["150cc", "Mirror"], rng)), "engine classes keep to the ones picked");

// ── Battle ──────────────────────────────────────────────────────────────────
check(G.battleCourses.map((b) => b.name).join() === "Nintendo DS,Twilight House,Palm Shore,Tart Top,Block Fort,Pipe Plaza", "six battle courses, the retro ones without a console in front");
check(G.battleModes.map((m) => m.name).join() === "Balloon Battle,Shine Runners", "the two battle modes");
for (const b of G.battleCourses) check(onDisk(battleArt(G, b.name)), `${b.name} picture on disk`);
for (const count of [1, 3, 5]) {
  for (let n = 0; n < 100; n++) {
    const bs = rollBattles(G, count, {}, rng);
    check(bs.length === count && new Set(bs.map((b) => b.course)).size === count, `${count} battles, no course twice`);
    check(rollBattles(G, count, { modes: ["shine"] }, rng).every((b) => b.mode === "Shine Runners"), `${count} battles: Shine Runners only`);
  }
}

// ── Mission Mode ────────────────────────────────────────────────────────────
check(G.missions.length === 63, `63 missions: 7 levels of 8 and a boss (got ${G.missions.length})`);
for (let level = 1; level <= 7; level++) {
  const ms = G.missions.filter((m) => m.level === level);
  check(ms.map((m) => m.number).join() === "1,2,3,4,5,6,7,8,9", `Level ${level}: missions 1 to 8, then the boss`);
  check(!!ms[8].boss && ms.slice(0, 8).every((m) => !m.boss), `Level ${level}: the boss is last`);
}
check(G.missions.filter((m) => m.boss).map((m) => m.boss).join() === "Big Bully,Eyerok,Goomboss,King Boo,Big Bob-omb,Chief Chilly,Wiggler", "the seven bosses in order");
check(new Set(G.missions.map(missionId)).size === 63, "mission ids unique");
const courseNames = new Set([...all.map((c) => c.name), ...G.battleCourses.map((b) => b.name)]);
for (const m of G.missions) {
  check(G.characters.some((c) => c.name === m.character) && STARTERS.includes(m.character), `${missionId(m)}: a starting character (${m.character})`);
  check(m.course === null ? !!m.boss : courseNames.has(m.course), `${missionId(m)}: plays on a known course (${m.course})`);
  check(m.time === null || /^\d:\d\d$/.test(m.time), `${missionId(m)}: time limit ${m.time}`);
  check(/[!.]$/.test(m.text) && !/[\u2013\u2014]/.test(m.text), `${missionId(m)}: the game's text`);
  check(onDisk(missionArt(G, m)), `${missionId(m)}: picture on disk`);
  const shows = missionShows(G, m);
  check(missionArt(G, m) === (shows.kind === "boss" ? bossArt(G, shows.name) : courseArt(G, shows.name) ?? battleArt(G, shows.name)), `${missionId(m)}: the picture is what the caption names (${shows.name})`);
}
check(G.missions.filter((m) => m.reverse).map(missionId).join() === "4-1,5-7,6-8", "three missions driven the other way");
check(missionTitle(G.missions[0]) === "Mission 1-1" && missionTitle(G.missions[8]) === "Level 1 boss", "mission titles");
check(missionPlace(G.missions[8]) === "A boss arena" && missionPlace(G.missions.find((m) => missionId(m) === "4-1")!) === "DK Pass, driven the other way", "mission places");
for (const b of G.bosses) check(onDisk(bossArt(G, b.name)), `${b.name} picture on disk`);
check(missionPool(G).length === 54 && missionPool(G).every((m) => m.level <= 6), "by default: Levels 1 to 6 with bosses (54)");
check(missionPool(G, { level7: true }).length === 63, "Level 7 on: all 63");
check(missionPool(G, { bosses: false }).length === 48 && missionPool(G, { bosses: false }).every((m) => m.number !== 9), "bosses off: 48 missions");
check(missionPool(G, { level: 7 }).length === 9 && missionPool(G, { level: 7 }).every((m) => m.level === 7), "picking Level 7 rolls it even with the switch off");
check(missionPool(G, { level: 3, bosses: false }).length === 8, "one level without its boss: 8");
for (const count of [1, 3, 5]) {
  for (let n = 0; n < 200; n++) {
    const ms = rollMissions(G, count, {}, rng);
    check(ms.length === count && new Set(ms.map(missionId)).size === count && ms.every((m) => m.level <= 6), `${count} missions, different, Levels 1 to 6`);
    const lv = 1 + (n % 7);
    check(rollMissions(G, count, { level: lv, bosses: false }, rng).every((m) => m.level === lv && m.number !== 9), `${count} missions from Level ${lv}, no boss`);
  }
}

// ── Saved setups ────────────────────────────────────────────────────────────
const rows = describeMarioKartDsSetup({
  type: "mario-kart-ds-setup", gameSlug: G.slug, level: "borrowed",
  racers: [{ name: "Sam", character: "Dry Bones", kart: "Cucumber" }, { name: "Jo", character: "R.O.B.", kart: "ROB-BLS" }],
  races: { title: "Lightning Cup", engine: "Mirror", courses: CUPS["Lightning Cup"] }, battles: [{ course: "Tart Top", mode: "Shine Runners" }],
  missions: ["3-3", "6-boss"],
});
check(rows.find((r) => r.label === "Racers")?.value === "Sam: Dry Bones (Cucumber); Jo: R.O.B. (ROB-BLS)", "saved setup names everyone's character and kart");
check(rows.find((r) => r.label === "Karts")?.value === "Own karts and four borrowed", "saved setup names the kart step");
check(rows.some((r) => r.label === "Lightning Cup, Mirror" && r.value === CUPS["Lightning Cup"].join(", ")), "saved setup names the cup and engine class");
check(rows.some((r) => r.label === "Battle" && r.value === "Shine Runners on Tart Top"), "saved setup names the battle");
check(rows.some((r) => r.label === "Missions" && r.value.startsWith("Mission 3-3: Collect all 15 coins") && r.value.includes("Level 6 boss:")), "saved setup names the missions");
check(describeMarioKartDsSetup({ gameSlug: "mario-kart-wii" }).length === 0, "another game's setup reads empty");

// ── Chat ────────────────────────────────────────────────────────────────────
const chat = CHAT_GAMES[G.slug];
check(!!chat && chat.lobbyCap === 8 && !chat.unique, "chat roll registered, a room of eight, repeats allowed");
for (let n = 0; n < 400; n++) {
  const args = ["", "start", "all", "heavy", "borrowed light"];
  const arg = args[n % args.length];
  const r = chat.roll({ owned: null, arg, taken: [] });
  const [who, kart] = r.slots;
  const racer = { character: who.name, kart: kart.name };
  check(r.game === G.slug && r.slots.length === 2 && who.label === "Character" && kart.label === "Kart", "chat roll: character and kart");
  const level: DsKartLevel = arg === "start" ? "start" : arg === "all" ? "all" : arg.startsWith("borrowed") ? "borrowed" : "own";
  check(kartFits(G, racer, level), `chat roll fits the ${level} step: ${r.text}`);
  if (arg === "heavy") check(G.characters.find((c) => c.name === who.name)?.weight === "Heavy", "!gs-shuffle heavy gives a heavy character");
  if (arg === "borrowed light") check(G.characters.find((c) => c.name === who.name)?.weight === "Light", "!gs-shuffle borrowed light gives a light character");
  check(r.text.startsWith(`🧑 ${who.name} · 🏎️ ${kart.name} (`) && kart.detail === kartNote(G, racer), "chat line names the character, kart and what it is");
  check(onDisk(who.img ?? null) && onDisk(kart.img ?? null), "chat roll pictures on disk");
}
const setup = CHAT_SETUPS[G.slug];
check(!!setup && (setup.choices?.length ?? 0) === 4, "match setup registered with four choices");
for (let n = 0; n < 60; n++) {
  const cup = setup.roll({ arg: "", players: 4 });
  check(cup.kind === "setup" && cup.slots.length === 4 && /Cup, (50cc|100cc|150cc|Mirror)$/.test(cup.title ?? ""), `!gs setup: a cup and engine (${cup.title})`);
  check(G.cups.some((c) => c.courses.map((x) => x.name).join() === cup.slots.map((s) => s.name).join()), "!gs setup: the cup's courses in order");
  const retro = setup.roll({ arg: "retro", players: 4 });
  check(G.cups.filter((c) => c.kind === "retro").some((c) => (retro.title ?? "").startsWith(c.name)), "!gs setup retro: a Retro cup");
  const nitro = setup.roll({ arg: "nitro", players: 4 });
  check(G.cups.filter((c) => c.kind === "nitro").some((c) => (nitro.title ?? "").startsWith(c.name)), "!gs setup nitro: a Nitro cup");
  const many = setup.roll({ arg: "32", players: 8 });
  check(many.slots.length === 32 && new Set(many.slots.map((s) => s.name)).size === 32, "!gs setup 32: all 32, none twice");
  const battle = setup.roll({ arg: "battle", players: 4 });
  check(battle.slots.length === 1 && G.battleCourses.some((b) => b.name === battle.slots[0].name) && G.battleModes.some((m) => m.name === battle.title), "!gs setup battle: a course and a mode");
  const mission = setup.roll({ arg: "mission", players: 1 });
  const m = G.missions.find((x) => x.text === mission.slots[0]?.name && missionTitle(x) === mission.title);
  check(!!m && m.level <= 6 && mission.slots[1]?.name === m.character && mission.text.startsWith(`🎯 ${mission.title}: `), `!gs setup mission: a mission from Levels 1 to 6 (${mission.title})`);
  check(!(cup.title ?? "").includes(": ") && !(mission.title ?? "").includes(": "), "setup titles never hold the colon the line splits at");
}
check(chatGameSlugForCategory("5993", null) === G.slug && chatGameSlugForCategory(null, "Mario Kart DS") === G.slug, "Twitch category maps to Mario Kart DS");
check(resolveYouTubeGameFromTitle("MKDS night with chat!") === G.slug && resolveYouTubeGameFromTitle("Mario Kart DS Mirror cups") === G.slug
  && resolveYouTubeGameFromTitle("Mario Kart 8 Deluxe lounge") === "mario-kart-8-deluxe", "YouTube titles find Mario Kart DS (and leave 8 Deluxe alone)");

// ── The space, the switch, the catalog ─────────────────────────────────────
const space = spaceById("retro-mario-kart")!;
check(space.games.join() === "mario-kart-double-dash,mario-kart-ds,mario-kart-64,mario-kart-7,super-mario-kart" && space.primary === "mario-kart-double-dash", "the space's games: Double Dash, Mario Kart DS, Mario Kart 64, Mario Kart 7, Super Mario Kart");
check((space.rollGames ?? []).map((g) => g.game).join() === "mario-kart-double-dash,mario-kart-ds,mario-kart-64,mario-kart-7,super-mario-kart", "the switch: Double Dash, Mario Kart DS, Mario Kart 64, Mario Kart 7, Super Mario Kart");
check(space.main.href === "/randomizers/mario-kart-double-dash", "the main button stays Double Dash's roll");
check(spaceFor("mario-kart-ds")?.id === "retro-mario-kart" && spaceFor("MKDS")?.id === "retro-mario-kart", "Mario Kart DS belongs to the space");
check(GAME_SPACES.filter((s) => s.games.includes(G.slug)).length === 1, "Mario Kart DS is in one space only");
check(space.tools.some((t) => t.href === "/randomizers/mario-kart-ds") && space.tools.some((t) => t.href === "/tier-list-maker/mario-kart-ds-tracks"), "the DS randomizer and track tier list in Tools");
for (const t of space.tools.filter((x) => x.href.startsWith("/tier-list-maker/"))) check(TIER_TEMPLATES.some((x) => `/tier-list-maker/${x.slug}` === t.href), `${t.label} exists`);
check(!/Mario Kart DS/.test(space.ideas?.line ?? "") && !space.ideas?.starters.some((x) => /\bDS\b/.test(x)), "Ideas no longer asks for Mario Kart DS");
check(spaceRollGames(space).length === 5, "all five games roll here outside production");
check(spaceRoller(space, G.slug)?.slug === G.slug && spaceRoller(space)?.slug === "mario-kart-double-dash", "the switch picks Mario Kart DS; the default stays Double Dash");
for (let n = 0; n < 40; n++) {
  const ds = rollForSpace(space, G.slug)!;
  check(ds.roll.game === G.slug && ds.roll.slots.length === 2 && rollSigned(ds.roll, ds.sig) && ds.reel.length === 2, "a Mario Kart DS roll in the space, signed, with its reel");
  check(kartFits(G, { character: ds.roll.slots[0].name, kart: ds.roll.slots[1].name }, DEFAULT_KART_LEVEL), "the space roll uses the kart setting's default");
}
check(gameKey("MKDS") === G.slug && gameKey("mkds") === G.slug && catalogGame("Mario Kart DS")?.slug === G.slug, "the game's names find it");
check(catalogGame("MKDS")?.status === "live", "catalog: live outside production");
check(NIGHT_GAMES.some((g) => g.slug === G.slug && g.unit === "race"), "a live-night game with placements");
check(randomizerPublic(G.slug) === MARIO_KART_DS_PUBLIC && MARIO_KART_DS_PUBLIC === false, "hidden while the flag is off");
check(["tracks", "characters", "karts"].every((k) => (TIER_TEMPLATES.find((t) => t.slug === `mario-kart-ds-${k}`)?.items.length ?? 0) > 0), "three tier lists (outside production)");
for (const k of ["tracks", "characters", "karts"]) {
  const t = TIER_TEMPLATES.find((x) => x.slug === `mario-kart-ds-${k}`)!;
  check(new Set(t.items.map((i) => i.label)).size === t.items.length && t.items.every((i) => onDisk(i.image ?? null)), `${k} tier list: names unique, pictures on disk`);
}
const landing = RANDOMIZER_LANDINGS[G.slug];
check(!!landing && landing.metaTitle.length <= 60 && landing.metaDescription.length <= 160, `landing copy within limits (${landing?.metaTitle.length}, ${landing?.metaDescription.length})`);
check(fs.existsSync(path.join(process.cwd(), "public/images/opengraph/mario-kart-ds-og.jpg")), "share image on disk");
check(fs.existsSync(path.join(process.cwd(), "public/images/mario-kart-ds/mario-kart-ds-keyart.webp")) && fs.existsSync(path.join(process.cwd(), "public/images/box-art/mario-kart-ds.webp")), "header art and box art on disk");

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
