/**
 * Mario Kart Wii wars (Wii picks 2026-11-11): npx tsx -r ./scripts/server-only-shim.cjs scripts/test-wars-mkwii.ts
 * Wii's points table and formats, its tracks and codes, carrying a Wii war over, nicknames, and that Mario Kart 8
 * Deluxe and World read their tracks exactly as before.
 */

import { isWarGame, raceLine, readRaceLine, readTrack, standing, suggestTracks, trackLabel, warGameOr, warTrack, type WarRace } from "../src/lib/wars/rules";
import { FORMAT_SIZES, formatProblem, pointsTable, raceTotal, swingFor, teamScores } from "../src/lib/wars/format";
import { nickTrack, nickTrackValue, warTrackTitle, warTracks, wiiCodes, wiiTrackByName } from "../src/lib/wars/tracks";
import { trackFrom, type TypedContext } from "../src/lib/wars/legacy";
import { carryBlock, carryTotals, readBlock, readCarry } from "../src/lib/wars/carry";
import { mkcGame } from "../src/lib/wars/mkcTeams";
import { ttTracks } from "../src/lib/timeTrials/tracks";
import { trackCode, tracksByCode } from "../src/lib/timeTrials/codes";
import mkwii from "../src/data/mkwii-data.json";

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}
const f = (size: number, teams: number) => ({ size, teams });
const race = (n: number, spots: number[], track: string | null = null): WarRace => ({ n, spots, track, by: { id: "1", name: "A" }, at: new Date(Date.UTC(2026, 10, 11, 0, n)).toISOString() });

// ── The game ──────────────────────────────────────────────────────────────────────────────────
eq("mkwii is a war game", isWarGame("mkwii"), true);
eq("mkw is not (it means World on GameShuffle)", isWarGame("mkw"), false);
eq("a Wii option stays Wii", warGameOr("mkwii", "mk8dx"), "mkwii");
eq("an unknown option falls back", warGameOr("mkw", "mk8dx"), "mk8dx");
eq("MKCentral's Wii rosters are mkw", [mkcGame("mk8dx"), mkcGame("mkworld"), mkcGame("mkwii")], ["mk8dx", "mkworld", "mkw"]);

// ── Points (Super Mario Wiki + MKW Table Bot's scoreMatrix) ──────────────────────────────────────
const P = pointsTable("mkwii", 12)!;
eq("12 places", P.length, 12);
eq("Wii table", P, [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
eq("73 a race", raceTotal(P), 73);
eq("MK8DX still 82", raceTotal(pointsTable("mk8dx", 12)!), 82);
eq("World still 82", raceTotal(pointsTable("mkworld", 12)!), 82);
eq("6v6 swing 43", swingFor("mkwii", f(6, 2)), 43);
eq("MK8DX 6v6 swing still 40", swingFor("mk8dx", f(6, 2)), 40);
eq("Wii rooms under 12 aren't known", [2, 4, 6, 8, 10, 24].map((r) => pointsTable("mkwii", r)), [null, null, null, null, null, null]);
eq("race scores", teamScores({ spots: [1, 2, 3, 7, 8, 12] }, "mkwii", f(6, 2)), [15 + 12 + 10 + 5 + 4 + 0, 8 + 7 + 6 + 3 + 2 + 1]);
eq("a race adds up to 73", teamScores({ spots: [2, 4, 6, 8, 10, 12] }, "mkwii", f(6, 2)).reduce((a, b) => a + b, 0), 73);
eq("several teams use the 12-player table", teamScores({ spots: [1, 12], places: [[2, 11], [3, 10], [4, 9], [5, 8], [6, 7]] }, "mkwii", f(2, 6)), [15, 13, 12, 11, 11, 11]);

// A 12-race war of fixed places: 1, 2, 3, 7, 8, 12 every race = 46 to 27, +19 a race.
{
  const races = Array.from({ length: 12 }, (_, i) => race(i + 1, [1, 2, 3, 7, 8, 12]));
  const s = standing(races, [], 12, "mkwii");
  eq("war total 876", s.us + s.them, 876);
  eq("war score", [s.us, s.them, s.diff], [552, 324, 228]);
  eq("over", [s.played, s.left, s.decided], [12, 0, "us"]);
  const mid = standing(races.slice(0, 6), [], 12, "mkwii");
  eq("after six", [mid.us, mid.them, mid.diff], [276, 162, 114]);
  // 114 > 43 × 6 = 258? No: still open.
  eq("still catchable after six", mid.decided, null);
  eq("needs", mid.need, { side: "them", avg: Math.ceil(115 / 6) });
  const late = standing(races.slice(0, 11), [], 12, "mkwii");
  // 209 > 43 × 1: decided.
  eq("decided with one left", late.decided, "us");
  eq("penalty", standing(races.slice(0, 2), [{ side: "us", points: 15, reason: "", by: "x", at: races[1].at }], 12, "mkwii").us, 92 - 15);
  eq("race line", raceLine(race(3, [1, 2, 3, 7, 8, 12], "gcn-peach-beach"), "mkwii"), " 3: +19 | 1,2,3,7,8,12   rPB");
  eq("race line, several teams", raceLine({ ...race(2, [1, 12]), places: [[2, 11], [3, 10], [4, 9], [5, 8], [6, 7]] }, "mkwii", f(2, 6), ["A", "B", "C", "D", "E", "F"]), " 2: A 15 · B 13 · C 12 · D 11 · E 11 · F 11");
}

// ── Formats ───────────────────────────────────────────────────────────────────────────────────
eq("Wii format sizes", FORMAT_SIZES.mkwii, [6, 4, 3, 2]);
eq("6v6 works", formatProblem("mkwii", f(6, 2)), null);
eq("six teams of 2", formatProblem("mkwii", f(2, 6)), null);
eq("four teams of 3", formatProblem("mkwii", f(3, 4)), null);
eq("three teams of 4", formatProblem("mkwii", f(4, 3)), null);
for (const size of [2, 3, 4, 5]) eq(`${size}v${size} two teams waits`, /Mario Kart Wii's points for an? \d+-player room haven't been checked yet/.test(formatProblem("mkwii", f(size, 2)) ?? ""), true);
eq("4v4 message", formatProblem("mkwii", f(4, 2)), "Mario Kart Wii's points for an 8-player room haven't been checked yet, so 4v4 isn't on. Play it in a 12-player room with more teams, or as 6v6.");
eq("12v12 is World's", formatProblem("mkwii", f(12, 2)) !== null, true);
eq("no 24-player rooms", formatProblem("mkwii", f(6, 4)) !== null, true);
eq("World's own message unchanged in words", /^Mario Kart World's points for an 8-player room/.test(formatProblem("mkworld", f(4, 2)) ?? ""), true);

// ── Tracks ────────────────────────────────────────────────────────────────────────────────────
const wii = warTracks("mkwii");
const data = (mkwii as { cups: { name: string; courses: { name: string; img: string }[] }[] }).cups;
eq("32 courses", wii.length, 32);
eq("8 cups of 4", data.map((c) => c.courses.length), [4, 4, 4, 4, 4, 4, 4, 4]);
eq("cup order", [...new Set(wii.map((t) => t.cup))], ["Mushroom", "Flower", "Star", "Special", "Shell", "Banana", "Leaf", "Lightning"]);
eq("ids are name slugs", wii.slice(0, 2).map((t) => t.id).concat(wii.filter((t) => t.name === "GCN Peach Beach").map((t) => t.id)), ["luigi-circuit", "moo-moo-meadows", "gcn-peach-beach"]);
eq("ids unique", new Set(wii.map((t) => t.id)).size, 32);
eq("every course has a code", wii.filter((t) => !t.code).map((t) => t.name), []);
eq("every course has art", wii.filter((t) => !t.image?.startsWith("/images/mario-kart-wii/tracks/")).map((t) => t.name), []);
const allCodes = wii.flatMap((t) => wiiCodes(t.id));
eq("no code twice (any case)", allCodes.length, new Set(allCodes.map((c) => c.toLowerCase())).size);
eq("shown codes", wii.map((t) => t.code), ["LC", "MMM", "MG", "TF", "MC", "CM", "DKS", "WGM", "DC", "KC", "MT", "GV", "DDR", "MH", "BC", "RR", "rPB", "rYF", "rGV2", "rMR", "rSL", "rSGB", "rDS", "rWS", "rDH", "rBC3", "rDKJP", "rMC", "rMC3", "rPG", "rDKM", "rBC"]);
for (const t of wii) {
  for (const c of wiiCodes(t.id)) {
    eq(`${c} reads as ${t.name}`, readTrack("mkwii", c)?.id, t.id);
    eq(`${c.toLowerCase()} reads as ${t.name}`, readTrack("mkwii", c.toLowerCase())?.id, t.id);
    eq(`${c.toUpperCase()} reads as ${t.name}`, readTrack("mkwii", c.toUpperCase())?.id, t.id);
  }
  eq(`${t.name} by id`, warTrack("mkwii", t.id)?.name, t.name);
}
eq("BC, rBC, rBC3", ["BC", "rBC", "rBC3"].map((c) => readTrack("mkwii", c)?.name), ["Bowser's Castle", "N64 Bowser's Castle", "GBA Bowser Castle 3"]);
eq("MC, rMC, rMC3", ["MC", "rMC", "rMC3"].map((c) => readTrack("mkwii", c)?.name), ["Mario Circuit", "GCN Mario Circuit", "SNES Mario Circuit 3"]);
eq("GV is Grumble Volcano, rGV2 Ghost Valley", ["GV", "rGV2", "GV2"].map((c) => readTrack("mkwii", c)?.name), ["Grumble Volcano", "SNES Ghost Valley 2", "SNES Ghost Valley 2"]);
eq("an MK8DX code isn't a Wii track", readTrack("mkwii", "SSC"), null);
eq("a Wii code isn't World's (rBC3)", readTrack("mkworld", "rBC3"), null);
eq("label", trackLabel("mkwii", "n64-dks-jungle-parkway"), "rDKJP");
eq("title", warTrackTitle(warTrack("mkwii", "dk-summit")!), "DK Summit (DKS)");
eq("race line with a track", readRaceLine("mkwii", "rPB 12378").track?.name, "GCN Peach Beach");
eq("suggestions", suggestTracks("mkwii", "rbc").map((t) => t.code).slice(0, 2).sort(), ["rBC", "rBC3"]);
eq("names", ["GCN Peach Beach", "Peach Beach (GCN)", "Wii Coconut Mall", "Coconut Mall", "Mario Circuit", "GCN Mario Circuit", "Mario Circuit (GCN)", "Bowser's Castle", "N64 Bowser's Castle", "DK's Jungle Parkway", "nope"].map((n) => wiiTrackByName(n)?.id ?? null),
  ["gcn-peach-beach", "gcn-peach-beach", "coconut-mall", "coconut-mall", "mario-circuit", "gcn-mario-circuit", "gcn-mario-circuit", "bowsers-castle", "n64-bowsers-castle", "n64-dks-jungle-parkway", null]);

// ── Mario Kart 8 Deluxe and World read exactly as before ───────────────────────────────────────
for (const g of ["mk8dx", "mkworld"] as const) {
  const before = ttTracks(g);
  const now = warTracks(g);
  eq(`${g} count`, now.length, before.length);
  eq(`${g} ids, names, cups, art`, now.map((t) => [t.id, t.name, t.cup, t.image]), before.map((t) => [t.id, t.name, t.cup, t.image]));
  eq(`${g} codes`, now.map((t) => t.code), before.map((t) => trackCode(t)));
  // readTrack as it read before: the shown code exact case, else any case when only one track has it.
  const old = (raw: string) => {
    const text = raw.trim();
    if (!text) return null;
    const exactCase = ttTracks(g).find((t) => trackCode(t) === text);
    if (exactCase) return exactCase.id;
    const list = tracksByCode(text, g).filter((t) => (trackCode(t) ?? "").toLowerCase() === text.toLowerCase());
    return list.length === 1 ? list[0].id : null;
  };
  const tries = before.flatMap((t) => { const c = trackCode(t) ?? t.name.slice(0, 4); return [c, c.toLowerCase(), c.toUpperCase(), c.slice(0, 2), `${c}x`]; }).concat(["PS1", "rBC3", "LC", "", "  ", "abcdefgh"]);
  let same = 0;
  for (const t of tries) if (readTrack(g, t)?.id ?? null) { if (readTrack(g, t)!.id === old(t)) same++; else eq(`${g} readTrack ${t}`, readTrack(g, t)?.id, old(t)); } else if (old(t) === null) same++; else eq(`${g} readTrack ${t}`, null, old(t));
  eq(`${g} readTrack unchanged on ${tries.length} inputs`, same, tries.length);
}
eq("MK8DX still has 96", warTracks("mk8dx").length, 96);
eq("World still has 40", warTracks("mkworld").length, 40);

// ── Nicknames ─────────────────────────────────────────────────────────────────────────────────
eq("a Wii nickname carries the game", nickTrackValue("mkwii", "snes-mario-circuit-3"), "mkwii:snes-mario-circuit-3");
eq("MK8DX and World keep bare ids", [nickTrackValue("mk8dx", "x"), nickTrackValue("mkworld", "y")], ["x", "y"]);
eq("Wii reads only its own", [nickTrack("mkwii", "mkwii:luigi-circuit"), nickTrack("mkwii", "snes-mario-circuit-3")], ["luigi-circuit", null]);
eq("World never reads a Wii nickname", [nickTrack("mkworld", "mkwii:snes-mario-circuit-3"), nickTrack("mkworld", "snes-mario-circuit-3")], [null, "snes-mario-circuit-3"]);
{
  const ctx = (game: "mkwii" | "mkworld"): TypedContext => ({ game, readsLike: "sokuji", us: { tag: "KC", name: null }, them: { tag: "NOR", name: null }, trackNames: { castle: "mkwii:n64-bowsers-castle", snow: "snes-mario-circuit-3" } });
  eq("typed Wii nickname", trackFrom("castle", ctx("mkwii")), "n64-bowsers-castle");
  eq("a World nickname isn't read in a Wii war", trackFrom("snow", ctx("mkwii")), null);
  eq("a Wii nickname isn't read in a World war", trackFrom("castle", ctx("mkworld")), null);
  eq("a code still wins", trackFrom("DKS", ctx("mkwii")), "dk-summit");
}

// ── Carrying a Wii war over ───────────────────────────────────────────────────────────────────
{
  const sokuji = [
    "Sokuji 6v6", "KC - NOR", "92 : 54(+38)  @10",
    "1  - rPB", "46 : 27(+19) | 1,2,3,7,8,12",
    "2  - Coconut Mall", "46 : 27(+19) | 1,2,3,7,8,12",
  ].join("\n");
  const read = readCarry(sokuji, "mkwii");
  eq("Sokuji read for Wii", read.ok, true);
  if (read.ok) {
    eq("tracks found", read.war.races.map((r) => r.track), ["gcn-peach-beach", "coconut-mall"]);
    eq("totals agree", carryTotals(read.war), [92, 54]);
    eq("no notes", read.notes, []);
    const block = carryBlock(read.war);
    eq("block head", block.split("\n")[0], "From Sokuji · Mario Kart Wii · 6v6 · 12 races");
    const back = readBlock(block);
    eq("block reads back as Wii", back.ok && [back.war.game, back.war.races.map((r) => r.track)], ["mkwii", ["gcn-peach-beach", "coconut-mall"]]);
  }
  const fromMk8 = readCarry(sokuji, "mk8dx");
  eq("73-point Sokuji races are Wii in any channel", fromMk8.ok && fromMk8.war.game, "mkwii");
  // The same places in an 82-point room: 49 to 33 a race.
  const mk8 = readCarry(sokuji.replace(/46 : 27\(\+19\)/g, "49 : 33(+16)").replace("92 : 54(+38)", "98 : 66(+32)"), "mk8dx");
  eq("82-point Sokuji races stay the channel's", mk8.ok && [mk8.war.game, carryTotals(mk8.war)], ["mk8dx", [98, 66]]);
  const toad = ["Total Score after Race 1", "KC", "46", "NOR", "27", "Difference", "+19", "Race Scores (first 12)", "1 | 46 - 27 (+19) (LC)"].join("\n");
  const t = readCarry(toad, "mkwii");
  eq("73-point races are a Wii 6v6", t.ok && [t.war.format, t.war.races[0].track], [{ size: 6, teams: 2 }, "luigi-circuit"]);
  eq("82-point races aren't a Wii room", readCarry(toad.replace("46 - 27 (+19)", "46 - 36 (+10)").replace(/\n27\n/, "\n36\n"), "mkwii").ok, false);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
