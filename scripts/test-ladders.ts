/**
 * Lounge ladder checks: npx tsx scripts/test-ladders.ts
 * Reading tables (headed teams, teams by order, FFA, knockout lists), the checks before verifying, MMR changes
 * against the lounge model, placement, the floor, divisions and settings; the 200 Lounge rules; reading a lounge's
 * records and planning a history import.
 */

import { blocking, closestName, divisionFor, divisionMoves, nameKey, parseKnockout, parseRace, roomChanges, roomIssues, roomPlaces, signed, tableTitle, type PlayerBefore } from "../src/lib/ladders/rules";
import { cleanSettings, cleanSlug, defaultSettings, formatLabel, ladderPlayerPath, ROOM_POINTS } from "../src/lib/ladders/types";
import { eventDeltas } from "../src/lib/lounge/odds";
import { LOUNGE200_PLACEMENT, lounge200Deltas, placedAt, realPow } from "../src/lib/ladders/lounge200";
import { readDump, readLoungeBotDump, readCsv, readTemplate, seasonFromName } from "../src/lib/ladders/importRead";
import { planImport } from "../src/lib/ladders/importPlan";

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}
const ok = (label: string, v: boolean) => eq(label, v, true);

const NAMES = ["Juno", "Kit", "Rook", "Sable", "Mara", "Pip", "Vex", "Dot", "Lux", "Wren", "Ash", "Bo"];
// A full 12-player room: 12 races of 15,12,10,9,8,7,6,5,4,3,2,1 = 82 a race, 984 a room.
const SCORES = [130, 118, 104, 96, 90, 84, 78, 72, 66, 60, 50, 36];
eq("room points", SCORES.reduce((a, b) => a + b, 0), ROOM_POINTS[12]);

// ── Reading race tables ───────────────────────────────────────────────────────────────────────
{
  const ffaText = NAMES.map((n, i) => `${n} ${SCORES[i]}`).join("\n");
  const ffa = parseRace(ffaText, 1);
  eq("ffa teams", ffa.teams.length, 12);
  eq("ffa first rank", ffa.teams[0].rank, 1);
  eq("ffa last rank", ffa.teams[11].rank, 12);
  eq("ffa no issues", roomIssues(ffa, new Set(NAMES.map(nameKey))), []);

  // 2v2 without tag lines: every two players in a row are a team.
  const twos = parseRace(ffaText, 2);
  eq("2v2 by order: teams", twos.teams.length, 6);
  eq("2v2 by order: first team", twos.teams[0].players.map((p) => p.name), ["Juno", "Kit"]);
  eq("2v2 by order: first total", twos.teams[0].total, 248);
  eq("2v2 by order: labels", twos.teams.map((t) => t.label).slice(0, 2), ["Team A", "Team B"]);
  eq("2v2 ranks", twos.teams.map((t) => t.rank), [1, 2, 3, 4, 5, 6]);

  // 6v6 with Lorenzi tag lines, players in any order, a penalty.
  const war = `#title room\nA - Red\nJuno 130\nRook 104\nMara 90\nVex 78\nLux 66\nAsh 50\nB - Blue\nKit 118\nSable 96\nPip 84\nDot 72\nWren 60\nBo 36\nPenalty -10`;
  const six = parseRace(war, 6);
  eq("6v6 headed teams", six.teams.map((t) => t.label), ["Red", "Blue"]);
  eq("6v6 totals", six.teams.map((t) => t.total), [518, 456]);
  eq("6v6 ranks", six.teams.map((t) => t.rank), [1, 2]);
  eq("6v6 places", roomPlaces(six).slice(0, 3).map((p) => [p.player.name, p.place]), [["Juno", 1], ["Rook", 3], ["Mara", 5]]);

  // Ties share a rank.
  const tie = parseRace("A\nJuno 100\nKit 92\nB\nRook 96\nSable 96\nC\nMara 92\nPip 100", 2);
  eq("tie ranks", tie.teams.map((t) => t.rank), [1, 1, 1]);

  // Checks.
  const short = parseRace(NAMES.slice(0, 11).map((n, i) => `${n} ${SCORES[i]}`).join("\n"), 1);
  const si = roomIssues(short, new Set(NAMES.map(nameKey)));
  ok("11 players: a check", si.some((i) => i.text.startsWith("11 players")));
  ok("11 players: not blocking", !blocking(si));
  const misread = parseRace(NAMES.map((n, i) => `${n} ${i === 0 ? 139 : SCORES[i]}`).join("\n"), 1);
  ok("misread total flagged", roomIssues(misread, new Set(NAMES.map(nameKey))).some((i) => i.text.includes("add up to 993") && i.text.includes("9 over")));
  const dup = parseRace("Juno 100\nJuno 90\nKit 80", 1);
  ok("duplicate blocks", blocking(roomIssues(dup, new Set())));
  ok("uneven teams block", blocking(roomIssues(parseRace("A\nJuno 100\nKit 92\nRook 80\nB\nSable 96\nMara 92", 2), new Set())));
  const fresh = roomIssues(ffa, new Set(NAMES.slice(1).map(nameKey)), ["Junoo", ...NAMES.slice(1)]);
  ok("new name noted with a guess", fresh.some((i) => i.text.includes("New to the lounge: Juno (did you mean Junoo?)")));
  ok("one team blocks", blocking(roomIssues(parseRace("Juno 100", 1), new Set())));
}

// ── Knockout ──────────────────────────────────────────────────────────────────────────────────
{
  const ko = parseKnockout("1. Vex\n2) Juno [us]\n3 Ash\n#a note\n4th Kit\nBo\n\n");
  eq("ko names", ko.teams.map((t) => t.players[0].name), ["Vex", "Juno", "Ash", "Kit", "Bo"]);
  eq("ko flag", ko.teams[1].players[0].flag, "us");
  eq("ko ranks", ko.teams.map((t) => t.rank), [1, 2, 3, 4, 5]);
  ok("ko short room is a check", roomIssues(ko, new Set()).some((i) => i.text.startsWith("5 players; a full room has 24")));
  eq("ko title", tableTitle({ number: 12, format: 1, tier: null }, "knockout"), "Table 12 · Knockout Tour");
}

// ── MMR changes ───────────────────────────────────────────────────────────────────────────────
{
  const s = { ...defaultSettings("mk8dx", "race"), placementEvents: 0 };
  const ffa = parseRace(NAMES.map((n, i) => `${n} ${SCORES[i]}`).join("\n"), 1);
  const even = new Map<string, PlayerBefore>(NAMES.map((n) => [nameKey(n), { mmr: 8000, events: 20 }]));
  const ch = roomChanges(ffa, even, s);
  // An even 12-player FFA: 1st beats 11 others at 0.5 expected each = 40 × 5.5 = 220.
  eq("even ffa 1st", ch[0].delta, 220);
  eq("even ffa last", ch[11].delta, -220);
  eq("even ffa zero sum", ch.reduce((a, c) => a + c.delta, 0), 0);
  eq("matches the lounge model", ch.map((c) => c.delta), eventDeltas(NAMES.map((_, i) => ({ rating: 8000, rank: i + 1 })), 1));

  // 6v6: each team rated at its average; every player gets the team's change.
  const six = parseRace(`A\n${NAMES.slice(0, 6).map((n, i) => `${n} ${SCORES[i * 2]}`).join("\n")}\nB\n${NAMES.slice(6).map((n, i) => `${n} ${SCORES[i * 2 + 1]}`).join("\n")}`, 6);
  const sixCh = roomChanges(six, even, s);
  eq("6v6 winners share one change", new Set(sixCh.filter((c) => c.team === 0).map((c) => c.delta)).size, 1);
  eq("6v6 even win", sixCh[0].delta, eventDeltas([{ rating: 8000, rank: 1 }, { rating: 8000, rank: 2 }], 6)[0]);

  // Placement: a player's first tables move twice as far.
  const placed = defaultSettings("mk8dx", "race");
  const mixed = new Map(even);
  mixed.set(nameKey("Juno"), { mmr: 8000, events: 2 });
  const pc = roomChanges(ffa, mixed, placed);
  eq("placement doubles", pc[0].delta, 440);
  ok("placement flagged", pc[0].placement && !pc[1].placement);
  // A new name starts at the ladder's start.
  const fresh = roomChanges(ffa, new Map(), placed);
  eq("new player before", fresh[0].before, 2000);

  // The floor.
  // An even room of low numbers: last place's −220 would go below zero.
  const low = new Map<string, PlayerBefore>(NAMES.map((n) => [nameKey(n), { mmr: 100, events: 30 }]));
  const lc = roomChanges(ffa, low, s);
  eq("never below 1", lc[11].after, 1);
  eq("delta follows the floor", lc[11].delta, -99);
  // Far below the room, a loss costs little: the model expected it.
  const under = new Map(even);
  under.set(nameKey("Bo"), { mmr: 50, events: 30 });
  ok("expected loss is small", roomChanges(ffa, under, s)[11].delta > -40);

  // Knockout uses the ladder's own pay (24 places, about a 12-player FFA's swing).
  const koNames = Array.from({ length: 24 }, (_, i) => `P${i + 1}`);
  const ko = parseKnockout(koNames.join("\n"));
  const koS = { ...defaultSettings("mkworld", "knockout"), placementEvents: 0 };
  const koCh = roomChanges(ko, new Map(koNames.map((n) => [nameKey(n), { mmr: 5000, events: 9 }])), koS);
  eq("ko 1st in an even room", koCh[0].delta, 230);
  eq("ko last", koCh[23].delta, -230);
}

// ── Divisions and settings ─────────────────────────────────────────────────────────────────────
{
  const s = defaultSettings("mk8dx", "race");
  eq("placement division", divisionFor(2400, 2, s).division, "Placement");
  eq("division after placement", divisionFor(2400, 5, s).division, "Bronze 1");
  eq("top division", divisionFor(17500, 40, s).division, "Grandmaster");
  const moves = divisionMoves([{ key: "juno", name: "Juno", team: 0, place: 1, score: 130, before: 7900, delta: 220, after: 8120, placement: false }], new Map([["juno", 20]]), s);
  eq("moved up", moves, [{ name: "Juno", to: "Platinum 1", up: true }]);
  const done = divisionMoves([{ key: "kit", name: "Kit", team: 0, place: 2, score: 118, before: 2300, delta: 300, after: 2600, placement: true }], new Map([["kit", 4]]), s);
  eq("placement finished", done, [{ name: "Kit", to: "Bronze 1", up: true }]);
  eq("ko divisions", defaultSettings("mkworld", "knockout").divisions.at(-1)?.name, "Grandmaster");
  const c = cleanSettings({ start: "abc", placementEvents: 99, divisions: [{ name: "Top", at: 500 }, { name: "Bottom", at: 0 }], pay: { k: 0 } }, "mk8dx", "race");
  eq("clean start falls back", c.start, 2000);
  eq("clean placement capped", c.placementEvents, 10);
  eq("clean divisions sorted", c.divisions.map((d) => d.name), ["Bottom", "Top"]);
  eq("clean pay floor", c.pay?.k, 1);
  eq("race pay default", defaultSettings("mk8dx", "race").pay, null);
  eq("slug", cleanSlug(" 200cc Lounge! "), "200cc-lounge");
  eq("slug too short", cleanSlug("a"), null);
  eq("player path", ladderPlayerPath("200cc", "Juno Kit"), "/ranked/200cc/players/Juno%20Kit");
  eq("labels", [1, 2, 6].map(formatLabel), ["FFA", "2v2", "6v6"]);
  eq("signed", [signed(112), signed(-42), signed(0)], ["+112", "−42", "±0"]);
  eq("closest", closestName("Jnuo", ["Juno", "Kit"]), "Juno");
  eq("closest none", closestName("Zed", ["Juno", "Kit"]), null);
}


// ── 200 Lounge rules ──────────────────────────────────────────────────────────────────────────
{
  // Python: (-0.5) ** 2.1 is complex, the bot keeps the real part.
  ok("realPow negative", Math.abs(realPow(-0.5, 2.1) - Math.pow(0.5, 2.1) * Math.cos(Math.PI * 2.1)) < 1e-12);
  eq("realPow positive", realPow(2, 3), 8);
  // A made-up 2v2 room worked out with the bot's own code (Kiwi on their first table counts as 0 in Brio's team).
  const teams = [{ rating: (10874 + 8102) / 2, rank: 1 }, { rating: (0 + 7733) / 2, rank: 2 }, { rating: (8650 + 9440) / 2, rank: 3 }, { rating: (10391 + 7298) / 2, rank: 4 }, { rating: (9902 + 11960) / 2, rank: 5 }, { rating: (8915 + 11206) / 2, rank: 6 }];
  eq("lounge200 2v2 room", lounge200Deltas(teams, 2), [178, 563, -8, -71, -331, -335]);
  eq("lounge200 zero-sum-ish", lounge200Deltas([{ rating: 5000, rank: 1 }, { rating: 5000, rank: 2 }], 1), [20, -20]);
  eq("lounge200 tie toward the lower", lounge200Deltas([{ rating: 6000, rank: 1 }, { rating: 4000, rank: 1 }], 1).map(Math.sign), [-1, 1]);
  eq("lounge200 unknown format", lounge200Deltas([{ rating: 1, rank: 1 }], 5), [0]);
  eq("placed 110", placedAt(110, "A", LOUNGE200_PLACEMENT), 5250);
  eq("placed 109", placedAt(109, "A", LOUNGE200_PLACEMENT), 3750);
  eq("placed tier C asks 10 more", [placedAt(119, "C", LOUNGE200_PLACEMENT), placedAt(120, "c", LOUNGE200_PLACEMENT), placedAt(59, "tier-c", LOUNGE200_PLACEMENT)], [3750, 5250, 1000]);
  eq("placed nothing", placedAt(null, null, LOUNGE200_PLACEMENT), 1000);
  // Through roomChanges: a ladder on 200 Lounge rules.
  const set200 = cleanSettings({ rules: "lounge200", placement: LOUNGE200_PLACEMENT }, "mk8dx", "race");
  eq("lounge200 settings", [set200.rules, set200.placementEvents, set200.placement?.countZero], ["lounge200", 1, true]);
  const body = ["A", "Rook 120", "Quill 80", "B", "Kiwi 92", "Brio 98", "C", "Sable 90", "Odin 80", "D", "Tamsin 85", "Juniper 75", "E", "Vexa 70", "Moss 60", "F", "Larkspur 30", "Pixelfin 4"].join("\n");
  const room = parseRace(body, 2);
  const before = new Map<string, PlayerBefore>([["rook", 10874], ["quill", 8102], ["brio", 7733], ["sable", 8650], ["odin", 9440], ["tamsin", 10391], ["juniper", 7298], ["vexa", 9902], ["moss", 11960], ["larkspur", 8915], ["pixelfin", 11206]].map(([k, m]) => [k as string, { mmr: m as number, events: 9 }]));
  const ch = roomChanges(room, before, set200, { tier: "A" });
  const kiwi = ch.find((c) => c.key === "kiwi")!;
  eq("lounge200 new player placed by score", [kiwi.before, kiwi.delta, kiwi.after, kiwi.placement], [3750, 563, 4313, true]);
  eq("lounge200 teammate shares the change", ch.find((c) => c.key === "brio")!.delta, 563);
  eq("lounge200 last team", ch.find((c) => c.key === "pixelfin")!.delta, -335);
  const lounge = roomChanges(room, before, defaultSettings("mk8dx", "race"));
  ok("lounge rules unchanged for others", lounge.find((c) => c.key === "kiwi")!.before === 2000);
}

// ── Reading a lounge's records ────────────────────────────────────────────────────────────────
const DUMP = `-- MySQL dump
CREATE TABLE \`ranks\` (
  \`rank_id\` bigint unsigned NOT NULL,
  \`rank_name\` varchar(12) DEFAULT NULL,
  \`mmr_min\` int DEFAULT NULL,
  \`mmr_max\` int DEFAULT NULL,
  \`placement_mmr\` int DEFAULT NULL
) ENGINE=InnoDB;
INSERT INTO \`ranks\` VALUES (1,'Gold',4500,5999,5250),(2,'Iron',0,1499,1000),(3,'Placement',-2,-1,2500),(4,'Silver',3000,4499,3750);
CREATE TABLE \`tier\` (
  \`tier_id\` bigint unsigned NOT NULL,
  \`tier_name\` varchar(4) DEFAULT NULL
) ENGINE=InnoDB;
INSERT INTO \`tier\` VALUES (10,'a'),(11,'c');
CREATE TABLE \`player\` (
  \`player_id\` bigint unsigned NOT NULL,
  \`player_name\` varchar(16) NOT NULL,
  \`mkc_id\` int unsigned NOT NULL,
  \`country_code\` varchar(3) DEFAULT '',
  \`fc\` varchar(15) DEFAULT NULL,
  \`mmr\` int DEFAULT NULL,
  \`base_mmr\` int DEFAULT NULL,
  \`peak_mmr\` int DEFAULT NULL
) ENGINE=InnoDB;
INSERT INTO \`player\` VALUES (100000000000000001,'O\\'Neil',5,'us','1234-5678-9012',4400,NULL,4500),(100000000000000002,'Kit',6,'jp',NULL,3900,NULL,4000),(100000000000000003,'Rook',7,'',NULL,NULL,NULL,NULL),(100000000000000004,'Lux',8,'gb',NULL,3000,NULL,3100);
CREATE TABLE \`mogi\` (
  \`mogi_id\` int unsigned NOT NULL,
  \`mogi_format\` int DEFAULT NULL,
  \`tier_id\` bigint unsigned DEFAULT NULL,
  \`table_url\` varchar(240) DEFAULT NULL,
  \`create_date\` timestamp NOT NULL,
  \`has_reduced_loss\` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB;
INSERT INTO \`mogi\` VALUES (1,1,10,'https://x','2025-01-01 20:00:00',0),(2,2,11,NULL,'2025-01-02 20:00:00',0),(3,1,10,NULL,'2025-01-03 20:00:00',1);
CREATE TABLE \`player_mogi\` (
  \`player_id\` bigint unsigned NOT NULL,
  \`mogi_id\` int unsigned NOT NULL,
  \`place\` int unsigned DEFAULT NULL,
  \`score\` int unsigned DEFAULT NULL,
  \`prev_mmr\` int DEFAULT NULL,
  \`mmr_change\` int DEFAULT NULL,
  \`new_mmr\` int DEFAULT NULL,
  \`is_sub\` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB;
INSERT INTO \`player_mogi\` VALUES (100000000000000001,1,1,120,4000,100,4100,0),(100000000000000002,1,2,90,4000,-100,3900,0),(100000000000000001,2,1,100,4000,40,4040,0),(100000000000000002,2,1,90,3900,40,3940,0),(100000000000000004,2,1,80,3000,-40,2960,0),(100000000000000003,2,1,70,3100,-40,3060,0);
`;
{
  const t = readDump(DUMP);
  eq("dump tables", [...t.keys()], ["ranks", "tier", "player", "mogi", "player_mogi"]);
  eq("dump escaped quote", t.get("player")![0].player_name, "O'Neil");
  eq("dump NULL", t.get("player")![2].mmr, null);
  eq("dump number", t.get("player_mogi")![0].score, 120);
  eq("season from name", [seasonFromName("s7200lounge-export.sql"), seasonFromName("season-12.sql"), seasonFromName("export.sql")], [7, 12, null]);
  const src = readLoungeBotDump(DUMP, "s7200lounge-export.sql");
  eq("bot season", src.season, 7);
  eq("bot divisions (placement left out, sorted)", src.divisions.map((d) => d.name), ["Iron", "Silver", "Gold"]);
  eq("bot tier names", src.tables.map((x) => x.tier), ["A", "C", "A"]);
  eq("bot dates as UTC", src.tables[0].at, "2025-01-01T20:00:00.000Z");
  eq("bot edited tables", [...src.edited], ["3"]);
  eq("bot friend codes dropped", JSON.stringify(src.players).includes("1234-5678"), false);

  // Table 2 is a 2v2 where two teams tied for 1st: the shared change sorts them. O'Neil's 4100 → 4000 gap is a penalty;
  // Kit's file MMR (3900) is under their last table (3940): a season-end penalty.
  const plan = planImport([src], [{ id: "x", name: "Rook", key: "rook", discordId: "999" }]);
  eq("plan tables (no-result table left out)", plan.tables.length, 2);
  eq("plan skipped", plan.counts.skippedTables, 1);
  eq("plan ties sorted", plan.counts.tiesSorted, 1);
  const two = plan.tables[1];
  const teamOf = (name: string) => two.results.find((r) => plan.players[r.p].name.startsWith(name))!.team;
  ok("plan teammates by change", teamOf("O'Neil") === teamOf("Kit") && teamOf("Lux") === teamOf("Rook") && teamOf("Kit") !== teamOf("Lux"));
  eq("plan gap penalty", plan.adjustments.filter((a) => a.at < "2025-01-02T20:00:00").map((a) => [plan.players[a.p].name, a.before, a.after, a.kind]), [["O'Neil", 4100, 4000, "penalty"]]);
  const end = plan.adjustments.find((a) => plan.players[a.p].name === "Kit" && a.kind === "penalty");
  eq("plan season-end penalty", end ? [end.before, end.after] : null, [3940, 3900]);
  eq("plan clash with an existing name", plan.players.find((p) => p.ref === "100000000000000003")!.name, "Rook (2)");
  eq("plan rules", plan.rules, "lounge200");
  const kitRating = plan.ratings.find((r) => plan.players[r.p].name === "Kit")!;
  eq("plan rating", [kitRating.mmr, kitRating.peak, kitRating.events, kitRating.wins], [3900, 4000, 2, 1]);
  eq("plan body reads back", plan.counts.bodiesOff, 0);
  ok("plan body has the source line", two.body.startsWith("#source 2"));
  eq("plan country", plan.players.find((p) => p.name === "Lux")!.country, "gb");

  // The CSV template.
  const rows = readCsv('a,b\n"x, y",2\r\n\n3,"say ""hi"""\n');
  eq("csv quotes", rows, [{ a: "x, y", b: "2" }, { a: "3", b: 'say "hi"' }]);
  const tpl = readTemplate({
    players: "discord_id,name,country,final_mmr\n123456789012345678,Juno,us,2100\n223456789012345678,Kit,,\n",
    tables: "season,table,date,format,tier\n3,1,2025-02-18 20:05:00,FFA,\n",
    results: "season,table,player,place,score,mmr_before,change,mmr_after\n3,1,123456789012345678,1,90,2000,60,2060\n3,1,Kit,2,80,2000,-60,1940\n",
  }, { players: "players.csv", tables: "tables.csv", results: "results.csv" });
  eq("template season", tpl.map((x) => [x.season, x.keyedBy, x.tables.length, x.results.length]), [[3, "discord", 1, 2]]);
  eq("template name maps to the id", tpl[0].results[1].player, "223456789012345678");
  const tplPlan = planImport(tpl);
  eq("template plan", [tplPlan.counts.tables, tplPlan.rules, tplPlan.adjustments.map((a) => a.after)], [1, null, [2100]]);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
