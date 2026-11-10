/**
 * Twitch now: averaging a month of daily readings of Twitch's top games, the categories left out, counting a game's
 * streams, and matching a Twitch name to our catalog. Pure apart from the catalog lookup, no Twitch or database.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-twitch-top.ts
 */

import { countStreams, isGameCategory, summarizeReadings, type TwitchReading } from "../src/lib/platform/twitchTopRules";
import { catalogForTwitch } from "../src/lib/platform/twitchTop";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else { failed += 1; console.error(`FAIL ${name}`, detail ?? ""); }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const r = (day: string, game_id: string, name: string, rank: number, viewers: number, en_viewers = 0, streams = 100): TwitchReading =>
  ({ day, game_id, name, rank, viewers, en_viewers, streams });

// Categories
check("Just Chatting is left out", !isGameCategory("Just Chatting"));
check("whole-name match, any case", !isGameCategory("  slots "));
check("Slots in a game name is still a game", isGameCategory("Slots of Fun Racing"));
check("Chess stays in", isGameCategory("Chess"));
check("a game is a game", isGameCategory("Fortnite"));

// Counting streams
eq("count streams", countStreams([
  { viewer_count: 1000, language: "en" }, { viewer_count: 500, language: "es" }, { viewer_count: -4, language: "en" }, { viewer_count: Number.NaN, language: "en" },
]), { viewers: 1500, en: 1000, streams: 4 });
eq("no streams", countStreams([]), { viewers: 0, en: 0, streams: 0 });

// Empty
eq("no readings", summarizeReadings([]), { days: 0, latestDay: null, games: [] });

// Three days; a game missing a day counts 0 for it; a non-game is dropped; names follow the latest reading.
const rows: TwitchReading[] = [
  r("2026-11-07", "1", "Fortnite", 1, 90_000, 45_000),
  r("2026-11-07", "2", "Just Chatting", 2, 300_000, 200_000),
  r("2026-11-07", "3", "Sonic Racing", 150, 3_000, 3_000),
  r("2026-11-08", "1", "Fortnite", 2, 60_000, 30_000),
  r("2026-11-08", "4", "Dead by Daylight", 5, 30_000, 15_000),
  r("2026-11-09", "1", "Fortnite", 1, 120_000, 60_000),
  r("2026-11-09", "3", "Sonic Racing: CrossWorlds", 120, 6_000, 3_000),
  r("2026-11-09", "4", "Dead by Daylight", 4, 30_000, 0),
];
const s = summarizeReadings(rows);
eq("days", s.days, 3);
eq("latest day", s.latestDay, "2026-11-09");
eq("order: most watched first, non-games out", s.games.map((g) => g.id), ["1", "4", "3"]);
const fort = s.games.find((g) => g.id === "1")!;
eq("Fortnite average", fort.avg, 90_000);
eq("Fortnite today", [fort.rank, fort.viewers, fort.seen], [1, 120_000, 3]);
eq("Fortnite English share", fort.english, 0.5);
const dbd = s.games.find((g) => g.id === "4")!;
eq("missing day counts 0", dbd.avg, 20_000);
eq("Dead by Daylight seen", dbd.seen, 2);
eq("English over the window", dbd.english, 0.25);
const sonic = s.games.find((g) => g.id === "3")!;
eq("name follows the latest reading", sonic.name, "Sonic Racing: CrossWorlds");
eq("Sonic average", sonic.avg, 3_000);

// Out of the latest reading
const gone = summarizeReadings([r("2026-11-08", "9", "Old Game", 10, 10_000), r("2026-11-09", "1", "Fortnite", 1, 5_000)]);
const old = gone.games.find((g) => g.id === "9")!;
eq("not in the latest reading", [old.rank, old.viewers], [null, null]);
eq("still averaged over every day", old.avg, 5_000);

// English share never above 1 even if stored oddly
const odd = summarizeReadings([r("2026-11-09", "1", "Fortnite", 1, 100, 500)]);
eq("English capped", odd.games[0].english, 1);
eq("no viewers, no share", summarizeReadings([r("2026-11-09", "1", "Fortnite", 1, 0, 0)]).games[0].english, null);

// Ties: same average, more viewers today first, then by name
const tie = summarizeReadings([
  r("2026-11-08", "a", "Beta", 2, 100), r("2026-11-09", "a", "Beta", 2, 100),
  r("2026-11-08", "b", "Alpha", 1, 150), r("2026-11-09", "b", "Alpha", 3, 50),
  r("2026-11-08", "c", "Aardvark", 4, 100), r("2026-11-09", "c", "Aardvark", 4, 100),
]);
eq("ties", tie.games.map((g) => g.name), ["Aardvark", "Beta", "Alpha"]);

// Catalog matching by Twitch name
eq("Twitch name to the catalog", catalogForTwitch("Super Mario Party Jamboree")?.slug, "mario-party-series");
eq("plain name to the catalog", catalogForTwitch("Mario Kart 8 Deluxe")?.slug, "mario-kart-8-deluxe");
eq("unknown game", catalogForTwitch("Some Game Nobody Has Heard Of 2049"), null);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
