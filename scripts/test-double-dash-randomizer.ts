/**
 * Mario Kart: Double Dash!! randomizer checks (Retro Mario Kart picks 2026-11-12): the data against the game (Super
 * Mario Wiki's Double Dash page and the instruction booklet's kart chart), every picture on disk, the kart rule over
 * every pair, special items, cups, the All Cup Tour's order, races, battles, two-to-a-kart pairing (odd counts too),
 * the chat roll and match setups, and the Retro Mario Kart space, its game switch, tier lists and landing.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-double-dash-randomizer.ts
 */

import fs from "node:fs";
import path from "node:path";
import { DOUBLE_DASH as G } from "../src/data/double-dash/double-dash";
import { describeDoubleDashSetup } from "../src/data/double-dash";
import {
  DD_CLASSES, battlePool, characterArt, characterPool, chunkPeople, courseArt, cupArt, drawPairs, kartArt, kartClass, kartFits,
  kartsFor, modeArt, pairClass, pairPeople, pairSpecials, rollAllCupTour, rollBattles, rollCup, rollEngine, rollPair, rollRaces,
  specialArt, specialLine, battleArt, type DdPair,
} from "../src/lib/double-dash/roll";
import type { DdClass } from "../src/lib/double-dash/types";
import { CHAT_GAMES } from "../src/lib/twitch/chatGames";
import { CHAT_SETUPS } from "../src/lib/twitch/chatSetups";
import { chatGameSlugForCategory } from "../src/lib/twitch/chatGameCategories";
import { RANDOMIZER_LANDINGS } from "../src/data/randomizer-landings";
import { TIER_TEMPLATES } from "../src/data/tier-templates";
import { spaceById, spaceFor, spaceTabs, GAME_SPACES } from "../src/lib/games/spaces";
import { gameKey } from "../src/lib/games/key";
import { catalogGame } from "../src/data/game-catalog";
import { NIGHT_GAMES } from "../src/lib/nights/games";
import { DOUBLE_DASH_PUBLIC, randomizerPublic } from "../src/lib/games-visibility";
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
const onDisk = (src: string | null) => !!src && fs.existsSync(path.join(process.cwd(), "public", src));

// ── The roster ──────────────────────────────────────────────────────────────
check(G.characters.length === 20, `20 characters (got ${G.characters.length})`);
check(new Set(G.characters.map((c) => c.name)).size === 20, "character names unique");
const WEIGHTS: Record<DdClass, string[]> = {
  Light: ["Baby Mario", "Baby Luigi", "Koopa", "Paratroopa", "Diddy Kong", "Bowser Jr.", "Toad", "Toadette"],
  Medium: ["Mario", "Luigi", "Peach", "Daisy", "Yoshi", "Birdo", "Waluigi"],
  Heavy: ["Donkey Kong", "Bowser", "Wario", "Petey Piranha", "King Boo"],
};
for (const [cls, names] of Object.entries(WEIGHTS) as [DdClass, string[]][]) {
  check(G.characters.filter((c) => c.weight === cls).length === names.length, `${names.length} ${cls} characters`);
  for (const n of names) check(G.characters.find((c) => c.name === n)?.weight === cls, `${n} is ${cls}`);
}
// The game's ten teams of two, as on the character select screen.
const teams = new Map<string, string[]>();
for (const c of G.characters) teams.set(c.team, [...(teams.get(c.team) ?? []), c.name]);
check(teams.size === 10 && [...teams.values()].every((t) => t.length === 2), "ten teams of two");
const SPECIAL: Record<string, string> = {
  Mario: "Fireballs", Luigi: "Fireballs", Peach: "Heart", Daisy: "Heart", Yoshi: "Yoshi's Egg", Birdo: "Birdo's Egg",
  "Baby Mario": "Chain Chomp", "Baby Luigi": "Chain Chomp", Koopa: "Triple Shells", Paratroopa: "Triple Shells",
  "Donkey Kong": "Giant Banana", "Diddy Kong": "Giant Banana", Bowser: "Bowser's Shell", "Bowser Jr.": "Bowser's Shell",
  Wario: "Bob-omb", Waluigi: "Bob-omb", Toad: "Golden Mushroom", Toadette: "Golden Mushroom",
  "Petey Piranha": "Any special item", "King Boo": "Any special item",
};
for (const c of G.characters) check(G.specials[c.special].name === SPECIAL[c.name], `${c.name}'s special is ${SPECIAL[c.name]}`);
check(G.characters.filter((c) => c.unlock).map((c) => c.name).sort().join() === ["King Boo", "Petey Piranha", "Toad", "Toadette"].join(), "four unlockable characters");
for (const c of G.characters) check(onDisk(characterArt(G, c.name)), `${c.name}'s icon on disk`);
for (const s of Object.values(G.specials)) if (s.slug) check(onDisk(specialArt(G, s)), `${s.name} icon on disk`);

// ── Karts ───────────────────────────────────────────────────────────────────
check(G.karts.length === 21, `21 karts (got ${G.karts.length})`);
check(new Set(G.karts.map((k) => k.name)).size === 21, "kart names unique");
check(G.karts.filter((k) => k.weight === "Light").length === 8 && G.karts.filter((k) => k.weight === "Medium").length === 7 && G.karts.filter((k) => k.weight === "Heavy").length === 5, "8 light, 7 medium, 5 heavy karts");
check(G.karts.filter((k) => k.weight === null).map((k) => k.name).join() === "Parade Kart", "only the Parade Kart takes any pair");
for (const k of G.karts) {
  if (k.owner) check(G.characters.find((c) => c.name === k.owner)?.weight === k.weight, `${k.name} is its owner's class`);
  check(onDisk(kartArt(G, k.name)), `${k.name} art on disk`);
}
check(G.karts.filter((k) => !k.unlock).map((k) => k.name).sort().join() === ["DK Jumbo", "Goo-Goo Buggy", "Heart Coach", "Koopa Dasher", "Koopa King", "Red Fire", "Turbo Yoshi", "Wario Car"].join(), "the eight starting karts");

// ── The kart rule over every pair ───────────────────────────────────────────
check(kartClass("Light", "Light") === "Light" && kartClass("Light", "Medium") === "Medium" && kartClass("Medium", "Light") === "Medium", "light + medium = medium");
check(kartClass("Medium", "Medium") === "Medium" && kartClass("Light", "Heavy") === "Heavy" && kartClass("Heavy", "Medium") === "Heavy" && kartClass("Heavy", "Heavy") === "Heavy", "anyone + heavy = heavy");
let pairs = 0;
for (const a of G.characters) {
  for (const b of G.characters) {
    if (a === b) continue;
    pairs++;
    const cls = kartClass(a.weight, b.weight);
    const allowed = kartsFor(G, cls);
    check(allowed.every((k) => k.weight === cls || k.weight === null), `${a.name} + ${b.name}: only ${cls} karts or the Parade Kart`);
    check(allowed.some((k) => k.name === "Parade Kart"), `${a.name} + ${b.name}: the Parade Kart fits`);
    // Every kart in the game: fits exactly when it's the pair's class (or the Parade Kart).
    for (const k of G.karts) check(kartFits(G, { driver: a.name, thrower: b.name, kart: k.name }) === (k.weight === null || k.weight === cls), `${a.name} + ${b.name} in ${k.name}`);
  }
}
check(pairs === 380, "every ordered pair checked");
check(kartsFor(G, "Light", { unlockKarts: false, parade: false }).map((k) => k.name).sort().join() === "Goo-Goo Buggy,Koopa Dasher", "new save: two light karts");
check(kartsFor(G, "Heavy", { parade: false }).every((k) => k.weight === "Heavy"), "no Parade Kart when it's off");
check(!kartFits(G, { driver: "Mario", thrower: "Mario", kart: "Red Fire" }), "a character can't share a kart with themself");

// ── Rolls ───────────────────────────────────────────────────────────────────
const rng = rngFrom(20261112);
const OPTION_SETS = [
  {}, { classes: ["Light"] as DdClass[] }, { classes: ["Medium"] as DdClass[] }, { classes: ["Heavy"] as DdClass[] },
  { classes: ["Light", "Heavy"] as DdClass[] }, { teams: true }, { teams: true, classes: ["Light"] as DdClass[] },
  { toads: false, bosses: false }, { unlockKarts: false, parade: false }, { parade: false },
];
for (const [i, o] of OPTION_SETS.entries()) {
  const chars = characterPool(G, o);
  for (let n = 0; n < 400; n++) {
    const p = rollPair(G, o, [], rng);
    const cls = pairClass(G, p)!;
    check(kartFits(G, p), `options ${i}: ${p.driver} + ${p.thrower} fits ${p.kart}`);
    check(p.driver !== p.thrower, `options ${i}: two different characters`);
    check(chars.some((c) => c.name === p.driver) && chars.some((c) => c.name === p.thrower), `options ${i}: characters from the pool`);
    if (o.classes?.length) check(o.classes.includes(cls), `options ${i}: kart class ${cls} allowed`);
    if (o.teams) check(G.characters.find((c) => c.name === p.driver)!.team === G.characters.find((c) => c.name === p.thrower)!.team, `options ${i}: the game's own pair`);
    const k = G.karts.find((x) => x.name === p.kart)!;
    if (o.unlockKarts === false) check(!k.unlock || k.weight === null, `options ${i}: a starting kart`);
    if (o.parade === false) check(k.weight !== null, `options ${i}: no Parade Kart`);
  }
}
// Both roles and every class turn up.
const seenRoles = new Set<string>();
const seenClasses = new Set<string>();
let parades = 0;
for (let n = 0; n < 3000; n++) {
  const p = rollPair(G, {}, [], rng);
  seenRoles.add(`${p.driver}>${p.thrower}`);
  seenClasses.add(pairClass(G, p)!);
  if (p.kart === "Parade Kart") parades++;
}
check(seenRoles.size > 250, `many ordered pairs come up (${seenRoles.size})`);
check(DD_CLASSES.every((c) => seenClasses.has(c)), "light, medium and heavy karts all come up");
check(parades > 50 && parades < 700, `the Parade Kart turns up sometimes (${parades} of 3000)`);
// A room of up to 8 karts: 16 different characters.
for (let n = 0; n < 300; n++) {
  const count = 1 + (n % 8);
  const room = drawPairs(G, count, {}, rng);
  const names = room.flatMap((p) => [p.driver, p.thrower]);
  check(room.length === count && new Set(names).size === names.length, `${count} karts: nobody shares a character`);
  check(room.every((p) => kartFits(G, p)), `${count} karts: every kart fits`);
}
// A filter the room outgrows gives way before characters repeat: light pairs only, 8 karts.
const light = drawPairs(G, 8, { classes: ["Light"] }, rng);
const lightNames = light.flatMap((p) => [p.driver, p.thrower]);
check(new Set(lightNames).size === 16 && light.every((p) => kartFits(G, p)), "8 karts with Light only: still different characters, all fitting");
check(light.slice(0, 4).every((p) => pairClass(G, p) === "Light"), "the first four light pairs are light");
// Refreshing one kart avoids the others' characters.
const room = drawPairs(G, 4, {}, rng);
const taken = room.slice(1).flatMap((p) => [p.driver, p.thrower]);
for (let n = 0; n < 200; n++) {
  const p = rollPair(G, {}, taken, rng);
  check(!taken.includes(p.driver) && !taken.includes(p.thrower), "a refreshed kart takes characters nobody else has");
}

// ── Special items ───────────────────────────────────────────────────────────
const line = (a: string, b: string) => specialLine(G, { driver: a, thrower: b });
check(line("Mario", "Luigi") === "Fireballs", `Mario and Luigi: Fireballs (got ${line("Mario", "Luigi")})`);
check(line("Bowser Jr.", "Bowser") === "Bowser's Shell", "Bowser Jr. and Bowser: Bowser's Shell");
check(line("Peach", "Wario") === "Heart and Bob-omb", `Peach and Wario: Heart and Bob-omb (got ${line("Peach", "Wario")})`);
check(line("Toad", "King Boo") === "Golden Mushroom and any special item", `Toad and King Boo (got ${line("Toad", "King Boo")})`);
check(line("King Boo", "Toad") === "Any special item and Golden Mushroom", `King Boo and Toad (got ${line("King Boo", "Toad")})`);
check(line("Petey Piranha", "King Boo") === "Any special item", "Petey and King Boo: any special item");
check(line("Yoshi", "Birdo") === "Yoshi's Egg and Birdo's Egg", "Yoshi and Birdo: both eggs");
check(pairSpecials(G, { driver: "Mario", thrower: "Luigi" })[0].slug === "fireballs-red", "the driver's special comes first");
for (const a of G.characters) for (const b of G.characters) if (a !== b) check(pairSpecials(G, { driver: a.name, thrower: b.name }).length === (G.specials[a.special].name === G.specials[b.special].name ? 1 : 2), `${a.name} + ${b.name}: specials counted once each`);

// ── Cups, the All Cup Tour, races ───────────────────────────────────────────
const CUPS: Record<string, string[]> = {
  "Mushroom Cup": ["Luigi Circuit", "Peach Beach", "Baby Park", "Dry Dry Desert"],
  "Flower Cup": ["Mushroom Bridge", "Mario Circuit", "Daisy Cruiser", "Waluigi Stadium"],
  "Star Cup": ["Sherbet Land", "Mushroom City", "Yoshi Circuit", "DK Mountain"],
  "Special Cup": ["Wario Colosseum", "Dino Dino Jungle", "Bowser's Castle", "Rainbow Road"],
};
check(G.cups.map((c) => c.name).join() === Object.keys(CUPS).join(), "four cups in order");
for (const c of G.cups) {
  check(c.courses.map((x) => x.name).join() === CUPS[c.name].join(), `${c.name}'s courses in order`);
  check(onDisk(cupArt(G, c.slug)), `${c.name} icon on disk`);
}
check(onDisk(cupArt(G, "all-cup-tour")), "All Cup Tour icon on disk");
const all = G.cups.flatMap((c) => c.courses);
for (const c of all) {
  check(c.laps === (c.name === "Baby Park" ? 7 : c.name === "Wario Colosseum" ? 2 : 3), `${c.name}: ${c.laps} laps`);
  check(onDisk(courseArt(G, c.name)), `${c.name} picture on disk`);
}
const cupsSeen = new Set<string>();
for (let n = 0; n < 200; n++) cupsSeen.add(rollCup(G, rng).name);
check(cupsSeen.size === 4, "every cup comes up");
const middles = new Set<string>();
for (let n = 0; n < 500; n++) {
  const tour = rollAllCupTour(G, rng);
  check(tour.length === 16 && new Set(tour.map((c) => c.name)).size === 16, "the tour runs all 16 courses once");
  check(tour[0].name === "Luigi Circuit" && tour[15].name === "Rainbow Road", "Luigi Circuit first, Rainbow Road last");
  middles.add(tour[1].name);
}
check(middles.size === 14, `the rest come in a random order (${middles.size} different second races)`);
for (const count of [4, 8, 12, 16]) {
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
check(G.battleCourses.length === 6 && battlePool(G, false).length === 4, "six battle courses, four from the start");
check(G.battleModes.map((m) => m.name).join() === "Balloon Battle,Shine Thief,Bob-omb Blast", "the three battle modes");
for (const b of G.battleCourses) check(onDisk(battleArt(G, b.name)), `${b.name} picture on disk`);
for (const m of G.battleModes) check(onDisk(modeArt(G, m.name)), `${m.name} icon on disk`);
for (const count of [1, 3, 5]) {
  for (let n = 0; n < 100; n++) {
    const bs = rollBattles(G, count, {}, rng);
    check(bs.length === count && new Set(bs.map((b) => b.course)).size === count, `${count} battles, no course twice`);
    const four = rollBattles(G, count, { unlockables: false, modes: ["shine"] }, rng);
    check(four.every((b) => b.mode === "Shine Thief" && battlePool(G, false).some((c) => c.name === b.course)), `${count} battles: starting courses, Shine Thief only`);
  }
}

// ── Two to a kart ───────────────────────────────────────────────────────────
for (let people = 1; people <= 8; people++) {
  const ids = Array.from({ length: people }, (_, i) => i + 1);
  for (let n = 0; n < 60; n++) {
    const karts = pairPeople(ids, rng);
    check(karts.length === Math.ceil(people / 2), `${people} people: ${Math.ceil(people / 2)} karts`);
    check(karts.flat().sort((a, b) => a - b).join() === ids.join(), `${people} people: everyone in a kart once`);
    check(karts.every((k, i) => k.length === 2 || (people % 2 === 1 && i === karts.length - 1 && k.length === 1)), `${people} people: two to a kart, an odd one out alone in the last`);
  }
  check(chunkPeople(ids).flat().join() === ids.join(), `${people} people: before a roll, karts in order`);
}
const firstDrivers = new Set<number>();
for (let n = 0; n < 200; n++) firstDrivers.add(pairPeople([1, 2], rng)[0][0]);
check(firstDrivers.size === 2, "either person can drive");

// ── Saved setups ────────────────────────────────────────────────────────────
const rows = describeDoubleDashSetup({
  type: "double-dash-setup", gameSlug: G.slug, duo: true, swap: true,
  karts: [{ people: ["Sam", "Riley"], driver: "Toad", thrower: "Toadette", kart: "Toad Kart" }, { people: ["Jo"], driver: "Bowser Jr.", thrower: "Bowser", kart: "Koopa King" }],
  races: { title: "Special Cup", engine: "150cc", courses: CUPS["Special Cup"] }, battles: [{ course: "Block City", mode: "Shine Thief" }],
});
check(rows.find((r) => r.label === "Karts")?.value === "Sam drives Toad, Riley throws Toadette (Toad Kart); Jo: Bowser Jr. and Bowser (Koopa King)", "saved setup names who drives and throws");
check(rows.some((r) => r.label === "Special Cup, 150cc" && r.value === CUPS["Special Cup"].join(", ")), "saved setup names the cup and engine class");
check(rows.some((r) => r.label === "Battle" && r.value === "Shine Thief on Block City"), "saved setup names the battle");
check(describeDoubleDashSetup({ gameSlug: "mario-kart-wii" }).length === 0, "another game's setup reads empty");

// ── Chat ────────────────────────────────────────────────────────────────────
const chat = CHAT_GAMES[G.slug];
check(!!chat && chat.lobbyCap === 4, "chat roll registered, a room of four");
for (let n = 0; n < 300; n++) {
  const r = chat.roll({ owned: null, arg: n % 3 === 0 ? "heavy" : n % 3 === 1 ? "light teams" : "", taken: [] });
  const [drives, throws, kart, special] = r.slots;
  const p: DdPair = { driver: drives.name, thrower: throws.name, kart: kart.name };
  check(r.game === G.slug && r.slots.length === 4 && drives.label === "Drives" && throws.label === "Throws" && kart.label === "Kart" && special.label === "Special", "chat roll: drives, throws, kart, special");
  check(kartFits(G, p), `chat roll fits: ${r.text}`);
  if (n % 3 === 0) check(pairClass(G, p) === "Heavy", "!gs-shuffle heavy gives a heavy kart");
  if (n % 3 === 1) check(pairClass(G, p) === "Light" && G.characters.find((c) => c.name === p.driver)!.team === G.characters.find((c) => c.name === p.thrower)!.team, "!gs-shuffle light teams gives a light team");
  check(r.text.includes(`Drives ${p.driver}, throws ${p.thrower}`) && r.text.includes(p.kart) && r.text.includes(`Special: ${special.name}`), "chat line names the pair, kart and special");
}
const setup = CHAT_SETUPS[G.slug];
check(!!setup && (setup.choices?.length ?? 0) === 4, "match setup registered with four choices");
for (let n = 0; n < 50; n++) {
  const cup = setup.roll({ arg: "", players: 4 });
  check(cup.kind === "setup" && cup.slots.length === 4 && /Cup, (50cc|100cc|150cc|Mirror)$/.test(cup.title ?? ""), `!gs setup: a cup and engine (${cup.title})`);
  check(G.cups.some((c) => c.courses.map((x) => x.name).join() === cup.slots.map((s) => s.name).join()), "!gs setup: the cup's courses in order");
  const tour = setup.roll({ arg: "tour", players: 4 });
  check(tour.slots.length === 16 && tour.slots[0].name === "Luigi Circuit" && tour.slots[15].name === "Rainbow Road" && /^All Cup Tour, /.test(tour.title ?? ""), "!gs setup tour");
  const eight = setup.roll({ arg: "8", players: 4 });
  check(eight.slots.length === 8 && new Set(eight.slots.map((s) => s.name)).size === 8, "!gs setup 8: eight different races");
  const battle = setup.roll({ arg: "battle", players: 4 });
  check(battle.slots.length === 1 && G.battleCourses.some((b) => b.name === battle.slots[0].name) && G.battleModes.some((m) => m.name === battle.title), "!gs setup battle: a course and a mode");
  check(!cup.text.split(": ")[0].includes(": ") && cup.text.startsWith(`🏆 ${cup.title}: `), "setup line splits at the first colon");
}
check(chatGameSlugForCategory("17189", null) === G.slug && chatGameSlugForCategory(null, "Mario Kart: Double Dash!!") === G.slug, "Twitch category maps to Double Dash");

// ── The space, the switch, the catalog ─────────────────────────────────────
const space = spaceById("retro-mario-kart")!;
check(!!space && space.name === "Retro Mario Kart", "Retro Mario Kart space");
check(space.games.join() === "mario-kart-double-dash,mario-kart-ds,mario-kart-64,mario-kart-7,super-mario-kart" && space.primary === "mario-kart-double-dash", "its games: Double Dash, Mario Kart DS, 64, 7 and Super Mario Kart");
check(space.opens === null && space.shown === DOUBLE_DASH_PUBLIC, "staff only until Britton sets a day");
check(spaceFor("mario-kart-64")?.id === "retro-mario-kart" && spaceFor("mario-kart-double-dash")?.id === "retro-mario-kart" && spaceFor("MKDD")?.id === "retro-mario-kart", "both games belong to the space");
check(GAME_SPACES.filter((s) => s.games.includes("mario-kart-64")).length === 1, "Mario Kart 64 is in one space only");
check(spaceTabs(space).join() === "now,rolls,events,people,posts,ideas", "tabs: Now, Rolls, Events, People, Posts, Ideas");
check((space.rollGames ?? []).map((g) => g.game).join() === "mario-kart-double-dash,mario-kart-ds,mario-kart-64,mario-kart-7,super-mario-kart", "Rolls switches between the five games");
check(space.tools.some((t) => t.href === "/randomizers/mario-kart-64") && space.tools.some((t) => t.href === "/randomizers/mario-kart-double-dash"), "both randomizers in Tools");
check(space.tools.some((t) => t.href === "/tier-list-maker/mario-kart-64-tracks"), "Mario Kart 64's tier list in Tools");
check(!space.tt && !space.lounge, "no time trial boards or lounge");
check(!!space.ideas && space.ideas.starters.length === 3, "an Ideas tab with three starters");
for (const t of space.tools.filter((x) => x.href.startsWith("/tier-list-maker/"))) check(TIER_TEMPLATES.some((x) => `/tier-list-maker/${x.slug}` === t.href), `${t.label} exists`);
check(gameKey("MKDD") === G.slug && gameKey("Double Dash") === G.slug && catalogGame("Mario Kart: Double Dash!!")?.slug === G.slug, "the game's names find it");
check(catalogGame("Double Dash")?.status === "live", "catalog: live outside production");
check(NIGHT_GAMES.some((g) => g.slug === G.slug && g.unit === "race"), "a live-night couch game with placements");
check(randomizerPublic(G.slug) === DOUBLE_DASH_PUBLIC, "hidden while the flag is off");
check(["tracks", "characters", "karts"].every((k) => (TIER_TEMPLATES.find((t) => t.slug === `mario-kart-double-dash-${k}`)?.items.length ?? 0) > 0), "three tier lists (outside production)");
const landing = RANDOMIZER_LANDINGS[G.slug];
check(!!landing && landing.metaTitle.length <= 60 && landing.metaDescription.length <= 160, "landing copy within limits");
check(fs.existsSync(path.join(process.cwd(), "public/images/opengraph/mario-kart-double-dash-og.jpg")), "share image on disk");
check(fs.existsSync(path.join(process.cwd(), "public/images/mario-kart-double-dash/mario-kart-double-dash-keyart.webp")), "header art on disk");

// The space roll, with the switch: each game's own roll, signed.
check(spaceRollGames(space).length === 5, "all five games roll here outside production");
check(spaceRoller(space)?.slug === G.slug && spaceRoller(space, "mario-kart-64")?.slug === "mario-kart-64" && spaceRoller(space, "mario-kart-wii")?.slug === G.slug, "the switch picks the game, and only the space's own");
for (let n = 0; n < 40; n++) {
  const dd = rollForSpace(space)!;
  check(dd.roll.game === G.slug && rollSigned(dd.roll, dd.sig) && dd.reel.length === dd.roll.slots.length, "a Double Dash roll in the space, signed, with its reel");
  const mk = rollForSpace(space, "mario-kart-64")!;
  check(mk.roll.game === "mario-kart-64" && mk.roll.slots.length === 1 && rollSigned(mk.roll, mk.sig), "a Mario Kart 64 roll in the space");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
