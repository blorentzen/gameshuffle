/**
 * The lounge lookup's pure rules: friend codes, the suggestion merge, "Did you mean" scoring,
 * the boards, divisions, where an MMR lands, and the player page's sentence.
 *   npx tsx scripts/test-lounge-lookup.ts
 */
import {
  climbers, closeEnough, closestNames, countryBoard, divisionTable, editDistance, estimateAbove, groupByName, landing, landingLine,
  lookupQueries, mergeSuggestions, nearSkip, parseFriendCode, playerSentence, shareWord, suggestionHref, suggestionLine, toLeaderRow,
  type LeaderRow,
} from "../src/lib/lounge/lookup";
import { parseRecent } from "../src/components/lounge/LoungeRecent";
import { stepsFrom, type MmrGame } from "../src/lib/mmr/rules";

let pass = 0, fail = 0;
const ok = (cond: unknown, label: string) => { if (cond) pass++; else { fail++; console.error("FAIL", label); } };
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ── Friend codes ──
eq(parseFriendCode("8172-2401-3735"), "8172-2401-3735", "dashed code");
eq(parseFriendCode("817224013735"), "8172-2401-3735", "digits only");
eq(parseFriendCode(" 8172 2401 3735 "), "8172-2401-3735", "spaces");
eq(parseFriendCode("SW-8172-2401-3735"), "8172-2401-3735", "SW- prefix");
eq(parseFriendCode("sw817224013735"), "8172-2401-3735", "sw prefix, no dash");
eq(parseFriendCode("8172-2401-373"), null, "eleven digits");
eq(parseFriendCode("8172-2401-37355"), null, "thirteen digits");
eq(parseFriendCode("Kevo"), null, "a name");
eq(parseFriendCode("Kevo 1234"), null, "a name with digits");
eq(parseFriendCode("1234"), null, "four digits");
eq(parseFriendCode(""), null, "empty");

// ── Edit distance ──
eq(editDistance("kevo", "kevo"), 0, "same");
eq(editDistance("kevvo", "kevo"), 1, "one extra letter");
eq(editDistance("kevvo", "kevino"), 2, "change and insert");
eq(editDistance("kveo", "kevo"), 1, "two neighbours swapped is one edit");
eq(editDistance("", "abc"), 3, "empty to three");
eq(editDistance("saber", "sabre"), 1, "swap at the end");
eq(editDistance("abc", ""), 3, "three to empty");
ok(closeEnough(3) === 1 && closeEnough(5) === 2 && closeEnough(8) === 3 && closeEnough(14) === 4, "close-enough steps");

// ── Leaderboard rows ──
const raw12 = { id: 11961, overallRank: 3, countryCode: "MX", name: "Kevo", mmr: 15672, maxMmr: 15792, winRate: 0.74, winsLastTen: 8, lossesLastTen: 2, gainLossLastTen: 140, lastWeekRankChange: 0, eventsPlayed: 198, mmrRank: { division: "Grandmaster", name: "Grandmaster" } };
const r12 = toLeaderRow(raw12, "mkworld12p")!;
eq([r12.name, r12.rank, r12.division, r12.mmr, r12.events, r12.gain10, r12.weekChange], ["Kevo", 3, "Grandmaster", 15672, 198, 140, 0], "a full row");
const unranked = toLeaderRow({ id: 11961, countryCode: "MX", name: "Kevo", mmr: 6000, eventsPlayed: 0, mmrRank: { division: "Gold", name: "Gold" } }, "mkworld24p")!;
eq([unranked.rank, unranked.events, unranked.division, unranked.weekChange], [null, 0, "Gold", null], "a row with no rank (no events)");
const dx = toLeaderRow({ id: 5, name: "Dx", mmr: 9100, overallRank: 40, eventsPlayed: 10, mmrRank: { division: "Platinum", level: 2, name: "Platinum 2" } }, "mk8dx")!;
eq(dx.division, "Platinum 2", "MK8DX division keeps its number");
eq(toLeaderRow({ name: "No id" }, "mk8dx"), null, "no id = no row");
eq(toLeaderRow({ id: 1 }, "mk8dx"), null, "no name = no row");

// ── Suggestions ──
const row = (name: string, game: MmrGame, mmr: number | null, events: number, rank: number | null = null, division: string | null = "Gold", country: string | null = "US"): LeaderRow => ({
  id: name.length * 100 + game.length, name, country, game, mmr, maxMmr: mmr, division, rank, events, winRate: null, wins10: null, losses10: null, gain10: null, weekChange: null,
});
const rows = [
  row("Kevo", "mkworld12p", 15672, 198, 3, "Grandmaster", "MX"),
  row("Kevo", "mkworld24p", 6000, 0, null),
  row("Kevo", "mk8dx", 10500, 0, null),
  row("Kevino", "mkworld12p", 10989, 145, 86, "Sapphire", "DE"),
  row("Kevino", "mkworld24p", 8659, 14, 261, "Platinum", "DE"),
  row("Kevino", "mk8dx", 2258, 20, 4739, "Bronze 1", "DE"),
  row("kev", "mkworld24p", null, 0, null, "Placement"),
  row("DxOnly", "mk8dx", 12000, 30, 50, "Ruby 1"),
  row("Kevo", "mkworld12p", 15672, 198, 3, "Grandmaster", "MX"), // the same row again (two searches)
];
const grouped = groupByName(rows);
eq(grouped.length, 4, "grouped by name");
const kevo = grouped.find((s) => s.name === "Kevo")!;
eq([kevo.primary.game, kevo.games, kevo.played], ["mkworld12p", ["mkworld12p"], true], "Kevo opens in 12P and plays only 12P this season");
const kevino = grouped.find((s) => s.name === "Kevino")!;
eq([kevino.primary.game, kevino.games], ["mkworld12p", ["mkworld12p", "mkworld24p", "mk8dx"]], "Kevino plays all three, best MMR in 12P");
const dxOnly = grouped.find((s) => s.name === "DxOnly")!;
eq([dxOnly.primary.game, suggestionHref(dxOnly)], ["mk8dx", "/lounge/DxOnly?game=mk8dx"], "an MK8DX-only player links to MK8DX");
eq(suggestionHref(kevo), "/lounge/Kevo", "12P is the default page");
const merged = mergeSuggestions(rows, "kev");
eq(merged.map((s) => s.name), ["Kevo", "DxOnly", "Kevino", "kev"], "an inactive exact name isn't lifted: played players by best MMR, then inactive");
eq(mergeSuggestions(rows, "kevino").map((s) => s.name)[0], "Kevino", "an active exact name comes first");
eq(mergeSuggestions(rows, "kevi").map((s) => s.name), ["Kevo", "DxOnly", "Kevino", "kev"], "no exact name: played by MMR, inactive last");
eq(mergeSuggestions(rows, "kev", 2).length, 2, "limit");
eq(suggestionLine(kevo), "Grandmaster · 15,672 MMR · #3 in MK World 12P", "suggestion line");
eq(suggestionLine(grouped.find((s) => s.name === "kev")!), "No events this season", "inactive line");
eq(groupByName([row("A b", "mk8dx", 1, 1), row("a  B", "mkworld12p", 2, 1)]).length, 1, "names match whatever the case and spacing");

// ── Did you mean ──
eq(lookupQueries("Kevvo"), ["Kev", "Kevvo"], "short name: first 3 and the whole name");
eq(lookupQueries("Hayai Kuruma"), ["Haya", "Hayai Kuruma", "uma"], "long name: first 4, whole, last 3");
eq(lookupQueries("Ab"), ["Ab"], "two letters");
eq(lookupQueries("A"), [], "one letter: nothing");
const dymRows = [
  row("Kevo", "mkworld12p", 15672, 198, 3), row("Kevko", "mkworld24p", 3500, 0), row("kevbo", "mk8dx", null, 0), row("kevv", "mk8dx", 1178, 5, 5000),
  row("Kevino", "mkworld12p", 10989, 145, 86), row("Kevril", "mkworld12p", 4243, 1, 2878), row("Zed", "mk8dx", 9000, 9, 99),
];
const dym = closestNames("Kevvo", groupByName(dymRows));
eq(dym.map((s) => s.name), ["Kevo", "kevv", "Kevino", "Kevko", "kevbo"], "closest first, inactive players count as one further");
ok(!dym.some((s) => s.name === "Kevril" || s.name === "Zed"), "too far away is left out");
eq(closestNames("Kevo", groupByName(dymRows))[0].name, "Kevo", "the exact name in another game comes first");
eq(closestNames("zzzzzz", groupByName(dymRows)).length, 0, "nothing close");

// ── Boards ──
const countries = countryBoard({
  US: { playerTotal: 1297, topSixMmr: 14530.6, topSixPlayers: [{ name: "Hayai Kuruma", mmr: 16181 }, { name: "Saber", mmr: 15886 }, { name: "a", mmr: 1 }, { name: "b", mmr: 1 }, { name: "c", mmr: 1 }, { name: "d", mmr: 1 }] },
  MX: { playerTotal: 214, topSixMmr: 9741.3, topSixPlayers: [{ name: "Keinster", mmr: 9565 }, { name: "Kevo", mmr: 15672 }, { name: "a", mmr: 1 }, { name: "b", mmr: 1 }, { name: "c", mmr: 1 }, { name: "d", mmr: 1 }] },
  XX: { playerTotal: 5, topSixMmr: 20000, topSixPlayers: [{ name: "few", mmr: 20000 }] },
  JP: { playerTotal: 1448, topSixMmr: 13393, topSixPlayers: [{ name: "x", mmr: 14000 }, { name: "a", mmr: 1 }, { name: "b", mmr: 1 }, { name: "c", mmr: 1 }, { name: "d", mmr: 1 }, { name: "e", mmr: 1 }] },
  bad: { playerTotal: 100, topSixMmr: 9999, topSixPlayers: [] },
});
eq(countries.map((c) => c.code), ["US", "JP", "MX"], "countries with six players, by top six average");
eq(countries[0].topSix, 14531, "top six average rounded");
eq(countries[2].best, { name: "Kevo", mmr: 15672 }, "best player is the highest number, not the first listed");
eq(countryBoard(null), [], "no data");
eq(countryBoard(countries.length ? { US: { playerTotal: 7, topSixMmr: 5, topSixPlayers: Array(6).fill({ name: "p", mmr: 1 }) } } : {}, 6, 1).length, 1, "limit and minimum");
const climb = climbers([
  { ...row("a", "mkworld12p", 1, 1, 10), weekChange: -5 }, { ...row("b", "mkworld12p", 1, 1, 20), weekChange: -1456 },
  { ...row("c", "mkworld12p", 1, 1, 30), weekChange: 8 }, { ...row("d", "mkworld12p", 1, 1, 40), weekChange: null }, { ...row("e", "mkworld12p", 1, 1, 50), weekChange: 0 },
]);
eq(climb.map((r) => r.name), ["b", "a"], "climbers: negative changes only, biggest climb first");
eq([nearSkip(1), nearSkip(2), nearSkip(3), nearSkip(100)], [0, 0, 0, 97], "near skip centres a rank in a page of five");

// ── Divisions and landing ──
eq([shareWord(5, 5988), shareWord(242, 5988), shareWord(2102, 5988), shareWord(0, 5988), shareWord(3, null)], ["under 0.1%", "4.0%", "35%", "0%", ""], "share words");
eq(shareWord(6, 5988), "0.1%", "0.1% exactly rounds to one decimal");
const steps = stepsFrom(null, "mkworld12p");
const counts = [
  { name: "Grandmaster", count: 5 }, { name: "Master", count: 3 }, { name: "Diamond", count: 23 }, { name: "Ruby", count: 54 }, { name: "Sapphire", count: 125 },
  { name: "Platinum", count: 242 }, { name: "Gold", count: 820 }, { name: "Silver", count: 1877 }, { name: "Bronze", count: 2102 }, { name: "Iron", count: 737 },
];
const table = divisionTable(steps, counts, 5988);
eq(table.map((d) => d.name), ["Grandmaster", "Master", "Diamond", "Ruby", "Sapphire", "Platinum", "Gold", "Silver", "Bronze", "Iron"], "divisions top first");
eq([table[0].at, table[0].count, table[0].share], [15000, 5, "under 0.1%"], "Grandmaster row");
eq(divisionTable(stepsFrom(null, "mkworld24p"), [{ name: "Master", count: 4 }], 4180)[0], { name: "Grandmaster", at: 15500, count: 0, share: "0%" }, "a division nobody is in shows 0");
// 9000 is a third of the way through Platinum (8000 to 9500): everyone above Platinum plus a third of Platinum's 242.
eq(estimateAbove(9000, steps, counts), 5 + 3 + 23 + 54 + 125 + Math.round(242 / 3), "estimate inside a division");
eq(estimateAbove(8000, steps, counts), 5 + 3 + 23 + 54 + 125 + 242, "the bottom of a division: all of it is above");
eq(estimateAbove(20000, steps, counts), 0, "above the top division's width: nobody above");
eq(estimateAbove(15500, steps, counts), Math.round(5 * (1 - 500 / 1000)), "inside the top division (as wide as the one below)");
const exact = landing(9000, steps, counts, 5988, 265);
eq([exact.division, exact.rank, exact.exact], ["Platinum", 266, true], "exact count");
eq(landingLine(exact), "9,000 is Platinum: about the top 5%, around #266 of 5,988 players this season.", "landing line");
const est = landing(9000, steps, counts, 5988);
eq([est.rank, est.exact], [5 + 3 + 23 + 54 + 125 + 81 + 1, false], "estimated rank");
eq(landingLine(landing(16500, steps, counts, 5988, 0)), "16,500 is Grandmaster: about the top 0.1%, around #1 of 5,988 players this season.", "above everyone");
eq(landingLine(landing(2000, steps, counts, 5988, 5000)), "2,000 is Bronze: higher than about 16% of players, around #5,001 of 5,988 players this season.", "below the middle");
eq(landingLine(landing(0, steps, counts, 5988, 5988)), "0 is Iron: at the bottom of the lounge, around #5,988 of 5,988 players this season.", "the bottom");
eq(landingLine(landing(9000, steps, counts, null)), "9,000 is Platinum.", "no total: division only");
eq(landing(9000, steps, counts, 5988, 99999).rank, 5988, "rank never past the total");

// ── The player page's sentence ──
const base = { name: "Kevo", mmr: 15672, worldRank: 3, countryRank: 1, country: "Mexico", events: 198, winRate: 0.7424, finishedSeason: null };
eq(playerSentence(base), "Kevo is #3 in the world and #1 in Mexico with 15,672 MMR, and has won 74% of 198 events this season.", "the full sentence");
eq(playerSentence({ ...base, countryRank: null }), "Kevo is #3 in the world with 15,672 MMR, and has won 74% of 198 events this season.", "no country rank");
eq(playerSentence({ ...base, worldRank: null, countryRank: null }), "Kevo has 15,672 MMR and has won 74% of 198 events this season.", "no ranks");
eq(playerSentence({ ...base, worldRank: null, countryRank: null, events: 0, winRate: null }), "Kevo has 15,672 MMR and hasn't played an event this season.", "no events");
eq(playerSentence({ ...base, events: 1, winRate: 1 }), "Kevo is #3 in the world and #1 in Mexico with 15,672 MMR, and has won 100% of 1 event this season.", "one event");
eq(playerSentence({ ...base, winRate: null }), "Kevo is #3 in the world and #1 in Mexico with 15,672 MMR, and has played 198 events this season.", "no win rate");
eq(playerSentence({ ...base, finishedSeason: 2, worldRank: 5, mmr: 14200, winRate: 0.7, events: 150 }), "Kevo finished season 2 at #5 in the world and #1 in Mexico with 14,200 MMR, and won 70% of 150 events.", "a finished season");
eq(playerSentence({ ...base, finishedSeason: 2, events: 0 }), null, "a season they didn't play: no sentence");
eq(playerSentence({ ...base, mmr: null, worldRank: null, countryRank: null, events: 0 }), "Kevo hasn't played an event this season.", "nothing known");

// ── Looked up lately ──
eq(parseRecent(JSON.stringify([{ name: "Kevo", game: "mkworld12p", division: "Grandmaster" }, { name: "x", game: "nope" }, "junk", { name: "Dx", game: "mk8dx" }])), [
  { name: "Kevo", game: "mkworld12p", division: "Grandmaster" }, { name: "Dx", game: "mk8dx", division: null },
], "stored list read back, junk dropped");
eq(parseRecent("not json"), [], "bad storage reads as empty");
eq(parseRecent(null), [], "nothing stored");
eq(parseRecent(JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, game: "mk8dx" })))).length, 5, "five at most");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
