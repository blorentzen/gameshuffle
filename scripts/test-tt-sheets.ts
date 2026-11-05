// Tests for the Top 10 sheet reader (src/lib/timeTrials/sheets.ts): npx tsx scripts/test-tt-sheets.ts
// A small tab in the sheets' own layout: title, the world section, then country sections under a label row.
import { parseCsv, parseSheetCsv, sheetCountries, sheetFor, sheetLinks, sheetNameKey, sheetTimes, sheetTrackId } from "../src/lib/timeTrials/sheets";

let pass = 0, fail = 0;
const eq = (got: unknown, want: unknown, what: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`FAIL ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};

const BLANK = ",".repeat(24);
const TAB = [
  "150cc" + ",".repeat(24),
  BLANK,
  BLANK,
  ",Mario Kart Stadium,,,,,Water Park\t\t\t,,,,,Sweet Sweet Canyon,,,,,Hyrule Cicuit\t\t,,,,,Overall,,,",
  ",1,,Byron,1:33.717,,1,,Vincent,1:38.132,,1,,Vincent,1:47.708,,1,,Alberto,1:46.750,,1,,Vincent,294",
  ",2,,\"Cream, Jr.\",1:33.737,,2,,Mirai,1:38.581,,2,,PF◇P.I.C.,1:47.959,,2,,Panda,1:47.080,,2,,Alberto,192",
  ",3,,vincent,1:34.000,,3,,,,,,,,,,,,,,,,,3,,Army,157",
  ",,,,,,,,,,,,,,,,,,,,,11,,YUQI,46",
  BLANK,
  ",,,,,,,,,,,USA,,,,,,,,,,,,,",
  BLANK,
  ",Mario Kart Stadium,,,,,Water Park,,,,,Sweet Sweet Canyon,,,,,Hyrule Cicuit,,,,,Overall,,,",
  ",1,,Vincent,1:34.537,,1,,Vincent,1:38.132,,1,,Mirai,1:47.900,,1,,Panda,1:47.080,,1,,Vincent,458",
  BLANK,
  ",,,,,,,,,,,Japan,,,,,,,,,,,,,",
  ",Mario Kart Stadium,,,,,Water Park,,,,,Sweet Sweet Canyon,,,,,Hyrule Cicuit,,,,,Overall,,,",
  ",1,,PF◇P.I.C.,1:35.000,,1,,Panda,1:40.000,,,,,,,,,,,,,,,",
  BLANK,
  ",,,,,,,,,,,Narnia,,,,,,,,,,,,,",
  ",Mario Kart Stadium,,,,,Rainbow Moon,,,,,,,,,,,,,,,,,,",
  ",1,,Aslan,1:36.000,,1,,Aslan,1:50.000,,,,,,,,,,,,,,,",
].join("\n");

// CSV: quotes, doubled quotes, line breaks.
eq(parseCsv('a,"b, c","say ""hi"""\n"x\ny",2'), [["a", "b, c", 'say "hi"'], ["x\ny", "2"]], "csv quoting");

// Tracks: our names, the sheets' typo, and the GBA one they call GCN.
eq(!!sheetTrackId("Hyrule Circuit") && sheetTrackId("Hyrule Cicuit") === sheetTrackId("Hyrule Circuit"), true, "the sheet's Hyrule typo reads");
eq(sheetTrackId("GCN Cheese Land"), sheetTrackId("GBA Cheese Land"), "GCN Cheese Land is GBA Cheese Land");
eq(sheetTrackId("Rainbow Moon"), null, "an unknown track reads as none");
eq(!!sheetTrackId("Tour Paris Promenade"), true, "Booster Course Pass names read");

const p = parseSheetCsv(TAB);
eq(p.entries.length, 17, "every place on the tab (9 world, 4 USA, 2 Japan, 2 in the unknown section)");
eq(p.unknownSections, ["Narnia"], "an unknown section is reported");
eq(p.unknownTracks, ["Rainbow Moon"], "an unknown track is reported");
eq(p.entries.filter((e) => e.section === "us").length, 4, "the USA section");
eq(p.entries.find((e) => e.name === "Cream, Jr.")?.timeMs, 93737, "a quoted name with a comma");
eq(p.entries.some((e) => e.name === "YUQI" || e.name === "Army"), false, "the overall points column is left out");

const times = sheetTimes(p, new Map([["1:33.717", ["https://x.com/byron/status/1"]], ["1:38.132", ["https://youtu.be/a"]]]));
const vincentMks = times.filter((t) => t.key === "vincent" && t.track === sheetTrackId("Mario Kart Stadium"));
eq(vincentMks.map((t) => t.timeMs), [93717 + 283], "Vincent and vincent are one player, their best stands (1:34.000 beats 1:34.537)");
eq(times.find((t) => t.name === "Byron")?.link, "https://x.com/byron/status/1", "a linked time gets its proof");
eq(times.filter((t) => t.timeText === "1:38.132").map((t) => t.link), ["https://youtu.be/a"], "Vincent's Water Park time is once on the list (world and USA), so it keeps its link");
eq(times.some((t) => t.track === null), false, "unknown tracks never become times");

const countries = sheetCountries([p]);
eq(countries.get("vincent"), "us", "listed under one country");
eq(countries.get(sheetNameKey("Panda")), null, "listed under two countries: none");
eq(countries.get("byron"), undefined, "only in the world section: no country");
eq(countries.has("aslan"), false, "an unknown section gives no country");

// Proof links on the published page come through Google's redirect.
const html = '<td><a target="_blank" href="https://www.google.com/url?q=https://www.youtube.com/watch?v%3DNBP2PVG95PY&amp;sa=D&amp;usg=x">1:38.646</a></td><td><a href="https://example.com">Overall</a></td>';
eq([...sheetLinks(html)], [["1:38.646", ["https://www.youtube.com/watch?v=NBP2PVG95PY"]]], "links are read from the page, by time");

// Which sheet a board's times come from.
eq(sheetFor(sheetTrackId("Mario Kart Stadium")!, "any").id, "base", "a base game track");
eq(sheetFor(sheetTrackId("Tour Paris Promenade")!, "any").id, "bcp", "a Booster Course Pass track");
eq(sheetFor(sheetTrackId("Mario Kart Stadium")!, "inside_drift").id, "inward", "Inside drift is the Inward sheet");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
