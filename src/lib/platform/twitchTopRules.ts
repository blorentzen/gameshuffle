/**
 * Twitch now (game spaces picks 2026-11-09, "Keep watching Twitch"): the rules for reading Twitch's top games once a
 * day and averaging them over 30 days, so the next game spaces are picked from a month of readings instead of one
 * morning. The server side (taking a reading, matching our catalog and spaces) is src/lib/platform/twitchTop.ts.
 * Client-safe and pure.
 */

/** How many of Twitch's top games each reading keeps. Community games we care about (Sonic) sit below 100. */
export const TWITCH_TOP_GAMES = 200;
/** The window the card averages over, in Pacific days. */
export const TWITCH_WINDOW_DAYS = 30;
/** Readings older than this many days are deleted when a new one is taken. */
export const TWITCH_KEEP_DAYS = 180;

/**
 * Twitch categories that aren't games, and gambling (left out of the card, kept in the readings). Matched on the whole
 * name. Chess stays in: it's a game people play together.
 */
const NOT_GAMES = new Set([
  "just chatting", "irl", "music", "art", "asmr", "sports", "special events", "always on", "talk shows & podcasts",
  "food & drink", "travel & outdoors", "science & technology", "software and game development", "makers & crafting",
  "beauty & body art", "fitness & health", "politics", "animals, aquariums, and zoos", "pools, hot tubs, and beaches",
  "i'm only sleeping", "co-working & studying", "djs", "crypto", "games + demos", "retro", "kings league",
  "slots", "virtual casino", "poker", "casino", "blackjack", "roulette", "stocks and bonds",
]);

export function isGameCategory(name: string): boolean {
  return !NOT_GAMES.has(name.trim().toLowerCase());
}

/** One game in one reading, as stored. */
export interface TwitchReading {
  day: string;
  game_id: string;
  name: string;
  rank: number;
  viewers: number;
  en_viewers: number;
  streams: number;
}

/** One game across the window. */
export interface TwitchTrend {
  id: string;
  /** Its name in the latest reading it was in. */
  name: string;
  /** Average viewers a day over the readings in the window; a reading it wasn't in counts as 0. */
  avg: number;
  /** In the latest reading, or null when it wasn't in it. */
  rank: number | null;
  viewers: number | null;
  /** Share of its viewers watching English streams, over the window (0 to 1), or null with no viewers. */
  english: number | null;
  /** How many readings it was in, out of `TwitchTrendSummary.days`. */
  seen: number;
}

export interface TwitchTrendSummary {
  /** Readings (days) in the window. */
  days: number;
  latestDay: string | null;
  games: TwitchTrend[];
}

/**
 * Average the readings: each game's viewers a day over every day that has a reading (a day without one, when the job
 * didn't run, doesn't count against anyone), most watched first. Categories that aren't games are left out.
 */
export function summarizeReadings(rows: TwitchReading[]): TwitchTrendSummary {
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const latestDay = days.at(-1) ?? null;
  const by = new Map<string, { name: string; nameDay: string; sum: number; en: number; seen: number; rank: number | null; viewers: number | null }>();
  for (const r of rows) {
    const g = by.get(r.game_id) ?? { name: r.name, nameDay: r.day, sum: 0, en: 0, seen: 0, rank: null, viewers: null };
    if (r.day >= g.nameDay) { g.name = r.name; g.nameDay = r.day; }
    g.sum += Math.max(0, r.viewers);
    g.en += Math.min(Math.max(0, r.en_viewers), Math.max(0, r.viewers));
    g.seen += 1;
    if (r.day === latestDay) { g.rank = r.rank; g.viewers = r.viewers; }
    by.set(r.game_id, g);
  }
  const games: TwitchTrend[] = [];
  for (const [id, g] of by) {
    if (!isGameCategory(g.name)) continue;
    games.push({
      id, name: g.name,
      avg: days.length ? Math.round(g.sum / days.length) : 0,
      rank: g.rank, viewers: g.viewers,
      english: g.sum > 0 ? g.en / g.sum : null,
      seen: g.seen,
    });
  }
  games.sort((a, b) => b.avg - a.avg || (b.viewers ?? -1) - (a.viewers ?? -1) || a.name.localeCompare(b.name));
  return { days: days.length, latestDay, games };
}

/** Viewers and streams for one game, from its top live streams. */
export function countStreams(streams: { viewer_count: number; language: string }[]): { viewers: number; en: number; streams: number } {
  let viewers = 0;
  let en = 0;
  for (const s of streams) {
    const v = Number.isFinite(s.viewer_count) ? Math.max(0, Math.round(s.viewer_count)) : 0;
    viewers += v;
    if (s.language === "en") en += v;
  }
  return { viewers, en, streams: Math.min(streams.length, 100) };
}
