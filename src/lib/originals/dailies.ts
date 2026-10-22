/**
 * The dailies together (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/7AXQ8c8LmnSHHvMAsqQVWZ): the Daily Shuffle, the
 * Daily Dex, today's Fire Round and the Weekly each keep their own page and
 * streak, and link up through a today bar, "Next up", one share for the day and
 * a streak card per game. Fire Round joined the three dailies in the bar on
 * 2026-10-19 (https://claude.ai/artifact/WhFgrMQv8oVHQ4e5cvfXRx); the Weekly
 * sits on a line under the bar. Client-safe and light: no game data is imported here (the Dex alone is
 * 1,025 Pokémon), so each game reports its own state.
 *
 * In the browser, each game writes what it knows to localStorage (`gs-dailies`)
 * as it loads and after every guess; signed in, /api/dailies fills in games
 * played on another device. A new daily joins by adding an entry to DAILIES.
 */

import { DAILY_DEX_PUBLIC, DUEL_PUBLIC, FIRE_ROUND_PUBLIC } from "@/lib/games-visibility";
import { gsAddDays, gsDay, gsWeekStart, gsWeekday } from "@/lib/time/gsClock";

export type DailiesId = "shuffle" | "dex" | "fire" | "duel" | "weekly";
/** The ones that run every day (the Weekly runs by week). */
export type DailyGameId = "shuffle" | "dex" | "fire" | "duel";
/** The guessing dailies (a result in guesses). */
export type PuzzleDailyId = "shuffle" | "dex";
/** One day on a streak card: won, saved on the last chance, missed, played (Fire Round: no win or loss), or not played. */
export type DayMark = "won" | "saved" | "missed" | "played" | null;

export interface DailiesGame {
  id: DailiesId;
  /** The full name, as on its page. */
  name: string;
  /** Share lines' and cards' name. */
  short: string;
  /** The today bar's name (three fit across a phone). */
  tab: string;
  href: string;
  /** Its color in shared text (matches its share image and header). */
  square: string;
  /** "Next up" line. */
  pitch: string;
}

export const DAILIES: Record<DailiesId, DailiesGame> = {
  shuffle: { id: "shuffle", name: "The Daily Shuffle", short: "Daily Shuffle", tab: "Shuffle", href: "/daily", square: "🟪", pitch: "Guess today's Nintendo character." },
  dex: { id: "dex", name: "The Daily Dex", short: "Daily Dex", tab: "Dex", href: "/daily-dex", square: "🟧", pitch: "Guess today's Pokémon from all 1,025." },
  fire: { id: "fire", name: "Fire Round", short: "Fire Round", tab: "Fire", href: "/daily-trivia", square: "🟥", pitch: "60 seconds of trivia, the same questions for everyone." },
  // Gold on navy (picks 2026-10-21): apart from the Shuffle's violet, the Dex's warm orange, Fire Round's red and the Weekly's teal.
  duel: { id: "duel", name: "The Daily Duel", short: "Daily Duel", tab: "Duel", href: "/daily-duel", square: "🟨", pitch: "Knock out today's trainer with the same six cards as everyone." },
  weekly: { id: "weekly", name: "The Weekly Challenge", short: "Weekly", tab: "Weekly", href: "/weekly", square: "🟩", pitch: "Answer this week's question and guess the crowd's top three." },
};

/** The Dex joins the bar, Next up and the cards once it launches (and in development, to try it). */
export const DAILY_DEX_SHOWN = DAILY_DEX_PUBLIC || process.env.NODE_ENV !== "production";

/** Fire Round joins once it's public (and in development). Never in the Discord Activity, which only has the puzzles. */
export const FIRE_ROUND_SHOWN = FIRE_ROUND_PUBLIC || process.env.NODE_ENV !== "production";

/**
 * The Daily Duel joins the bar, Next up and the cards once it's public (and in development, to
 * try it). The bar lays out four cells (randomizer.css, .dailies-bar--4). Never in the Discord Activity.
 */
export const DUEL_SHOWN = DUEL_PUBLIC || process.env.NODE_ENV !== "production";

/** The games shown, in order: Shuffle, Dex, Fire Round, the Duel, then the Weekly (also Next up's order). */
export function dailiesShown(current?: DailiesId, opts: { fire?: boolean; duel?: boolean } = {}): DailiesId[] {
  return (["shuffle", "dex", "fire", "duel", "weekly"] as DailiesId[]).filter((id) => {
    if (id === "dex") return DAILY_DEX_SHOWN || current === "dex";
    if (id === "fire") return opts.fire !== false && (FIRE_ROUND_SHOWN || current === "fire");
    if (id === "duel") return opts.duel !== false && (DUEL_SHOWN || current === "duel");
    return true;
  });
}

/** `seconds`: the solve time, from Start to the final guess. */
export interface DailyResult { guesses: number; main: number; solved: boolean; saved: boolean; seconds?: number | null }
/** `fastest`: the best solve time in that game. `top`: Fire Round's best score on today's round. */
export interface DailiesStats { played: number; won: number; streak: number; best: number; saved?: number; fastest?: number | null; top?: number | null }

/** Today's Fire Round, once played: the score and the right answers. */
export interface FireDayResult { score: number; right: number }

/** Today's official Daily Duel, once over: won or lost, in how many turns, the day's par and the time. */
export interface DuelDayResult { won: boolean; turns: number; par: number | null; seconds: number | null }

/** A solve time as people say it: "0:42", "12:05", "2h 14m". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What a game knows about itself today. */
export interface DailiesEntry {
  /** The Pacific day for a daily; the week's Monday for the Weekly. */
  day: string;
  /** Puzzle number, or the Weekly's week number. */
  number: number;
  state: "fresh" | "playing" | "done";
  /** A daily's result once it's over. */
  result?: DailyResult | null;
  /** Fire Round's result once today's round is played. */
  fire?: FireDayResult | null;
  /** The Daily Duel's result once today's official duel is over. */
  duel?: DuelDayResult | null;
  stats?: DailiesStats | null;
  /** The last 14 days, oldest first (signed in, from the server). */
  recent?: DayMark[] | null;
  /** The Weekly: weeks played and top 10 finishes (signed in). */
  weeks?: { played: number; topTen: number } | null;
}

export type DailiesEntries = Partial<Record<DailiesId, DailiesEntry>>;

interface Store {
  entries: DailiesEntries;
  /** Signed-out history for the streak cards' last two weeks. */
  history: Partial<Record<DailyGameId, Record<string, DayMark>>>;
}

export const DAILIES_KEY = "gs-dailies";
const EVENT = "gs-dailies";
const KEEP_DAYS = 40;

export function readDailiesStore(raw?: string | null): Store {
  try {
    const s = JSON.parse(raw ?? localStorage.getItem(DAILIES_KEY) ?? "null") as Store | null;
    return { entries: s?.entries ?? {}, history: s?.history ?? {} };
  } catch {
    return { entries: {}, history: {} };
  }
}

export function markOf(r: DailyResult): DayMark {
  return !r.solved ? "missed" : r.saved ? "saved" : "won";
}

/** A finished entry's mark for the streak card's last two weeks. */
function entryMark(id: DailiesId, entry: DailiesEntry): DayMark {
  if (id === "fire") return entry.fire ? "played" : null;
  if (id === "duel") return entry.duel ? (entry.duel.won ? "won" : "missed") : null;
  return entry.result ? markOf(entry.result) : null;
}

/** A game reports its state; the bar, Next up and the cards update on every page open in this browser. */
export function reportDaily(id: DailiesId, entry: DailiesEntry) {
  try {
    const s = readDailiesStore();
    s.entries[id] = entry;
    const mark = id !== "weekly" && entry.state === "done" ? entryMark(id, entry) : null;
    if (id !== "weekly" && mark) {
      const h = { ...(s.history[id] ?? {}) };
      h[entry.day] = mark;
      const cutoff = gsAddDays(entry.day, -KEEP_DAYS);
      for (const d of Object.keys(h)) if (d < cutoff) delete h[d];
      s.history[id] = h;
    }
    localStorage.setItem(DAILIES_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* the bar just knows less */ }
}

/** For useSyncExternalStore: this tab's reports and other tabs' writes. */
export function subscribeDailies(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === DAILIES_KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}
export function dailiesSnapshot(): string {
  try { return localStorage.getItem(DAILIES_KEY) ?? ""; } catch { return ""; }
}

/** The day an entry should be for: today, or this week for the Weekly. */
export function currentDay(id: DailiesId, at: Date | number = Date.now()): string {
  return id === "weekly" ? gsWeekStart(at) : gsDay(at);
}

/** Days left in the Weekly's week, counting today (Monday = 7, Sunday = 1). */
export function weeklyDaysLeft(at: Date | number = Date.now()): number {
  return 7 - ((gsWeekday(gsDay(at)) + 6) % 7);
}

/** The last `n` days of marks, oldest first, from the browser's history. */
export function recentFromHistory(history: Record<string, DayMark> | undefined, today: string, n = 14): DayMark[] {
  return Array.from({ length: n }, (_, i) => history?.[gsAddDays(today, i - n + 1)] ?? null);
}

/**
 * Today's entries: the browser's reports for today, with the server's
 * (signed in) filling in or finishing what this browser doesn't know. A
 * finished result on either side wins over "playing".
 */
export function mergeDailies(local: DailiesEntries, server: DailiesEntries | null, history: Store["history"], at: Date | number = Date.now()): DailiesEntries {
  const out: DailiesEntries = {};
  for (const id of ["shuffle", "dex", "fire", "duel", "weekly"] as DailiesId[]) {
    const day = currentDay(id, at);
    const l = local[id]?.day === day ? local[id] : undefined;
    const sv = server?.[id]?.day === day ? server[id] : undefined;
    if (!l && !sv) continue;
    const done = sv?.state === "done" ? sv : l?.state === "done" ? l : undefined;
    const base = done ?? l ?? sv!;
    // Just finished here and the server hasn't caught up: this browser's numbers are newer.
    const ahead = l?.state === "done" && sv?.state !== "done" ? l : null;
    const aheadMark = ahead ? entryMark(id, ahead) : null;
    const serverRecent = sv?.recent && aheadMark ? [...sv.recent.slice(0, -1), aheadMark] : sv?.recent;
    out[id] = {
      ...base,
      // Signed in, the account's stats and history are the truth; signed out, the browser's.
      stats: (ahead ? ahead.stats : null) ?? sv?.stats ?? base.stats ?? null,
      recent: serverRecent ?? (id === "weekly" ? null : recentFromHistory(history[id as DailyGameId], day)),
      weeks: sv?.weeks ?? base.weeks ?? null,
    };
  }
  return out;
}

/** "won in 14 (par 13)" or "lost". */
export function duelScoreText(r: DuelDayResult): string {
  return r.won ? `won in ${r.turns}${r.par ? ` (par ${r.par})` : ""}` : "lost";
}

/** "3/5", "X/5", or "last chance" for a save. */
export function scoreText(r: DailyResult): string {
  return !r.solved ? `X/${r.main}` : r.saved ? "last chance" : `${r.guesses}/${r.main}`;
}

/** A streak shows a flame from three days, like the Discord results card. */
const flame = (streak?: number) => (streak && streak >= 3 ? ` 🔥${streak}` : "");

function dateLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The games with something to share today, in order. */
export function sharedToday(entries: DailiesEntries, shown: DailiesId[]): DailiesId[] {
  return shown.filter((id) => entries[id]?.state === "done" && (id === "weekly" || (id === "fire" ? !!entries[id]?.fire : id === "duel" ? !!entries[id]?.duel : !!entries[id]?.result)));
}

/**
 * Everything played today in one post: a line per game with its color square.
 * Each game's own "Copy just this one" keeps its full grid.
 */
export function combinedShareText(entries: DailiesEntries, shown: DailiesId[], at: Date | number = Date.now()): string {
  const lines = sharedToday(entries, shown).map((id) => {
    const e = entries[id]!;
    const g = DAILIES[id];
    // Before a game's first day (a preview) it has no number yet.
    const name = e.number >= 1 ? `${g.short} #${e.number}` : g.short;
    if (id === "weekly") return `${g.square} ${name} · answered`;
    if (id === "fire") return `${g.square} ${name} · ${e.fire!.score.toLocaleString("en-US")} · ${e.fire!.right} right${flame(e.stats?.streak)}`;
    if (id === "duel") return `${g.square} ${name} · ${duelScoreText(e.duel!)}${e.duel!.won && e.duel!.seconds != null ? ` ⏱ ${formatTime(e.duel!.seconds)}` : ""}${flame(e.stats?.streak)}`;
    const time = e.result!.solved && e.result!.seconds != null ? ` ⏱ ${formatTime(e.result!.seconds)}` : "";
    return `${g.square} ${name} · ${scoreText(e.result!)}${time}${flame(e.stats?.streak)}`;
  });
  return [`GameShuffle dailies · ${dateLabel(gsDay(at))}`, ...lines, "https://www.gameshuffle.co/daily"].join("\n");
}

/** The next game to play after `current`: the first shown one not done yet. */
export function nextUp(entries: DailiesEntries, shown: DailiesId[], current: DailiesId): DailiesId | null {
  // Today's challenger first while the Duel is unplayed (challenger picks, 2026-10-22).
  if (shown.includes("duel") && current !== "duel" && entries.duel?.state !== "done") return "duel";
  return shown.find((id) => id !== current && entries[id]?.state !== "done") ?? null;
}

/** The today bar's word for a game. */
export function barStatus(id: DailiesId, e: DailiesEntry | undefined, current: boolean, at: Date | number = Date.now()): string {
  if (e?.state === "done") {
    if (id === "weekly") return "✓ Answered";
    if (id === "fire") return e.fire ? `✓ ${e.fire.score.toLocaleString("en-US")}` : "Done";
    if (id === "duel") return !e.duel ? "Done" : e.duel.won ? `✓ ${e.duel.turns} turns` : "Lost";
    return !e.result ? "Done" : e.result.solved ? `✓ ${scoreText(e.result)}` : scoreText(e.result);
  }
  if (id === "weekly") {
    const left = weeklyDaysLeft(at);
    return left === 1 ? "Last day" : `${left} days left`;
  }
  return current || e?.state === "playing" ? "Playing" : "New today";
}

/** The Weekly's line under the today bar: what's left of its week, or that you're locked in. */
export function weeklyLine(e: DailiesEntry | undefined, at: Date | number = Date.now()): { status: string; action: string } {
  if (e?.state === "done") return { status: "locked in · results Monday", action: "View" };
  const left = weeklyDaysLeft(at);
  // Monday: the new question (one short line on a phone; last week's results are on the Weekly's page).
  if (left === 7) return { status: "new this week", action: "Play" };
  return { status: left === 1 ? "last day" : `${left} days left`, action: "Play" };
}
