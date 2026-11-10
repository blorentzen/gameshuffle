/**
 * The Daily Shuffle's Sonic days (src/data/originals/daily-facts-sonic.ts): the
 * roster's facts are whole, the clues never name anyone on the roster, the
 * Saturday era leaves every earlier day alone, and the first Sonic answers stay
 * pinned (a reorder of the roster or a new seed would change them).
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-daily-sonic.ts
 */

import { PUZZLES, answerFor, guessLimits, hintFor, judgeGame, lastChanceLetters, puzzleFor, rotationFor, starterFor, shareText, stillFit } from "@/lib/originals/daily";
import { SONIC_FACTS, SONIC_SPECIES_GROUPS } from "@/data/originals/daily-facts-sonic";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`✗ ${name}`, detail ?? "");
  }
}

const ID = "sonic-character";
const p = PUZZLES[ID];
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

check("the puzzle exists", !!p);
check("40 to 60 characters", p.characters.length >= 40 && p.characters.length <= 60, p.characters.length);
check("names are unique", new Set(p.characters.map((c) => c.name)).size === p.characters.length);
check("no art anywhere (names only)", p.characters.every((c) => c.img === ""));
check("the last chance shows the first letter", lastChanceLetters(p) === 1 && p.lastChance === true && guessLimits(p).main === 5);
check("four columns played, the first game kept for hints", JSON.stringify(p.play) === "[0,1,2,3]" && p.traits[4].label === "First game");

const names = p.characters.map((c) => c.name);
const allSpecies = new Set(Object.values(SONIC_FACTS).map((f) => f.species));
for (const c of p.characters) {
  check(`${c.name}: every fact filled`, c.traits.every((t) => t !== null && t !== ""), c.traits);
  check(`${c.name}: debut year is a year`, typeof c.traits[2] === "number" && (c.traits[2] as number) >= 1990 && (c.traits[2] as number) <= 2026, c.traits[2]);
  check(`${c.name}: a clue and a first-game hint`, (c.ladder ?? []).length === 2 && !!c.clue);
  for (const h of c.ladder ?? []) {
    // A hint never names the answer.
    const own = new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(h.text);
    check(`${c.name}: hint doesn't name them`, !own, h.text);
    check(`${c.name}: no dashes in hints`, !/[—–]/.test(h.text), h.text);
  }
  check(`${c.name}: clue under 120 characters`, (c.clue ?? "").length <= 120, c.clue);
}
for (const g of SONIC_SPECIES_GROUPS) for (const sp of g) check(`species group value is on the roster: ${sp}`, allSpecies.has(sp));

// The schedule: Saturdays from Nov 21, 2026, and nothing earlier moves.
check("no Sonic day before the era", (() => {
  for (let d = "2026-09-29"; d < "2026-11-21"; d = addDays(d, 1)) if (puzzleFor(d).id === ID) return false;
  return true;
})());
check("the era starts on a Monday", new Date("2026-11-16T00:00:00Z").getUTCDay() === 1);
check("Saturday is Sonic, the rest All-Stars", JSON.stringify(rotationFor("2026-11-16")) === JSON.stringify(["allstars", "allstars", "allstars", "allstars", "allstars", "allstars", ID]));
check("Sat Nov 21 is the first Sonic day", puzzleFor("2026-11-21").id === ID && puzzleFor("2026-11-14").id === "allstars");
// Pinned: the roster order and the seed decide these. Never change them.
const firstFive = [0, 1, 2, 3, 4].map((w) => answerFor(addDays("2026-11-21", 7 * w)).name);
check("the first Sonic answers stay put", JSON.stringify(firstFive) === JSON.stringify(["Amy", "Rouge", "Shadow", "Cubot", "Metal Sonic"]), firstFive);
// Every character comes up once before any repeats.
const cycle = new Set(Array.from({ length: p.characters.length }, (_, w) => answerFor(addDays("2026-11-21", 7 * w)).name));
check("a full cycle of Saturdays shows everyone once", cycle.size === p.characters.length, cycle.size);
check("All-Stars days around it still play All-Stars", puzzleFor("2026-11-20").id === "allstars" && puzzleFor("2026-11-22").id === "allstars");

// Playing a Sonic day.
const day = "2026-11-21";
const answer = answerFor(day);
const others = names.filter((n) => n !== answer.name);
check("a solve in 1 judges", JSON.stringify(judgeGame(day, [answer.name])) === JSON.stringify({ guesses: 1, solved: true }));
check("a last-chance save judges", JSON.stringify(judgeGame(day, [...others.slice(0, 5), answer.name])) === JSON.stringify({ guesses: 6, solved: true }));
check("six misses end the game", JSON.stringify(judgeGame(day, others.slice(0, 6))) === JSON.stringify({ guesses: 6, solved: false }));
check("a seventh guess isn't allowed", judgeGame(day, [...others.slice(0, 6), answer.name]) === null);
check("an All-Stars name isn't a Sonic guess", judgeGame(day, ["Mario"]) === null);
const h = hintFor("Shadow", answer, p)!;
check("a guess fills four cells", h.cells.length === 4);
check("Shadow vs Amy: hedgehog match, team miss", h.cells[0].status === "match" && h.cells[1].status === "miss", h.cells);
check("still-fit narrows", stillFit(p, [h]).length < p.characters.length && stillFit(p, [h]).some((c) => c.name === answer.name));
const speciesCell = (guess: string, ans: string) => hintFor(guess, p.characters.find((c) => c.name === ans)!, p)!.cells[0].status;
check("related species are close", speciesCell("Jet", "Wave") === "close" && speciesCell("Jet", "Bean") === "close" && speciesCell("Orbot", "Sage") === "close" && speciesCell("Tails", "Infinite") === "close");
check("unrelated species miss", speciesCell("Jet", "Sonic") === "miss" && speciesCell("Knuckles", "Sonic") === "miss");
const share = shareText(day, [h], false);
check("share text names the game, never the answer", share.includes("· Sonic") && !share.includes(answer.name), share);
check("the starter stays off", starterFor(day) === null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
