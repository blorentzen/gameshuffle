/**
 * Checks for the Daily Dex (src/lib/originals/dailyDex.ts):
 *   npx tsx scripts/test-daily-dex.ts
 * The roster, the comparison rules (types, heights and weights, generations),
 * the last-chance reveal, judging, and the nods' rules (no names, no dashes).
 */

import { DEX_ROWS } from "../src/data/originals/daily-dex-facts";
import { DEX_NODS } from "../src/data/originals/daily-dex-nods";
import { DEX_DEBUT, DEX_REGION } from "../src/data/originals/daily-dex";
import { compareTrait, guessLimits, judgeGame, shareText, statsFrom, hintFor, type GuessHint } from "../src/lib/originals/daily";
import { DEX, DEX_PUZZLE, dexAnswer, dexNumber, dexSearchValue, letterCount, letterReveal, namesIt, DEX_EPOCH } from "../src/lib/originals/dailyDex";

let failed = 0, passed = 0;
function check(ok: boolean, what: string) {
  if (ok) passed++;
  else { failed++; console.error(`✗ ${what}`); }
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Roster
const names = DEX_PUZZLE.characters.map((c) => c.name);
check(names.length === 1025, `1,025 Pokémon (got ${names.length})`);
check(new Set(names).size === names.length, "names are unique");
const searchValues = names.map(dexSearchValue);
check(new Set(searchValues.map((v) => v.toLowerCase())).size === names.length, "search values are unique");
check(dexSearchValue("Flabébé") === "Flabebe" && dexSearchValue("Farfetch’d") === "Farfetch'd" && dexSearchValue("Nidoran♀") === "Nidoran F", "search values fold accents and apostrophes");
DEX_ROWS.forEach((r, i) => check(r[0] === i + 1, `#${i + 1} is in National Pokédex order`));
for (const ch of DEX_PUZZLE.characters) {
  for (const h of ch.ladder ?? []) check(!namesIt(ch.name, h.text), `${ch.name}'s hint doesn't name it ("${h.text}")`);
}
check(namesIt("Hypno", "Hypnosis") && namesIt("Claydol", "Clay Doll") && !namesIt("Pikachu", "Mouse"), "a category that spells the name is caught");
for (const n of [...Object.keys(DEX_DEBUT), ...Object.keys(DEX_REGION)]) check(names.includes(n), `override ${n} is a real Pokémon`);

// Comparisons
const [GEN, TYPES, , , HEIGHT, WEIGHT] = DEX_PUZZLE.traits;
check(compareTrait(TYPES, "Flying / Fire", "Fire / Flying").status === "match", "types match in either order");
check(compareTrait(TYPES, "Electric / Flying", "Electric").status === "close", "one shared type is close");
check(compareTrait(TYPES, "Water", "Electric").status === "miss", "no shared type is a miss");
check(compareTrait(HEIGHT, 0.3, 0.4).status === "miss" && compareTrait(HEIGHT, 0.5, 0.4).status === "close", "height within 25% is close");
check(compareTrait(WEIGHT, 8.5, 6).dir === "down" && compareTrait(WEIGHT, 2, 6).dir === "up", "weight arrows point at the answer");
check(compareTrait(GEN, 2, 1).status === "close" && compareTrait(GEN, 2, 1).dir === "down" && compareTrait(GEN, 3, 1).status === "miss", "a generation apart is close");

// Last chance reveal
const pika = letterReveal("Pikachu");
check(pika[0].kind === "first" && pika.slice(1).every((c) => c.kind === "blank") && pika.length === 7, "Pikachu reveals P and six blanks");
const mime = letterReveal("Mr. Mime");
check(mime.filter((c) => c.kind === "first").length === 1 && mime.some((c) => c.kind === "gap") && mime.some((c) => c.kind === "mark"), "Mr. Mime shows one letter, the gap and the dot");
check(letterCount("Mr. Mime") === 6 && letterCount("Type: Null") === 8, "letter counts skip punctuation");

// Schedule and judging
check(dexNumber(DEX_EPOCH) === 1 && dexNumber(addDays(DEX_EPOCH, 9)) === 10, "puzzle numbers count from the Dex's epoch");
const seen = new Set<string>();
for (let i = 0; i < 1025; i++) seen.add(dexAnswer(addDays(DEX_EPOCH, i)).name);
check(seen.size === 1025, `no answer repeats until all 1,025 have come up (got ${seen.size})`);
check(dexAnswer(addDays(DEX_EPOCH, 1025)).name === dexAnswer(DEX_EPOCH).name, "the cycle starts over after 1,025 days");
const day = addDays(DEX_EPOCH, 3);
const answer = dexAnswer(day).name;
const others = names.filter((n) => n !== answer);
check(JSON.stringify(judgeGame(day, [others[0], answer], DEX)) === JSON.stringify({ guesses: 2, solved: true }), "a solve in two is judged");
check(judgeGame(day, others.slice(0, 6), DEX)?.solved === false, "six misses is a finished game");
check(judgeGame(day, others.slice(0, 5), DEX) === null, "five misses isn't finished (the last chance is left)");
check(judgeGame(day, ["Not a Pokémon"], DEX) === null, "made-up names are refused");
check(guessLimits(DEX_PUZZLE).main === 5 && guessLimits(DEX_PUZZLE).total === 6, "five guesses and a last chance");
const hints = [others[0], answer].map((g) => hintFor(g, dexAnswer(day), DEX_PUZZLE)).filter((h): h is GuessHint => !!h);
check(shareText(day, hints, true, DEX).startsWith(`The Daily Dex #${dexNumber(day)} 2/5`) && shareText(day, hints, true, DEX).endsWith("https://www.gameshuffle.co/daily-dex"), "share text names the Dex");
check(statsFrom([{ day, guesses: 6, solved: true }], day, DEX).saved === 1, "a last-chance solve is a save");

// Ladder
const c = DEX_PUZZLE.characters.find((x) => x.name === "Pikachu")!;
check(c.ladder!.some((h) => h.after === 3 && h.text.includes("Mouse Pokémon") && h.text.includes("Kanto")), "category and region after three misses");
check(c.ladder!.some((h) => h.after === 4 && h.text.startsWith("First appeared in")), "debut game after four misses");

// Nods
const FORBIDDEN_DASH = /[–—]/;
for (const [name, nods] of Object.entries(DEX_NODS)) {
  check(names.includes(name), `nods for ${name} belong to a real Pokémon`);
  check(nods.length === 3 && nods.every((n) => n.trim().length > 10), `${name} has three nods`);
  const words = name.toLowerCase().split(/[^a-zà-ÿ]+/).filter((w) => w.length >= 4);
  for (const n of nods) {
    check(!FORBIDDEN_DASH.test(n), `${name}: no dashes in "${n}"`);
    check(!words.some((w) => n.toLowerCase().includes(w)), `${name}: a nod names it ("${n}")`);
  }
}
let missing = 0;
for (let i = 0; i < 90; i++) if (!DEX_NODS[dexAnswer(addDays(DEX_EPOCH, i)).name]) missing++;
console.log(`Nods written for ${Object.keys(DEX_NODS).length} Pokémon; ${missing} of the first 90 answers still need theirs.`);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
