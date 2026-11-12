/**
 * Levels from players (picks 2026-11-11): code checks and queue rules.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-levels.ts
 *
 *   1. Mario Maker 2 IDs published on public pages pass and say course or maker (Nintendo's own maker IDs, the
 *      pretendo.network example, course IDs from GamesRadar, GameSkinny, Twinfinite, WatchMojo, Perfectly Nintendo
 *      and Super Mario Wiki); typed loosely (lowercase, spaces, no dashes, O for 0, inside a sentence) they still read.
 *   2. Typos: every one-character change and every swap of neighbours in those IDs. The check bits catch every
 *      wrong character from the 4th to the 9th; the 1st and 2nd carry the top of the id and can't be checked.
 *   3. Fortnite island codes and Fall Guys share codes: 12 digits, links pulled apart, wrong lengths refused.
 *   4. Queue rules: the line, positions, one level per viewer, the same level once, played this stream, next and
 *      random, results, the board's line, thank-you rules, titles and tags.
 *   5-7. The curation picks (2026-11-11): Geometry Dash level IDs and Minecraft seeds, the board games and sorts,
 *      likes this week, difficulty from clears at 5 marks, "May not work" and what lifts it, the sorts' order, Pacific
 *      weeks, notes, list titles, report reasons, seed versions, notes and places, and board levels into the queue.
 */

import { checkCode, decodeSmm2, readSmm2, readTwelve, SMM2_ALPHABET } from "@/lib/levels/codes";
import { LEVEL_GAMES, levelGameForTwitch, isLevelGame, isQueueGame, levelGameForSpace } from "@/lib/levels/games";
import {
  addCheck, cleanTags, cleanThanks, cleanTitle, earnsThanks, isHard, lineOf, pickNext, playedLine, playedSince,
  positionOf, queueGame, readResult, streamStart, addedLine, refusedLine, nowLine, MAX_LINE, type Entry,
  boardSorts, isBoardSort, levelStats, clearLine, sortCards, weekOf, cleanPickNote, cleanListTitle, LIST_MAX, PICKS_MAX, HIDE_AT_REPORTS,
  MIN_MARKS, LEVEL_REPORTS, isLevelReport, isMarkOutcome, cleanVersion, cleanNote, cleanSpots, spotLine, PICK_NOTE_MAX, LIST_TITLE_MAX,
  type MarkFact,
} from "@/lib/levels/rules";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else { fail++; console.log(`✗ ${label}${extra ? `  (${extra})` : ""}`); }
}
const eq = <T,>(got: T, want: T, label: string) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── 1. Real Mario Maker 2 IDs ────────────────────────────────────────────────
const COURSES: [string, string][] = [
  ["2J5-3K2-Y9G", "pretendo.network's worked example (data id 6635842)"],
  ["W0P-8X8-XLF", "Bowser's Moving Castle (GamesRadar)"],
  ["MKT-YB4-FTG", "Super Mario Bros. Abridged (GameSkinny)"],
  ["5CM-J5S-0KF", "Self-Destruct Activated (Twinfinite)"],
  ["FHT-MR9-GQF", "DryBone's Frosted Tips (Twinfinite)"],
  ["286-NQ9-HXG", "Sleeping Forrest (Twinfinite)"],
  ["0HN-HW7-DKG", "Touch The Goal (Twinfinite)"],
  ["GV6-1QT-NRG", "Jungle Fever (Twinfinite)"],
  ["3QY-VHN-CHF", "Chocolate Mountain Expedition (Twinfinite)"],
  ["NHY-44L-Y7G", "Companion Spring 3D (WatchMojo)"],
  ["X8B-9X8-3FF", "Hector's Ascension (Twinfinite)"],
  ["NS2-23Y-X6G", "Zero G's Given (Twinfinite)"],
  ["6DK-1JL-L5G", "Taumi's Sunshine callback (Twinfinite)"],
  ["974-00B-RSG", "dansalvato's level (Twinfinite)"],
  ["2GW-H75-44G", "Finals II: Invitational 2019 (Super Mario Wiki)"],
  ["641-9CJ-J9G", "Round I: Invitational 2019 (Perfectly Nintendo)"],
];
const MAKERS: [string, string][] = [
  ["GC0-BJM-HBG", "NintendoUS (play.nintendo.com)"],
  ["NG6-WH6-9CG", "Nintendo Minute (supermariomaker.nintendo.com)"],
  ["GPC-3HW-MFG", "NintendoEU (supermariomaker.nintendo.com)"],
  ["6MX-KJ2-Q9G", "NintendoJP (supermariomaker.nintendo.com)"],
];

eq(decodeSmm2("2J53K2Y9G"), { valid: true, kind: "course", id: 6635842 }, "the worked example decodes to data id 6635842");
for (const [code, where] of COURSES) {
  const r = checkCode("super-mario-maker-2", code);
  check(`${code} passes as a course ID: ${where}`, r.ok && r.kind === "course" && r.code === code, JSON.stringify(r));
}
for (const [code, where] of MAKERS) {
  const r = checkCode("super-mario-maker-2", code);
  check(`${code} is a maker ID, refused: ${where}`, !r.ok && r.problem === "maker" && r.kind === "maker", JSON.stringify(r));
  check(`${code} decodes as a maker`, decodeSmm2(code.replace(/-/g, ""))?.kind === "maker" && decodeSmm2(code.replace(/-/g, ""))?.valid === true);
}
// Typed loosely: still read.
const loose: [string, string][] = [
  ["w0p-8x8-xlf", "lowercase"], ["W0P 8X8 XLF", "spaces"], ["W0P8X8XLF", "no dashes"], ["WOP-8X8-XLF", "O for 0"],
  ["  W0P-8X8-XLF  ", "padding"], ["here's mine: W0P-8X8-XLF thanks!", "inside a sentence"], ["W0P—8X8—XLF", "long dashes"],
  ["please add W0P 8X8 XLF", "spaced, after other words"], ["974-OOB-RSG", "two O's for 0"], ["W0P.8X8.XLF", "dots"],
];
for (const [input, how] of loose) {
  const r = checkCode("super-mario-maker-2", input);
  check(`reads "${input}" (${how})`, r.ok && (r.code === "W0P-8X8-XLF" || r.code === "974-00B-RSG"), JSON.stringify(r));
}
// Not a code at all.
for (const input of ["", "   ", "hello", "W0P-8X8", "W0P-8X8-XLFF", "12345", "AEU-AEU-AEU", "ZZZ-ZZZ-ZZZ"]) {
  const r = checkCode("super-mario-maker-2", input);
  check(`refuses "${input}"`, !r.ok && (input.trim() ? r.problem === "format" : r.problem === "empty"), JSON.stringify(r));
}
eq(readSmm2("add AWESOMEXX W0P-8X8-XLF"), "W0P8X8XLF", "prefers a word that could be an ID over one with vowels");
// The mockup's made-up codes fail the check (good: they were never real).
for (const fake of ["7BK-QXN-4FG", "C4D-9LW-PTH", "H2M-VVX-7JQ", "3YB-KR5-NDW"]) {
  const r = checkCode("super-mario-maker-2", fake);
  check(`made-up ${fake} fails the check`, !r.ok && r.problem === "typo", JSON.stringify(r));
}
eq(checkCode("super-mario-maker-2", "C4D-9LW-PTH").ok ? "" : (checkCode("super-mario-maker-2", "C4D-9LW-PTH") as { line: string }).line,
  "That course ID has a typo somewhere. Check it in the game and send it again.", "the typo line (mockup)");

// ── 2. Typos are caught ──────────────────────────────────────────────────────
// The check bits cover characters 3 to 9; the 1st and 2nd hold the top of the id, which they don't (see codes.ts).
const ALL = [...COURSES, ...MAKERS].map(([c]) => c.replace(/-/g, ""));
const caughtAt: number[] = [];
for (let i = 0; i < 9; i++) {
  let tried = 0, slipped = 0;
  for (const nine of ALL) {
    for (const ch of SMM2_ALPHABET) {
      if (ch === nine[i]) continue;
      tried++;
      if (decodeSmm2(nine.slice(0, i) + ch + nine.slice(i + 1))?.valid) slipped++;
    }
  }
  caughtAt.push(1 - slipped / tried);
}
let swaps = 0, swapSlips = 0;
for (const nine of ALL) {
  for (let i = 0; i < 8; i++) {
    if (nine[i] === nine[i + 1]) continue;
    swaps++;
    if (decodeSmm2(nine.slice(0, i) + nine[i + 1] + nine[i] + nine.slice(i + 2))?.valid) swapSlips++;
  }
}
console.log(`  typos caught by place: ${caughtAt.map((r, i) => `${i + 1}: ${(r * 100).toFixed(1)}%`).join(", ")}; swaps ${((1 - swapSlips / swaps) * 100).toFixed(1)}%`);
check("typos in the 4th to 9th characters are caught (99% or more each)", caughtAt.slice(3).every((r) => r >= 0.99), caughtAt.map((r) => r.toFixed(3)).join(" "));
check("typos in the 3rd character mostly caught (70% or more)", caughtAt[2] >= 0.7, caughtAt[2].toFixed(3));
check("swapped neighbours mostly caught (80% or more)", 1 - swapSlips / swaps >= 0.8, `${swapSlips} of ${swaps} slip`);
for (const [typo, real] of [["W0P-8X8-XLG", "W0P-8X8-XLF"], ["W0P-8X8-XFL", "W0P-8X8-XLF"], ["2J5-3K2-Y9H", "2J5-3K2-Y9G"], ["974-00B-RSF", "974-00B-RSG"]]) {
  const r = checkCode("super-mario-maker-2", typo);
  check(`${typo} (from ${real}) is caught as a typo`, !r.ok && r.problem === "typo", JSON.stringify(r));
}

// ── 3. Fortnite and Fall Guys ────────────────────────────────────────────────
const fn = (s: string) => checkCode("fortnite", s);
const fg = (s: string) => checkCode("fall-guys", s);
eq(fn("1832-4417-9026"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: dashed");
eq(fn("183244179026"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: bare");
eq(fn("1832 4417 9026"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: spaced");
eq(fn("https://play.fn.gg/island/1832-4417-9026"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: play.fn.gg link");
eq(fn("play.fn.gg/island/183244179026"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: play.fn.gg link, no dashes");
eq(fn("https://www.fortnite.com/@epic/1832-4417-9026?v=3"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: fortnite.com/@maker link with a version");
eq(fn("https://www.fortnite.com/@maker2024/1832-4417-9026"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: a maker name with digits");
eq(fn("check out fortnite.com/creative/island-codes/1832-4417-9026 it's great"), { ok: true, code: "1832-4417-9026", kind: "island" }, "Fortnite: island-codes link in a sentence");
eq(readTwelve("https://example.com/1832-4417-9026", "fall-guys"), "183244179026", "Fall Guys: digits from anywhere");
for (const bad of ["1832-4417-902", "1832-4417-90261", "abcd-efgh-ijkl", "W0P-8X8-XLF"]) {
  const r = fn(bad);
  check(`Fortnite refuses "${bad}"`, !r.ok && r.problem === "format", JSON.stringify(r));
}
eq(fg("5530-1197-2284"), { ok: true, code: "5530-1197-2284", kind: "share" }, "Fall Guys: share code");
check("Fall Guys refuses 11 digits", !fg("5530-1197-228").ok);
eq((fg("") as { line: string }).line, "Add a share code: XXXX-XXXX-XXXX.", "Fall Guys: the empty line");
eq((fn("nope") as { line: string }).line, "That doesn't look like a Fortnite island code. They're 12 numbers: XXXX-XXXX-XXXX.", "Fortnite: the format line");
eq((checkCode("super-mario-maker-2", "GC0-BJM-HBG") as { line: string }).line, "That's a maker ID. Send one of their course IDs instead.", "the maker line");

// ── Games ────────────────────────────────────────────────────────────────────
eq(levelGameForTwitch("511399", null), "super-mario-maker-2", "Twitch id: Mario Maker 2");
eq(levelGameForTwitch(null, "Fall Guys"), "fall-guys", "Twitch name: Fall Guys");
eq(levelGameForTwitch("33214", "Fortnite"), "fortnite", "Twitch: Fortnite");
eq(levelGameForTwitch("509658", "Just Chatting"), null, "Twitch: not a level game");
check("isLevelGame", isLevelGame("fortnite") && !isLevelGame("super-mario-maker") && !isLevelGame(null));
eq(LEVEL_GAMES["super-mario-maker-2"].codeWord, "course ID", "Mario Maker's word");

// ── 4. Queue rules ───────────────────────────────────────────────────────────
let n = 0;
const at = (min: number) => new Date(Date.UTC(2026, 10, 11, 20, min)).toISOString();
const entry = (o: Partial<Entry>): Entry => ({
  id: `e${++n}`, game: "super-mario-maker-2", code: "W0P-8X8-XLF", senderPlatform: "twitch", senderId: "1", senderName: "Sam",
  status: "waiting", result: null, addedAt: at(n), playedAt: null, ...o,
});
const sam = { platform: "twitch", id: "1" };
const riley = { platform: "twitch", id: "2" };
const kit = { platform: "twitch", id: "3" };
const list: Entry[] = [
  entry({ code: "W0P-8X8-XLF", senderId: "1", senderName: "Sam", status: "playing" }),
  entry({ code: "MKT-YB4-FTG", senderId: "2", senderName: "Riley" }),
  entry({ code: "5CM-J5S-0KF", senderId: "3", senderName: "Kit" }),
  entry({ code: "FHT-MR9-GQF", senderId: "4", senderName: "Nova" }),
  entry({ code: "1832-4417-9026", game: "fortnite", senderId: "5", senderName: "Lou" }),
  entry({ code: "286-NQ9-HXG", senderId: "6", senderName: "Tara", status: "played", result: "cleared", playedAt: at(50) }),
  entry({ code: "0HN-HW7-DKG", senderId: "7", senderName: "Max", status: "played", result: "skipped", playedAt: at(5) }),
  entry({ code: "GV6-1QT-NRG", senderId: "8", senderName: "Ivy", status: "removed" }),
];
eq(lineOf(list, "super-mario-maker-2").map((e) => e.senderName), ["Riley", "Kit", "Nova"], "the line: waiting in this game, oldest first");
eq(lineOf(list, "fortnite").map((e) => e.senderName), ["Lou"], "another game's line holds its own");
eq(positionOf(list, "super-mario-maker-2", riley), 1, "Riley is next");
eq(positionOf(list, "super-mario-maker-2", kit), 2, "Kit is #2");
eq(positionOf(list, "super-mario-maker-2", sam), null, "the level being played isn't in line");
eq(positionOf(list, "super-mario-maker-2", { platform: "twitch", id: "5" }), null, "a level waiting for another game has no place here");
eq(playedSince(list, "super-mario-maker-2", at(10)).map((e) => e.senderName), ["Tara"], "played this stream: after the start only");
eq(playedSince(list, "super-mario-maker-2", null).map((e) => e.senderName), ["Tara", "Max"], "played, newest first");

const base = { open: true, game: "super-mario-maker-2" as const, entries: list, since: at(1) };
eq(addCheck({ ...base, open: false, code: "X8B-9X8-3FF", sender: { platform: "twitch", id: "9" } }), { ok: false, why: "closed" }, "closed queue");
eq(addCheck({ ...base, code: "286-NQ9-HXG", sender: { platform: "twitch", id: "9" } }), { ok: false, why: "played" }, "played this stream can't come back");
eq(addCheck({ ...base, since: at(55), code: "286-NQ9-HXG", sender: { platform: "twitch", id: "9" } }), { ok: true, position: 4 }, "played on an earlier stream can");
eq(addCheck({ ...base, code: "5CM-J5S-0KF", sender: { platform: "twitch", id: "9" } }), { ok: false, why: "in_line", position: 2 }, "the same level once in line");
eq(addCheck({ ...base, code: "W0P-8X8-XLF", sender: { platform: "twitch", id: "9" } }), { ok: false, why: "in_line", position: 0 }, "the level being played");
eq(addCheck({ ...base, code: "X8B-9X8-3FF", sender: kit }), { ok: false, why: "yours", position: 2 }, "one level per viewer in line");
eq(addCheck({ ...base, code: "X8B-9X8-3FF", sender: { platform: "twitch", id: "5" } }), { ok: false, why: "yours" }, "one level per viewer, across games");
eq(addCheck({ ...base, code: "X8B-9X8-3FF", sender: sam }), { ok: true, position: 4 }, "the viewer whose level is playing can send the next");
eq(addCheck({ ...base, code: "X8B-9X8-3FF", sender: { platform: "youtube", id: "2" } }), { ok: true, position: 4 }, "the same id on another platform is someone else");
const full = Array.from({ length: MAX_LINE }, (_, i) => entry({ code: `c${i}`, senderId: `f${i}` }));
eq(addCheck({ ...base, entries: full, code: "X8B-9X8-3FF", sender: { platform: "twitch", id: "new" } }), { ok: false, why: "full" }, "a full line");

const line = lineOf(list, "super-mario-maker-2");
eq(pickNext(line, "next")?.senderName, "Riley", "next: the oldest");
eq(pickNext(line, "random", () => 0.99)?.senderName, "Nova", "random: the last at 0.99");
eq(pickNext(line, "random", () => 0)?.senderName, "Riley", "random: the first at 0");
eq(pickNext(line, "random", () => 0.5)?.senderName, "Kit", "random: the middle");
eq(pickNext([], "next"), null, "an empty line");

eq(queueGame("fortnite", "super-mario-maker-2"), "fortnite", "the game on stream wins");
eq(queueGame(null, "fall-guys"), "fall-guys", "else the dashboard's pick");
eq(streamStart({ live: true, liveStartedAt: at(0), openedAt: at(30) }), at(0), "this stream: since going live");
eq(streamStart({ live: false, liveStartedAt: at(0), openedAt: at(30) }), at(30), "not live: since the queue opened");

eq(readResult("cleared"), "cleared", "result: cleared");
eq(readResult("Gave up"), "gave_up", "result: gave up");
eq(readResult("gaveup"), "gave_up", "result: gaveup");
eq(readResult("skip"), "skipped", "result: skip");
eq(readResult("maybe"), null, "result: not one");

check("thanks: cleared earns", earnsThanks("cleared", "twitch"));
check("thanks: gave up earns", earnsThanks("gave_up", "twitch"));
check("thanks: played without a result earns", earnsThanks(null, "youtube"));
check("thanks: a skip doesn't", !earnsThanks("skipped", "twitch"));
check("thanks: a site sender doesn't (chat senders only)", !earnsThanks("cleared", "site"));
eq([cleanThanks(0), cleanThanks(-5), cleanThanks(10), cleanThanks(250), cleanThanks("25"), cleanThanks("x")], [0, 0, 10, 100, 25, 0], "thank-you amounts");

eq(addedLine("Riley", 2), "@Riley you're #2 in line. !position checks, !remove takes it out.", "added line (mockup)");
eq(addedLine("Riley", 1), "@Riley you're next in line. !position checks, !remove takes it out.", "added line, next");
eq(refusedLine("Kit", "played", "super-mario-maker-2"), "@Kit that level was already played this stream.", "played line");
eq(refusedLine("Kit", "yours", "super-mario-maker-2", 3), "@Kit you already have a level in line at #3. !remove takes it out.", "yours line");
eq(nowLine({ code: "W0P-8X8-XLF", senderName: "Sam", title: "Bowser's Moving Castle" }, 3), "🎮 Now playing W0P-8X8-XLF from @Sam (Bowser's Moving Castle). 3 in line.", "now line");
eq(nowLine(null, 0), "🎮 The line is empty.", "now line, empty");

// The board's line.
eq(playedLine([]), null, "never played");
eq(playedLine([{ result: "skipped", streamer: "Nova" }]), null, "a skip isn't a play");
eq(playedLine([{ result: "cleared", streamer: "Nova" }]), "Cleared on Nova's stream", "cleared once");
eq(playedLine([{ result: "cleared", streamer: "Nova" }, { result: "cleared", streamer: "Riley" }]), "Cleared on 2 streams", "cleared twice");
eq(playedLine([{ result: "cleared", streamer: "Nova" }, { result: "cleared", streamer: "Riley" }, { result: "gave_up", streamer: "Max" }]), "Cleared on 2 streams · gave up on 1", "cleared and given up");
eq(playedLine([{ result: "gave_up", streamer: "Nova" }]), "Played on Nova's stream, not cleared yet", "given up once");
eq(playedLine([{ result: null, streamer: "Nova" }, { result: "gave_up", streamer: "Riley" }]), "Played on 2 streams", "played without a result");
check("hard tags", isHard(["Speedrun", "Kaizo"]) && isHard(["hard"]) && !isHard(["Puzzle"]));

// Titles and tags.
eq(cleanTitle("  Spin   Jump Gauntlet "), { ok: true, title: "Spin Jump Gauntlet" }, "title tidied");
check("an empty title", !cleanTitle("   ").ok);
check("a long title", !cleanTitle("x".repeat(61)).ok);
check("a title past the word filter", !cleanTitle("what the fuck").ok);
eq(cleanTags(["Speedrun", "speedrun", " Hard ", ""]), { ok: true, tags: ["Speedrun", "Hard"] }, "tags tidied, no repeats");
check("five tags", !cleanTags(["a", "b", "c", "d", "e"]).ok);
check("a long tag", !cleanTags(["x".repeat(21)]).ok);
check("a tag past the word filter", !cleanTags(["shit"]).ok);
eq(cleanTags("nope"), { ok: true, tags: [] }, "tags: not a list");

// ── 5. Geometry Dash and Minecraft codes (curation picks 14A, 15A) ──────────
const gd = (x: string) => checkCode("geometry-dash", x);
eq(gd("128"), { ok: true, code: "128", kind: "gd" }, "GD: a short level ID");
eq(gd("91240012"), { ok: true, code: "91240012", kind: "gd" }, "GD: an eight-digit level ID");
eq(gd("ID: 128"), { ok: true, code: "128", kind: "gd" }, "GD: with a label");
eq(gd("#0042"), { ok: true, code: "42", kind: "gd" }, "GD: leading zeros dropped");
eq(gd("12 345 678"), { ok: true, code: "12345678", kind: "gd" }, "GD: spaced");
for (const bad of ["0", "abc", "12345678901", "-5", "W0P-8X8-XLF"]) {
  const r = gd(bad);
  check(`GD refuses "${bad}"`, !r.ok, JSON.stringify(r));
}
eq((gd("") as { line: string }).line, "Add a level ID: 12345678.", "GD: the empty line");
const mc = (x: string) => checkCode("minecraft", x);
eq(mc("-4172144997902289642"), { ok: true, code: "-4172144997902289642", kind: "seed" }, "seed: a big negative number");
eq(mc("9223372036854775807"), { ok: true, code: "9223372036854775807", kind: "seed" }, "seed: the largest");
eq(mc("-9223372036854775808"), { ok: true, code: "-9223372036854775808", kind: "seed" }, "seed: the smallest");
eq(mc("Seed: [-0042]"), { ok: true, code: "-42", kind: "seed" }, "seed: pasted from /seed, zeros dropped");
eq(mc("/seed 404"), { ok: true, code: "404", kind: "seed" }, "seed: the command typed in");
eq(mc("gargamel"), { ok: true, code: "gargamel", kind: "seed" }, "seed: a word");
eq(mc("  glacier   bay  "), { ok: true, code: "glacier bay", kind: "seed" }, "seed: spaces tidied");
check("seed: one past the largest", !mc("9223372036854775808").ok && (mc("9223372036854775808") as { problem: string }).problem === "range");
check("seed: too long a word", !mc("x".repeat(33)).ok);
check("seed: the word filter", !mc("shit world").ok && (mc("shit world") as { problem: string }).problem === "words");
check("seed: empty", !mc("").ok);

// ── 6. Games ────────────────────────────────────────────────────────────────
eq(levelGameForTwitch("460951", null), "geometry-dash", "Twitch: Geometry Dash by id");
eq(levelGameForTwitch(null, "Minecraft"), null, "Twitch: Minecraft isn't a queue game");
check("queue games", isQueueGame("geometry-dash") && !isQueueGame("minecraft") && isLevelGame("minecraft"));
eq(levelGameForSpace("minecraft"), "minecraft", "Minecraft's space shows seeds");
eq(levelGameForSpace("geometry-dash"), "geometry-dash", "Geometry Dash's space");
eq(boardSorts("super-mario-maker-2", true).map((x) => x.id), ["top", "streamers", "newest", "hardest", "lists"], "curated level sorts");
eq(boardSorts("minecraft", true).map((x) => x.id), ["top", "newest", "lists"], "seed sorts");
eq(boardSorts("fortnite", false).map((x) => x.id), ["newest", "played", "hard"], "before the curation tables");
check("isBoardSort", isBoardSort("top") && isBoardSort("hard") && !isBoardSort("best"));

// ── 7. Curation rules ───────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 10, 11, 20, 0);
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const mk = (outcome: MarkFact["outcome"], d: number, liked?: number): MarkFact => ({ outcome, outcomeAt: outcome ? ago(d) : null, likedAt: liked == null ? null : ago(liked) });
let st = levelStats([mk("cleared", 1, 1), mk("gave_up", 2, 3), mk(null, 0, 10), mk("cleared", 1)], [], NOW);
eq([st.likes, st.likesWeek, st.cleared, st.tried, st.rate], [3, 2, 2, 3, null], "stats: likes this week, no difficulty under 5");
eq(clearLine(st), null, "no clear line under 5");
st = levelStats([mk("cleared", 1), mk("gave_up", 1), mk("gave_up", 1)], [{ result: "cleared", at: ago(2) }, { result: "gave_up", at: ago(3) }, { result: "skipped", at: ago(3) }, { result: null, at: ago(3) }], NOW);
eq([st.cleared, st.tried, st.streamClears], [2, 5, 1], "stream results count; skips and no-result plays don't");
eq(clearLine(st), "Cleared by 2 of 5", "the clear line at 5");
check("rate", Math.abs((st.rate ?? 0) - 0.4) < 1e-9);
// "May not work": two didn't-load marks since the last clear; a clear after them lifts it.
st = levelStats([mk("cleared", 5), mk("no_load", 2), mk("no_load", 1)], [], NOW);
check("two didn't-load marks after the last clear: may not work", st.mayNotWork);
st = levelStats([mk("cleared", 0.5), mk("no_load", 2), mk("no_load", 1)], [], NOW);
check("a clear after them lifts it", !st.mayNotWork);
st = levelStats([mk("no_load", 2), mk("no_load", 1)], [{ result: "cleared", at: ago(0.2) }], NOW);
check("a clear on stream lifts it too", !st.mayNotWork);
st = levelStats([mk("no_load", 2)], [], NOW);
check("one didn't-load mark isn't enough", !st.mayNotWork);

const card = (id: string, created: number, stats: Partial<ReturnType<typeof levelStats>>, lastPlay: string | null = null) => ({
  id, createdAt: ago(created), lastPlay,
  stats: { likes: 0, likesWeek: 0, cleared: 0, tried: 0, rate: null, streamClears: 0, mayNotWork: false, ...stats },
});
const cards = [
  card("a", 1, { likes: 9, likesWeek: 2 }),
  card("b", 2, { likes: 4, likesWeek: 4 }),
  card("c", 3, { likes: 20, likesWeek: 4 }),
  card("d", 4, { likes: 1, likesWeek: 0, streamClears: 3 }, ago(1)),
  card("e", 5, { likesWeek: 9, mayNotWork: true, streamClears: 2 }, ago(0.5)),
  card("f", 6, { streamClears: 2, rate: 0.2, tried: 10 }, ago(2)),
  card("g", 7, { rate: 0.2, tried: 20 }),
  card("h", 8, { rate: 0.9, tried: 6 }),
];
eq(sortCards(cards, "top").map((c) => c.id), ["c", "b", "a"], "top this week: likes this week, ties by all likes, never may-not-work");
eq(sortCards(cards, "streamers").map((c) => c.id), ["d", "f"], "streamers' picks: 2+ stream clears, never may-not-work");
eq(sortCards(cards, "hardest").map((c) => c.id), ["g", "f", "h"], "hardest: lowest rate, ties by more players");
eq(sortCards(cards, "newest").map((c) => c.id), ["a", "b", "c", "d", "e", "f", "g", "h"], "newest");

eq(weekOf("2026-11-11"), "2026-11-09", "week of a Wednesday: Monday");
eq(weekOf("2026-11-09"), "2026-11-09", "week of a Monday");
eq(weekOf("2026-11-15"), "2026-11-09", "week of a Sunday");
eq(weekOf("2026-03-01"), "2026-02-23", "week across a month");

eq(cleanPickNote("  A clean speedrun level  "), { ok: true, note: "A clean speedrun level" }, "pick note tidied");
check("pick note: empty", !cleanPickNote(" ").ok);
check("pick note: too long", !cleanPickNote("x".repeat(PICK_NOTE_MAX + 1)).ok);
eq(cleanListTitle("Kaizo  night"), { ok: true, title: "Kaizo night" }, "list title tidied");
check("list title: the word filter", !cleanListTitle("fuck this").ok);
check("list title: too long", !cleanListTitle("x".repeat(LIST_TITLE_MAX + 1)).ok);
eq([LIST_MAX, PICKS_MAX, HIDE_AT_REPORTS, MIN_MARKS], [20, 6, 3, 5], "the numbers from the picks");
check("level reports map to report reasons", LEVEL_REPORTS.map((r) => r.reason).join() === "other,hate_harassment,spam" && isLevelReport("spam") && !isLevelReport("rude"));
check("marks", isMarkOutcome("no_load") && !isMarkOutcome("skipped"));

eq(cleanVersion("1.21.4"), { ok: true, version: "1.21.4" }, "version");
eq(cleanVersion("v1.20"), { ok: true, version: "1.20" }, "version with a v");
check("version: not one", !cleanVersion("latest").ok && !cleanVersion("2.0").ok);
eq(cleanNote("  Spawn by a village  "), { ok: true, note: "Spawn by a village" }, "note tidied");
eq(cleanNote(""), { ok: true, note: null }, "no note");
check("note: too long", !cleanNote("x".repeat(281)).ok);
eq(cleanSpots([{ label: "Village", x: "120", y: "", z: "-340" }, { label: "", x: "", y: "", z: "" }]), { ok: true, spots: [{ label: "Village", x: 120, y: null, z: -340 }] }, "spots: blank rows dropped");
check("spots: a missing Z", !cleanSpots([{ label: "Village", x: "1", z: "" }]).ok);
check("spots: past the world border", !cleanSpots([{ label: "Far", x: "40000000", z: "0" }]).ok);
check("spots: Y out of range", !cleanSpots([{ label: "Deep", x: "0", y: "-100", z: "0" }]).ok);
check("spots: six", !cleanSpots(Array.from({ length: 6 }, (_, i) => ({ label: `P${i}`, x: i, z: i }))).ok);
eq(spotLine({ label: "Village", x: 120, y: 64, z: -340 }), "X 120, Y 64, Z -340", "spot line");

// Board levels into the queue: the same rules, no open queue needed, one per sharer, held for another game.
const qEntries: Entry[] = [entry({ code: "2J5-3K2-Y9G", senderPlatform: "site", senderId: "maker-1", senderName: "Sam" })];
eq(addCheck({ open: true, game: "fortnite", code: "1832-4417-9026", sender: { platform: "site", id: "maker-1" }, entries: qEntries, since: null }), { ok: false, why: "yours" }, "a sharer with a level waiting (another game) can't add a second");
eq(addCheck({ open: true, game: "geometry-dash", code: "128", sender: { platform: "site", id: "maker-2" }, entries: qEntries, since: null }), { ok: true, position: 1 }, "Geometry Dash level goes in its own line");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
