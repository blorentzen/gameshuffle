/**
 * Mario Kart Wii randomizer checks (built 2026-11-11): the data counts against the game (Super Mario Wiki's Mario
 * Kart Wii page), every picture on disk, the size-class rule on thousands of rolls, the filters, the chat roll and
 * match setups, and the space, tier lists and landing that ride on them.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-mkwii-randomizer.ts
 */

import fs from "node:fs";
import path from "node:path";
import mkwiiData from "../src/data/mkwii-data.json";
import { randomizeKartCombo, randomizeTrackList } from "../src/lib/randomizer";
import { vehicleNoteText } from "../src/lib/randomizers/vehicleNote";
import { CHAT_GAMES } from "../src/lib/twitch/chatGames";
import { CHAT_SETUPS } from "../src/lib/twitch/chatSetups";
import { chatGameSlugForCategory } from "../src/lib/twitch/chatGameCategories";
import { RANDOMIZER_LANDINGS } from "../src/data/randomizer-landings";
import { TIER_TEMPLATES } from "../src/data/tier-templates";
import { spaceById, spaceTabs } from "../src/lib/games/spaces";
import { gameKey } from "../src/lib/games/key";
import { catalogGame } from "../src/data/game-catalog";
import type { GameData } from "../src/data/types";

const data = mkwiiData as unknown as GameData & { battleCourses: { name: string; img: string }[] };
let passed = 0;
let failed = 0;
function check(ok: boolean, label: string) {
  if (ok) passed++;
  else { failed++; console.log(`FAIL ${label}`); }
}

// ── The roster ──────────────────────────────────────────────────────────────
const named = data.characters.filter((c) => !c.name.startsWith("Mii"));
const miis = data.characters.filter((c) => c.name.startsWith("Mii"));
check(named.length === 24, `24 characters (got ${named.length})`);
check(miis.length === 3 && ["Small", "Medium", "Large"].every((s) => miis.some((m) => m.weight === s && m.name === `Mii (${s})`)), "a Mii for each size");
for (const size of ["Small", "Medium", "Large"]) check(named.filter((c) => c.weight === size).length === 8, `8 ${size} characters`);
check(new Set(data.characters.map((c) => c.name)).size === data.characters.length, "character names unique");
const SIZES: Record<string, string[]> = {
  Small: ["Baby Mario", "Baby Luigi", "Baby Peach", "Baby Daisy", "Toad", "Toadette", "Koopa Troopa", "Dry Bones"],
  Medium: ["Mario", "Luigi", "Peach", "Daisy", "Yoshi", "Birdo", "Diddy Kong", "Bowser Jr."],
  Large: ["Wario", "Waluigi", "Donkey Kong", "Bowser", "King Boo", "Rosalina", "Funky Kong", "Dry Bowser"],
};
for (const [size, names] of Object.entries(SIZES)) for (const n of names) check(named.find((c) => c.name === n)?.weight === size, `${n} is ${size}`);

// ── Vehicles ────────────────────────────────────────────────────────────────
check(data.vehicles.length === 36, `36 vehicles (got ${data.vehicles.length})`);
check(new Set(data.vehicles.map((v) => v.name)).size === 36, "vehicle names unique");
for (const size of ["Small", "Medium", "Large"]) {
  const v = data.vehicles.filter((x) => x.size === size);
  check(v.filter((x) => x.type === "Kart").length === 6 && v.filter((x) => x.type === "Bike").length === 6, `${size}: 6 karts and 6 bikes`);
}
const INSIDE = ["Bullet Bike", "Quacker", "Magikruiser", "Jet Bubble", "Mach Bike", "Sneakster", "Dolphin Dasher", "Flame Runner", "Spear"];
const inside = data.vehicles.filter((v) => v.drift === "Inside").map((v) => v.name).sort();
check(JSON.stringify(inside) === JSON.stringify([...INSIDE].sort()), `the 9 inside-drift bikes (got ${inside.join(", ")})`);
check(data.vehicles.every((v) => (v.type === "Kart" ? !v.drift && v.kind === "Kart" : (v.drift === "Inside" || v.drift === "Outside") && v.kind === `${v.drift}-drift bike`)), "karts have no drift line, bikes say inside or outside");

// ── Courses ─────────────────────────────────────────────────────────────────
const cups = data.cups ?? [];
check(cups.length === 8 && cups.every((c) => c.courses.length === 4), "8 cups of 4");
const courses = cups.flatMap((c) => c.courses);
check(new Set(courses.map((c) => c.name)).size === 32, "32 course names, all different");
const retroCups = ["Shell", "Banana", "Leaf", "Lightning"];
for (const cup of cups) {
  const retro = retroCups.includes(cup.name!);
  for (const c of cup.courses) {
    const prefixed = /^(SNES|N64|GBA|GCN|DS) /.test(c.name);
    check(retro === prefixed && (retro ? c.type === c.name.split(" ")[0] : c.type === "Wii"), `${c.name}: retro courses carry their console`);
  }
}
check(data.battleCourses.length === 10 && new Set(data.battleCourses.map((b) => b.name)).size === 10, "10 battle arenas");

// ── Pictures on disk ────────────────────────────────────────────────────────
const files = [...data.characters, ...data.vehicles, ...courses, ...cups, ...data.battleCourses].map((x) => x.img);
for (const f of files) check(fs.existsSync(path.join(process.cwd(), "public", f)), `picture ${f}`);
check(fs.existsSync("public/images/mario-kart-wii/mario-kart-wii-keyart.webp"), "header art");
check(fs.existsSync("public/images/opengraph/mario-kart-wii-og.jpg"), "share image");

// ── Rolls: the vehicle is always the driver's size ──────────────────────────
for (let i = 0; i < 4000; i++) {
  const c = randomizeKartCombo(data, [], []);
  if (c.vehicle.size !== c.character.weight) { check(false, `roll ${i}: ${c.character.name} (${c.character.weight}) got ${c.vehicle.name} (${c.vehicle.size})`); break; }
}
passed++;
for (const size of ["Small", "Medium", "Large"]) {
  let ok = true;
  for (let i = 0; i < 500; i++) { const c = randomizeKartCombo(data, [size], []); if (c.character.weight !== size || c.vehicle.size !== size) ok = false; }
  check(ok, `size filter ${size}`);
}
for (const kind of ["Kart", "Outside-drift bike", "Inside-drift bike"]) {
  let ok = true;
  for (let i = 0; i < 500; i++) { const c = randomizeKartCombo(data, [], [kind]); if (c.vehicle.kind !== kind || c.vehicle.size !== c.character.weight) ok = false; }
  check(ok, `vehicle filter ${kind}`);
}
{
  let ok = true;
  for (let i = 0; i < 300; i++) { const c = randomizeKartCombo(data, ["Large"], ["Inside-drift bike"]); if (!["Flame Runner", "Spear"].includes(c.vehicle.name)) ok = false; }
  check(ok, "large + inside drift is the Flame Runner or the Spear");
}
// Every vehicle and character turns up.
{
  const seenV = new Set<string>(), seenC = new Set<string>();
  for (let i = 0; i < 20000; i++) { const c = randomizeKartCombo(data, [], []); seenV.add(c.vehicle.name); seenC.add(c.character.name); }
  check(seenV.size === 36 && seenC.size === 27, `every vehicle and character can come up (${seenV.size}, ${seenC.size})`);
}
// Tracks: 32 races with no duplicates is every course once.
{
  const list = randomizeTrackList(cups, 32, true, false);
  check(list.length === 32 && new Set(list.map((t) => t.course.name)).size === 32, "32 races without duplicates plays every course");
}

// ── The vehicle line ────────────────────────────────────────────────────────
check(vehicleNoteText({ type: "Bike", size: "Large", drift: "Inside" }) === "Large bike, inside drift", "note: inside bike");
check(vehicleNoteText({ type: "Kart", size: "Small" }) === "Small kart", "note: kart");
check(vehicleNoteText({ type: undefined }) === null, "note: nothing for other games");

// ── Chat ────────────────────────────────────────────────────────────────────
const game = CHAT_GAMES["mario-kart-wii"];
check(!!game && game.lobbyCap === 12, "chat game with a 12-player lobby");
for (let i = 0; i < 300; i++) {
  const r = game.roll({ owned: null, arg: "", taken: [] });
  const ch = data.characters.find((c) => c.name === r.slots[0]?.name);
  const ve = data.vehicles.find((v) => v.name === r.slots[1]?.name);
  if (!ch || !ve || ch.weight !== ve.size || !r.text.includes(ve.name)) { check(false, `chat roll ${i}: ${r.text}`); break; }
}
passed++;
{
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const r = game.roll({ owned: null, arg: "large bike", taken: [] });
    const ch = data.characters.find((c) => c.name === r.slots[0]?.name);
    const ve = data.vehicles.find((v) => v.name === r.slots[1]?.name);
    if (ch?.weight !== "Large" || ve?.type !== "Bike") ok = false;
  }
  check(ok, "!gs-shuffle large bike");
  const r = game.roll({ owned: null, arg: "inside", taken: [] });
  check(data.vehicles.find((v) => v.name === r.slots[1]?.name)?.drift === "Inside" && /inside drift/.test(r.text), "!gs-shuffle inside");
}
const setups = CHAT_SETUPS["mario-kart-wii"];
{
  const four = setups.roll({ arg: "", players: 4 });
  check(four.kind === "setup" && four.slots.length === 4 && !four.title!.includes(": "), "!gs setup: 4 races");
  const twelve = setups.roll({ arg: "12", players: 12 });
  check(twelve.slots.length === 12 && new Set(twelve.slots.map((s) => s.name)).size === 12, "!gs setup 12: a war's 12 different tracks");
  const cup = setups.roll({ arg: "cup", players: 4 });
  const c = cups.find((x) => `${x.name} Cup` === cup.title);
  check(!!c && cup.slots.map((s) => s.name).join("|") === c.courses.map((x) => x.name).join("|"), "!gs setup cup: one cup in order");
  const battle = setups.roll({ arg: "battle", players: 4 });
  check(battle.slots.length === 1 && data.battleCourses.some((b) => b.name === battle.slots[0].name), "!gs setup battle: an arena");
}
check(chatGameSlugForCategory("18871", null) === "mario-kart-wii" && chatGameSlugForCategory(null, "Mario Kart Wii") === "mario-kart-wii", "Twitch category");

// ── Names, landing, tier lists, space ───────────────────────────────────────
check(gameKey("mkwii") === "mario-kart-wii" && gameKey("Mario Kart Wii") === "mario-kart-wii" && gameKey("MKWii") === "mario-kart-wii", "every way the game is named");
check(gameKey("mkw") === "mario-kart-world", "mkw stays Mario Kart World");
check(catalogGame("Mario Kart Wii")?.status === "live", "catalog: live (development)");
const l = RANDOMIZER_LANDINGS["mario-kart-wii"];
check(!!l && l.metaTitle.length <= 60 && l.metaDescription.length <= 160, `landing title ${l?.metaTitle.length} and description ${l?.metaDescription.length} fit`);
const copy = JSON.stringify(l);
check(!/[–—]/.test(copy), "landing has no dashes");
const t = (slug: string) => TIER_TEMPLATES.find((x) => x.slug === slug);
check(t("mario-kart-wii-tracks")?.items.length === 32, "track tier list (development)");
check(t("mario-kart-wii-characters")?.items.length === 24, "character tier list");
check(t("mario-kart-wii-vehicles")?.items.length === 36, "vehicle tier list");
const s = spaceById("mario-kart-wii");
check(!!s && s.opens === "2026-11-11" && JSON.stringify(spaceTabs(s)) === JSON.stringify(["now", "rolls", "events", "people", "posts", "ideas"]), "space: opens with the release, its six tabs");
check(!!s && s.main.label === "Roll a combo" && ["Randomizer", "Wars", "Run a tournament", "Track tier list", "Bracket"].every((x) => s.tools.some((tool) => tool.label === x)), "space: main button and tools");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
