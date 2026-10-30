// Time trial rules and tracks. Run: npx tsx scripts/test-time-trials.ts
import { parseTime, formatTime, formatGap, rankRows, ordinal, videoProof, parseTtPlayer, MIN_MS, MAX_MS } from "../src/lib/timeTrials/rules";
import { readLines, linesLookRight, bestPerTrack } from "../src/lib/timeTrials/importText";
import { TT_GAMES, TT_GAME_ORDER, ttTracks, ttTrack, ttCups, trackKey, trackFromKey, searchTracks, matchTrack, trackPath, gameBySlug, isClassFor, trackBySegment, gamePath } from "../src/lib/timeTrials/tracks";
import { abbreviationTable, readQuaxly, embedText, yourRows, newBests, readTitle, nameKey } from "../src/lib/timeTrials/quaxly";
import { toCheckRows, checkSummary } from "../src/lib/timeTrials/importRows";
import { readCategory, categoryQuery, categoryText, vehiclesFor, isItems, isVehicle } from "../src/lib/timeTrials/categories";
import { playerPagePath, readPlayerSlug } from "../src/lib/timeTrials/playerPath";
import { isVerified } from "../src/lib/timeTrials/rules";
import { fasterThanRecord, recordFor } from "../src/lib/timeTrials/records";

let pass = 0, fail = 0;
function ok(cond: unknown, label: string) {
  if (cond) pass++;
  else { fail++; console.log("FAIL", label); }
}
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ── reading times ───────────────────────────────────────────────
eq(parseTime("1:52.384"), 112384, "colon dot");
eq(parseTime("1'52\"384"), 112384, "in-game marks");
eq(parseTime("1’52”384"), 112384, "curly marks");
eq(parseTime("1:52:384"), 112384, "three colons");
eq(parseTime("1.52.384"), 112384, "dots");
eq(parseTime(" 1:52.384 "), 112384, "spaces");
eq(parseTime("1:52.38"), 112380, "two decimals");
eq(parseTime("1:52"), 112000, "no decimals");
eq(parseTime("152384"), 112384, "digits only");
eq(parseTime("52.384"), 52384, "under a minute");
eq(parseTime("2:05.009"), 125009, "leading zero ms");
eq(parseTime("0:29.999"), null, "too short");
eq(parseTime("10:00.001"), null, "too long");
eq(parseTime("1:75.000"), null, "seconds over 59");
eq(parseTime("abc"), null, "text");
eq(parseTime(""), null, "empty");
eq(parseTime("1:5.384"), null, "one-digit seconds");
ok(MIN_MS === 30000 && MAX_MS === 600000, "bounds");

// ── writing times ───────────────────────────────────────────────
eq(formatTime(112384), "1:52.384", "format");
eq(formatTime(60000), "1:00.000", "format minute");
eq(formatTime(125009), "2:05.009", "format padding");
for (let ms = MIN_MS; ms <= MAX_MS; ms += 997) ok(parseTime(formatTime(ms)) === ms, `round trip ${ms}`);
eq(formatGap(412), "0.412", "gap");
eq(formatGap(-1234), "1.234", "gap negative");

// ── ranking ─────────────────────────────────────────────────────
const ranked = rankRows([{ timeMs: 3 }, { timeMs: 1 }, { timeMs: 2 }, { timeMs: 2 }, { timeMs: 5 }]);
eq(ranked.map((r) => [r.rank, r.row.timeMs]), [[1, 1], [2, 2], [2, 2], [4, 3], [5, 5]], "ties share a place");
eq([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"], "ordinals");

// ── proof links ─────────────────────────────────────────────────
eq(videoProof("https://www.youtube.com/watch?v=abc"), "https://www.youtube.com/watch?v=abc", "youtube");
eq(videoProof("youtu.be/abc"), "https://youtu.be/abc", "no scheme");
eq(videoProof("https://clips.twitch.tv/Something"), "https://clips.twitch.tv/Something", "twitch clip");
eq(videoProof("http://streamable.com/x#t"), "https://streamable.com/x", "http upgraded, hash dropped");
eq(videoProof("https://evil.example.com/youtube.com"), null, "unknown host");
eq(videoProof("https://youtube.com.evil.io/x"), null, "lookalike host");
eq(videoProof("javascript:alert(1)"), null, "script");
eq(videoProof(""), null, "empty");

eq(parseTtPlayer("u:0b895a02-f717-472a-ae44-f43ad9b727c0"), { kind: "u", id: "0b895a02-f717-472a-ae44-f43ad9b727c0" }, "player key");
eq(parseTtPlayer("g:0b895a02-f717-472a-ae44-f43ad9b727c0"), null, "guests aren't time trial players");

// ── tracks ──────────────────────────────────────────────────────
eq(ttTracks("mk8dx").length, 96, "MK8DX has 96 tracks");
eq(ttTracks("mkworld").length, 40, "MK World has 40 Time Trials courses");
ok(!ttTracks("mkworld").some((t) => /Night/.test(t.name)), "no night runs");
eq(ttTracks("mkworld").filter((t) => t.cup === "Super Mario Kart").length, 10, "ten SNES courses");
for (const g of TT_GAME_ORDER) {
  const list = ttTracks(g);
  ok(new Set(list.map((t) => t.id)).size === list.length, `${g} ids unique`);
  ok(new Set(list.map((t) => t.name)).size === list.length, `${g} names unique`);
  for (const t of list) {
    ok(/^[a-z0-9-]+$/.test(t.id), `${g} id slug ${t.id}`);
    ok(ttTrack(g, t.id) === t, `${g} lookup ${t.id}`);
    ok(trackFromKey(trackKey(t)) === t, `${g} key round trip ${t.id}`);
    ok(searchTracks(t.name, g)[0] === t, `${g} exact search finds ${t.name}`);
  }
  eq(ttCups(g).reduce((n, c) => n + c.tracks.length, 0), list.length, `${g} cups cover every track`);
}
eq(ttTrack("mk8dx", "shell-mario-circuit")?.name, "GBA Mario Circuit", "GBA prefix");
eq(ttTrack("mk8dx", "flower-mario-circuit")?.name, "Mario Circuit", "MK8 Mario Circuit has no prefix");
eq(ttTrack("mk8dx", "golden-dash-paris-promenade")?.name, "Tour Paris Promenade", "Tour prefix");
eq(ttTrack("mk8dx", "lightning-rainbow-road")?.name, "N64 Rainbow Road", "N64 Rainbow Road");
eq(searchTracks("rainbow road", "mk8dx").length, 5, "five Rainbow Roads");
eq(searchTracks("dk spaceport")[0]?.id, "flower-dk-spaceport", "search both games");
eq(searchTracks("paris promenade", "mk8dx")[0]?.id, "golden-dash-paris-promenade", "search without prefix");
eq(searchTracks("snes mario circuit 1", "mkworld")[0]?.id, "snes-mario-circuit-1", "SNES course");
eq(searchTracks("", "mkworld").length, 25, "empty search caps at 25");
eq(trackPath({ game: "mkworld", id: "flower-dk-spaceport" }), "/time-trials/mario-kart-world/dk-spaceport", "path");
eq(trackPath({ game: "mk8dx", id: "mushroom-water-park" }, 200), "/time-trials/mario-kart-8-deluxe/water-park?cc=200", "path 200cc");
eq(trackPath({ game: "mk8dx", id: "mushroom-water-park" }, 150), "/time-trials/mario-kart-8-deluxe/water-park", "path default cc");
eq(gameBySlug("mario-kart-world")?.id, "mkworld", "game by slug");
ok(isClassFor("mk8dx", 200) && !isClassFor("mkworld", 200) && isClassFor("mkworld", 150), "classes");
eq(TT_GAMES.mkworld.classes, [150], "World 150cc only");
eq(matchTrack("Mario Circuit", "mk8dx")?.id, "flower-mario-circuit", "whole name wins over the bare GBA/DS names");
eq(matchTrack("GBA Mario Circuit", "mk8dx")?.id, "shell-mario-circuit", "GBA Mario Circuit");
eq(matchTrack("Rainbow Road", "mk8dx")?.id, "special-rainbow-road", "MK8 Rainbow Road is its whole name");
eq(matchTrack("rainbow", "mk8dx"), null, "rainbow alone is ambiguous");
eq(matchTrack("Paris Promenade", "mk8dx")?.id, "golden-dash-paris-promenade", "bare name, unique");
eq(matchTrack("dk spaceport")?.id, "flower-dk-spaceport", "either game");
eq(matchTrack("Moo Moo Meadows")?.game, "mkworld", "no game given: World's whole name beats MK8DX's bare Wii Moo Moo Meadows");
eq(matchTrack("Moo Moo Meadows", "mk8dx")?.id, "shell-moo-moo-meadows", "MK8DX's Wii Moo Moo Meadows by its bare name");
eq(matchTrack("Moo Moo Meadows", "mkworld")?.id, "mushroom-moo-moo-meadows", "World's Moo Moo Meadows");
eq(matchTrack("xyz"), null, "nothing");
for (const g of TT_GAME_ORDER) for (const t of ttTracks(g)) ok(matchTrack(t.name, g) === t, `${g} whole name matches ${t.name}`);

// ── paste import (line reader) ──────────────────────────────────
{
  const paste = [
    "Your times:",
    "1. Mario Kart Stadium - 1:53.204 (150cc)",
    "2. Water Park: 1:57.012",
    "GBA Mario Circuit 1'45\"300 200cc",
    "Tour Paris Promenade | 1:52.200",
    "Rainbow Road 2:41.006",
    "Mario Kart Stadium - 1:52.999",
    "No time on this line",
  ].join("\n");
  const rows = readLines(paste, "mk8dx");
  eq(rows.length, 6, "one row per line with a time");
  eq(rows[0].trackId, "mushroom-mario-kart-stadium", "numbered line");
  eq(rows[0].timeMs, 113204, "time read");
  eq(rows[1].trackId, "mushroom-water-park", "colon line");
  eq(rows[2].trackId, "shell-mario-circuit", "GBA with in-game marks");
  eq(rows[2].cc, 200, "200cc read");
  eq(rows[3].cc, 150, "a time ending in .200 isn't a class");
  eq(rows[3].trackId, "golden-dash-paris-promenade", "pipe separator");
  eq(rows[4].trackId, "special-rainbow-road", "Rainbow Road is MK8's");
  ok(linesLookRight(rows), "mostly readable");
  eq(bestPerTrack(rows).find((r) => r.trackId === "mushroom-mario-kart-stadium")?.timeMs, 112999, "fastest kept per track");
  eq(readLines("DK Spaceport 1:52.384 200cc", "mkworld")[0].cc, 150, "World is always 150cc");
  const abbr = readLines("rMMM 1:23.456\nbCMo 1:59.999", "mk8dx");
  ok(linesLookRight(abbr), "abbreviations read without AI");
  eq(abbr.map((r) => r.trackId), ["shell-moo-moo-meadows", "golden-dash-choco-mountain"], "abbreviations matched");
}

// ── addresses (6A, 7A) ──────────────────────────────────────────
for (const g of TT_GAME_ORDER) {
  const slugs = ttTracks(g).map((t) => t.slug);
  eq(new Set(slugs).size, slugs.length, `${g} name addresses unique`);
  ok(slugs.every((x) => /^[a-z0-9-]+$/.test(x)), `${g} addresses are plain`);
  for (const t of ttTracks(g)) {
    if (trackBySegment(g, t.slug)?.id !== t.id) ok(false, `${g} ${t.slug} resolves`);
    if (trackBySegment(g, t.id)?.id !== t.id) ok(false, `${g} old id ${t.id} still resolves`);
  }
}
eq(trackPath({ game: "mkworld", id: "flower-dk-spaceport" }), "/time-trials/mario-kart-world/dk-spaceport", "track address drops the cup");
eq(trackPath({ game: "mk8dx", id: "special-rainbow-road" }, 200), "/time-trials/mario-kart-8-deluxe/rainbow-road?cc=200", "200cc address");
eq(ttTracks("mk8dx").find((t) => t.id === "lightning-rainbow-road")?.slug, "n64-rainbow-road", "retro address keeps its console");
eq(trackBySegment("mk8dx", "electrodrome")?.id, "star-electrodome", "Electrodrome spelled right, id unchanged");
eq(gamePath("mk8dx"), "/time-trials/mario-kart-8-deluxe", "game page");
eq(gamePath("mk8dx", 200), "/time-trials/mario-kart-8-deluxe?cc=200", "game page at 200cc");

// ── Quaxly (picks 5A, migration 1-5) ────────────────────────────
{
  const table = abbreviationTable();
  eq(table.length, 96, "96 abbreviations");
  ok(table.every((x) => x.track), "every abbreviation has a track");
  eq(new Set(table.map((x) => x.track?.id)).size, 96, "abbreviations hit 96 different tracks");
  eq(new Set(table.map((x) => x.abbr.toLowerCase())).size, 96, "abbreviations differ ignoring case");
  const at = (a: string) => table.find((x) => x.abbr === a)?.track?.name;
  eq([at("MKS"), at("Ed"), at("rMMM"), at("rRRd"), at("dYC"), at("dRiR"), at("bPP"), at("bCMo"), at("bCMa"), at("bAtD"), at("bAD"), at("bRR7"), at("bRRw"), at("bDCt"), at("bDC")],
    ["Mario Kart Stadium", "Electrodrome", "Wii Moo Moo Meadows", "N64 Rainbow Road", "GCN Yoshi Circuit", "GBA Ribbon Road", "Tour Paris Promenade", "N64 Choco Mountain", "Wii Coconut Mall", "Tour Athens Dash", "Tour Amsterdam Drift", "3DS Rainbow Road", "Wii Rainbow Road", "Wii Daisy Circuit", "GCN Daisy Cruiser"], "abbreviations name the right tracks");

  eq(readTitle("150cc Shrooms"), { cc: 150, items: "shrooms" }, "title: 150cc Shrooms");
  eq(readTitle("200cc No items"), { cc: 200, items: "none" }, "title: no items");
  eq(readTitle("Shroomless"), { cc: null, items: "none" }, "title: shroomless");
  eq(readTitle("Nitro tracks"), null, "a heading isn't a title");

  // The server board from Britton's screenshot (2026-10-29), as Discord's API sends the embed.
  const board = embedText({
    title: "150cc Shrooms",
    description: "__**Nitro tracks**__\n**MKS**: `1:36.990`\nqwacks\n**WP**: `1:40.640`\nMūnch\n**SSC**: `1:49.652`\nqwacks\n**TH**: `0:00.836`\nproves we're better than D7\n**SA**: `1:03.733`\nProTimeIsNow\n**ED**: `1:57.610`\nqwacks\n__**Retro tracks**__\n**rMMM**: `1:28.111`\nCheese",
  });
  const b = readQuaxly(board)!;
  eq(b.game, "mk8dx", "board: game from the abbreviations");
  eq([b.cc, b.items, b.title], [150, "shrooms", "150cc Shrooms"], "board: title read");
  ok(b.hasHolders, "board: holders found");
  eq(b.rows.map((r) => r.trackText), ["MKS", "WP", "SSC", "TH", "SA", "ED", "rMMM"], "board: every track line");
  eq(b.rows.map((r) => r.holder), ["qwacks", "Mūnch", "qwacks", "proves we're better than D7", "ProTimeIsNow", "qwacks", "Cheese"], "board: holder under each time");
  eq(b.rows.find((r) => r.trackText === "TH")?.timeMs, null, "board: 0:00.836 isn't a time");
  eq(b.rows.find((r) => r.trackText === "ED")?.trackName, "Electrodrome", "board: ED is Electrodrome");
  const mine = yourRows(b, ["QWACKS", "someone"], false);
  eq(mine.mine.map((r) => r.trackText), ["MKS", "SSC", "ED"], "board: only your rows");
  eq(yourRows(b, ["Munch"], false).mine.map((r) => r.trackText), ["WP"], "board: names match without accents");
  eq(nameKey("Pro Time Is Now"), nameKey("ProTimeIsNow"), "names match without spaces");

  // Copied from Discord on a computer: no markdown, same shape.
  const pasted = readQuaxly("150cc Shrooms\nNitro tracks\nMKS: 1:36.990\nqwacks\nWP: 1:40.640\nMūnch", "mk8dx")!;
  eq(pasted.rows.map((r) => [r.trackId, r.timeMs, r.holder]), [["mushroom-mario-kart-stadium", 96990, "qwacks"], ["mushroom-water-park", 100640, "Mūnch"]], "paste: same as the embed");

  // A player's own list (player picked): no holders.
  const own = readQuaxly("200cc Shrooms\nMKS: 1:31.500\nbCMa: 2:05.250\nrRRy: 1:55.001", "mk8dx")!;
  eq([own.cc, own.hasHolders, own.rows.length], [200, false, 3], "own list: 200cc, no holders");
  eq(yourRows(own, [], true).mine.length, 3, "own list: all yours when it's yours");
  eq(yourRows(own, [], false).mine.length, 0, "own list: none when it's someone else's");

  // Mario Kart World: full names.
  const world = readQuaxly("Shrooms\nDK Spaceport: 1:52.384\nCrown City: 2:01.006\nGreat ? Block Ruins: 2:10.500")!;
  eq(world.game, "mkworld", "World list: game from the names");
  eq(world.rows.map((r) => r.trackId), ["flower-dk-spaceport", "flower-crown-city", "special-great-block-ruins"].map((id) => ttTrack("mkworld", id) ? id : world.rows.find((r) => r.trackName === "Great ? Block Ruins")?.trackId), "World list: names matched");

  // Only new or faster.
  const bests = new Map([["mushroom-mario-kart-stadium", 96000], ["mushroom-water-park", 101000]]);
  const nb = newBests(pasted.rows, bests);
  eq([nb.save.map((r) => r.trackId), nb.already], [["mushroom-water-park"], 1], "only faster times saved");
  eq(newBests(b.rows, new Map()).unclear, 1, "unreadable rows counted (0:00.836; 1:03.733 reads, the record check stops it)");
}

// ── record floor (8A) and the check table ───────────────────────
{
  const sa = recordFor("mk8dx", "star-sunshine-airport", 150)!;
  ok(sa > 100_000, "Sunshine Airport has a 150cc record");
  ok(fasterThanRecord("mk8dx", "star-sunshine-airport", 150, 63733), "1:03.733 on Sunshine Airport is refused");
  ok(!fasterThanRecord("mk8dx", "star-sunshine-airport", 150, sa), "the record itself counts");
  ok(!fasterThanRecord("mk8dx", "star-sunshine-airport", 150, sa - Math.floor(sa * 0.005)), "a new record within the slack counts");
  ok(recordFor("mkworld", "flower-dk-spaceport", 150) != null, "World tracks have records");

  const list = readQuaxly("150cc Shrooms\nMKS: 1:36.990\nqwacks\nWP: 1:40.640\nMūnch\nSA: 1:03.733\nqwacks\nSSC: 1:49.652\nqwacks\nSSC: 1:50.000\nqwacks\nZZZ: 1:50.000\nqwacks", "mk8dx")!;
  const { mine } = yourRows(list, ["qwacks"], true);
  const idx = new Set(mine.map((r) => list.rows.indexOf(r)));
  const rows = toCheckRows(list.rows, list.game, list.cc, idx, new Map([["mushroom-mario-kart-stadium|150", 96000]]));
  eq(rows.map((r) => [r.trackText ?? r.trackName, r.keep, r.note]), [
    ["Mario Kart Stadium", false, "already"],
    ["Water Park", false, "others"],
    ["Sunshine Airport", false, "record"],
    ["Sweet Sweet Canyon", true, null],
    ["Sweet Sweet Canyon", false, "duplicate"],
    ["ZZZ", false, "unclear"],
  ], "check rows: ticked only when yours, new, real and fastest");
  eq(rows[0].savedMs, 96000, "already: says what you have");
  eq(checkSummary(rows), { keep: 1, already: 1, unclear: 1, record: 1, others: 1 }, "check summary");
  const plain = toCheckRows(readLines("MKS 1:40.000\nWP 1:45.000", "mk8dx"), "mk8dx", 150, null, new Map());
  eq(plain.map((r) => r.keep), [true, true], "a plain paste is all yours");
}

// ── round 2: categories, addresses, players pages ───────────────
{
  eq(readCategory("mk8dx", {}), { items: "shrooms", vehicle: "any" }, "default category");
  eq(readCategory("mk8dx", { items: "none", vehicle: "scooty" }), { items: "none", vehicle: "scooty" }, "no mushrooms, Mr. Scooty");
  eq(readCategory("mkworld", { items: "none", vehicle: "teddy" }), { items: "none", vehicle: "any" }, "no vehicle boards in World");
  eq(readCategory("mk8dx", { items: "mushrooms", vehicle: "kart" }), { items: "shrooms", vehicle: "any" }, "unknown values fall back");
  eq(vehiclesFor("mk8dx"), ["any", "inside_drift", "scooty", "teddy"], "MK8DX vehicle boards");
  eq(vehiclesFor("mkworld"), ["any"], "World: the open board only");
  ok(isItems("none") && !isItems("nita"), "items values");
  ok(isVehicle("inside_drift") && !isVehicle("bike"), "vehicle values");
  eq(categoryQuery({ cc: 150, defaultCc: 150, items: "shrooms", vehicle: "any" }), "", "defaults leave no query");
  eq(categoryQuery({ cc: 200, defaultCc: 150, items: "none", vehicle: "teddy" }), "?cc=200&items=none&vehicle=teddy", "every part in the query");
  eq(categoryText("mk8dx", 200, "none", "scooty", true), "200cc, no mushrooms, Mr. Scooty", "category words");
  eq(categoryText("mkworld", 150, "shrooms", "any", false), "mushrooms", "World category words");
  eq(trackPath({ game: "mk8dx", id: "flower-mario-circuit" }, 150, { items: "none", vehicle: "inside_drift" }), "/time-trials/mario-kart-8-deluxe/mario-circuit?items=none&vehicle=inside_drift", "track address with a category");
  eq(trackPath({ game: "mkworld", id: "flower-dk-spaceport" }, 150, { items: "none", vehicle: "scooty" }), "/time-trials/mario-kart-world/dk-spaceport?items=none", "World drops the vehicle");
  eq(gamePath("mk8dx", 200, { items: "none" }), "/time-trials/mario-kart-8-deluxe?cc=200&items=none", "game page with a category");

  eq(playerPagePath("u:11111111-1111-1111-1111-111111111111", "/u/quinn"), "/time-trials/players/quinn", "public account page");
  eq(playerPagePath("u:11111111-1111-1111-1111-111111111111", null), "/time-trials/players/u-11111111-1111-1111-1111-111111111111", "private account page");
  eq(playerPagePath("i:22222222-2222-2222-2222-222222222222", null), "/time-trials/players/i-22222222-2222-2222-2222-222222222222", "Discord player page");
  eq(readPlayerSlug("me"), { kind: "me" }, "me");
  eq(readPlayerSlug("Quinn"), { kind: "username", username: "quinn" }, "username slug");
  eq(readPlayerSlug("i-22222222-2222-2222-2222-222222222222"), { kind: "key", player: "i:22222222-2222-2222-2222-222222222222" }, "Discord slug");
  eq(readPlayerSlug("bad slug!"), null, "bad slug");
  ok(isVerified("checked") && !isVerified("waiting") && !isVerified("none") && !isVerified("rejected"), "only a checked clip is Verified");
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
