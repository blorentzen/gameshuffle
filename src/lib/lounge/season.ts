/**
 * A lounge player's season, worked out from their own MMR history (pure,
 * client-safe). The lounge page (/lounge/<name>) and the chat commands read
 * these. Decided in the competitive dashboard picks (2026-10-20, all as
 * recommended): season chart, nights, the next division, formats, partners,
 * free-for-all placements and tiers.
 *
 * An event is a verified table (reason "Table"); a win is an event that raised
 * the number, a loss one that lowered it (the lounge counts it the same way).
 */

import { isEvent, type MmrChange, type MmrGame } from "@/lib/mmr/rules";
import { gsDay } from "@/lib/time/gsClock";

/** A night runs from 6am to 6am Pacific, so a session past midnight stays with the evening it started. */
export const NIGHT_ROLLOVER_MS = 6 * 60 * 60_000;
export const nightOf = (at: string) => gsDay(Date.parse(at) - NIGHT_ROLLOVER_MS);

export type Format = "FFA" | "2v2" | "3v3" | "4v4" | "5v5" | "6v6" | "Teams";
export const FORMAT_ORDER: Format[] = ["FFA", "2v2", "3v3", "4v4", "5v5", "6v6", "Teams"];

/** 12 teams of 12 players = free-for-all, 6 teams = 2v2, and so on (the same rule works for 24 players). */
export function formatOf(c: Pick<MmrChange, "teams" | "players">): Format {
  const teams = c.teams ?? 0, players = c.players ?? 0;
  if (!teams || !players || teams === players) return "FFA";
  const size = Math.round(players / teams);
  return (["2v2", "3v3", "4v4", "5v5", "6v6"][size - 2] as Format | undefined) ?? "Teams";
}

const events = (changes: MmrChange[]) => changes.filter(isEvent);
const oldestFirst = (changes: MmrChange[]) => [...changes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id);

export interface Record3 { events: number; wins: number; losses: number; net: number }
function tally(list: MmrChange[]): Record3 {
  let wins = 0, losses = 0, net = 0;
  for (const c of list) { net += c.delta; if (c.delta > 0) wins++; else if (c.delta < 0) losses++; }
  return { events: list.length, wins, losses, net };
}

/** The season record across events. */
export const seasonRecord = (changes: MmrChange[]): Record3 => tally(events(changes));

/** Longest run of wins in a row this season. */
export function bestWinStreak(changes: MmrChange[]): number {
  let best = 0, run = 0;
  for (const c of oldestFirst(events(changes))) { run = c.delta > 0 ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

/** The number after every change, oldest first (placement included), for the season chart. */
export function seasonSeries(changes: MmrChange[]): { at: string; mmr: number; event: boolean }[] {
  return oldestFirst(changes).map((c) => ({ at: c.at, mmr: c.mmr, event: isEvent(c) }));
}

export interface Night extends Record3 {
  /** The night's Pacific day (events before 6am count toward the day before). */
  day: string;
  start: string;
  end: string;
  /** The number after the night's last change. */
  mmr: number;
}

/** Events grouped by night, newest first. Penalties count toward the night's net. */
export function nights(changes: MmrChange[]): Night[] {
  const out: Night[] = [];
  let cur: MmrChange[] = [];
  const close = () => {
    const evs = cur.filter(isEvent);
    if (evs.length) {
      const t = tally(evs);
      out.push({ ...t, net: cur.reduce((n, c) => n + c.delta, 0), day: nightOf(cur[0].at), start: cur[0].at, end: cur[cur.length - 1].at, mmr: cur[cur.length - 1].mmr });
    }
    cur = [];
  };
  for (const c of oldestFirst(changes.filter((c) => c.reason !== "Placement"))) {
    if (cur.length && nightOf(c.at) !== nightOf(cur[0].at)) close();
    cur.push(c);
  }
  close();
  return out.reverse();
}

export interface FormatRow extends Record3 { format: Format }
export function byFormat(changes: MmrChange[]): FormatRow[] {
  const map = new Map<Format, MmrChange[]>();
  for (const c of events(changes)) { const f = formatOf(c); map.set(f, [...(map.get(f) ?? []), c]); }
  return FORMAT_ORDER.filter((f) => map.has(f)).map((f) => ({ format: f, ...tally(map.get(f)!) }));
}

export interface TierRow extends Record3 { tier: string; averageScore: number | null }
/** The lounge's tiers from the top: squad queue, then X and S, then A, AB, B, BC and on down. */
const TIER_ORDER = ["SQ", "X", "S", "A", "AB", "B", "BC", "C", "CD", "D", "DE", "E", "EF", "F", "FG", "G"];
const tierRank = (t: string) => { const i = TIER_ORDER.indexOf(t.toUpperCase()); return i < 0 ? TIER_ORDER.length : i; };

/** By tier, in the lounge's order (SQ first, then S, A, AB, B...). */
export function byTier(changes: MmrChange[]): TierRow[] {
  const map = new Map<string, MmrChange[]>();
  for (const c of events(changes)) if (c.tier) map.set(c.tier, [...(map.get(c.tier) ?? []), c]);
  return [...map.entries()]
    .sort(([a], [b]) => tierRank(a) - tierRank(b) || a.localeCompare(b))
    .map(([tier, list]) => {
      const scores = list.map((c) => c.score).filter((s): s is number => s != null);
      return { tier, ...tally(list), averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
    });
}

export interface PartnerRow extends Record3 { playerId: number; formats: Format[]; averageScore: number | null }
/** Teammates on team events, most events first. */
export function partners(changes: MmrChange[], limit = 8): PartnerRow[] {
  const map = new Map<number, { list: MmrChange[]; scores: number[] }>();
  for (const c of events(changes)) {
    (c.partners ?? []).forEach((id, i) => {
      const row = map.get(id) ?? { list: [], scores: [] };
      row.list.push(c);
      const s = c.partnerScores?.[i];
      if (typeof s === "number") row.scores.push(s);
      map.set(id, row);
    });
  }
  return [...map.entries()]
    .map(([playerId, { list, scores }]) => ({
      playerId, ...tally(list),
      formats: FORMAT_ORDER.filter((f) => list.some((c) => formatOf(c) === f)),
      averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    }))
    .sort((a, b) => b.events - a.events || b.net - a.net)
    .slice(0, limit);
}

/** How often each place came up in free-for-all events (index 0 = 1st). Sized to the biggest field played. */
export function placements(changes: MmrChange[]): { field: number; counts: number[]; events: number } {
  const ffa = events(changes).filter((c) => formatOf(c) === "FFA" && c.place != null);
  const field = Math.max(12, ...ffa.map((c) => c.players ?? 12));
  const counts = Array.from({ length: field }, () => 0);
  for (const c of ffa) if (c.place! >= 1 && c.place! <= field) counts[c.place! - 1]++;
  return { field, counts, events: ffa.length };
}

export interface Pace {
  /** Average gain on a win and loss on a loss, this season. */
  gain: number;
  loss: number;
  winRate: number;
  /** Expected change per event at this pace. */
  perEvent: number;
  /** Events and nights to cover `toNext` at this pace (null when the pace isn't climbing). */
  events: number | null;
  nights: number | null;
}

/** How long the next division takes at this season's pace. Needs 5 events to say anything. */
export function paceTo(toNext: number | null, changes: MmrChange[]): Pace | null {
  const evs = events(changes);
  const wins = evs.filter((c) => c.delta > 0), losses = evs.filter((c) => c.delta < 0);
  if (toNext == null || toNext <= 0 || evs.length < 5) return null;
  const gain = wins.length ? wins.reduce((n, c) => n + c.delta, 0) / wins.length : 0;
  const loss = losses.length ? -losses.reduce((n, c) => n + c.delta, 0) / losses.length : 0;
  const winRate = wins.length / evs.length;
  const perEvent = winRate * gain - (1 - winRate) * loss;
  const ns = nights(changes);
  const perNight = ns.length ? evs.length / ns.length : 0;
  const count = perEvent > 0 ? Math.ceil(toNext / perEvent) : null;
  return { gain: Math.round(gain), loss: Math.round(loss), winRate, perEvent, events: count, nights: count != null && perNight > 0 ? Math.ceil(count / perNight) : null };
}

/** The best event of the season (biggest gain). */
export function bestEvent(changes: MmrChange[]): MmrChange | null {
  return events(changes).reduce<MmrChange | null>((best, c) => (!best || c.delta > best.delta ? c : best), null);
}

export interface NightSplit { early: Record3 & { average: number }; late: (Record3 & { average: number }) | null; cutoff: number }

/** How a player does early in a night against later on: events 1 to `cutoff` of each night, then the rest. */
export function lateInNight(changes: MmrChange[], cutoff = 4): NightSplit {
  const early: MmrChange[] = [], late: MmrChange[] = [];
  let night = "", n = 0;
  for (const c of oldestFirst(events(changes))) {
    const key = nightOf(c.at);
    if (key !== night) { night = key; n = 0; }
    n++;
    (n <= cutoff ? early : late).push(c);
  }
  const withAvg = (list: MmrChange[]) => { const t = tally(list); return { ...t, average: list.length ? t.net / list.length : 0 }; };
  return { early: withAvg(early), late: late.length ? withAvg(late) : null, cutoff };
}

// ── Past seasons and the career (lounge page picks round 3, 2026-10-20) ──────

/** The first season MKCentral keeps for each game (an earlier one answers "Invalid season").
 *  MK World's season 1 (Sep 7, 2025 to Jan 31, 2026) was one mode for 12 and 24 players;
 *  asking either game for it returns the same season. */
export const LOUNGE_FIRST_SEASON: Record<MmrGame, number> = { mkworld12p: 1, mkworld24p: 1, mk8dx: 4 };

/** True for the season MK World's 12 and 24 player lounges shared. */
export const sharedSeason = (game: MmrGame, season: number) => game !== "mk8dx" && season === 1;

/** Every season the picker offers, newest first (the current one included). */
export function seasonList(game: MmrGame, current: number | null): number[] {
  if (current == null || current < LOUNGE_FIRST_SEASON[game]) return current != null ? [current] : [];
  const out: number[] = [];
  for (let s = current; s >= LOUNGE_FIRST_SEASON[game]; s--) out.push(s);
  return out;
}

/** "Season 3 (now)", "Season 2". */
export const seasonLabel = (season: number, current: number | null) => `Season ${season}${season === current ? " (now)" : ""}`;

/** The season's worst event (biggest loss). */
export function worstEvent(changes: MmrChange[]): MmrChange | null {
  return events(changes).reduce<MmrChange | null>((worst, c) => (!worst || c.delta < worst.delta ? c : worst), null);
}

/** The newest `n` events, newest first. */
export const lastEvents = (changes: MmrChange[], n = 10): MmrChange[] =>
  [...events(changes)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id).slice(0, n);

/** "top 0.1%" / "top 4%" from a world rank among the season's players (rounded up, so it's never better than true).
 *  null when either is missing or the rank falls outside the count (players ranked without an event). */
export function topShare(rank: number | null | undefined, total: number | null | undefined): string | null {
  if (!rank || !total || rank < 1 || total < 1 || rank > total) return null;
  const pct = (rank / total) * 100;
  if (pct < 1) return `top ${Math.max(0.1, Math.ceil(pct * 10) / 10).toFixed(1)}%`;
  return `top ${Math.ceil(pct)}%`;
}

/** At most `max` points from a long series, keeping the first, the last, and each slice's high and low,
 *  so a career chart keeps its peaks without drawing every event. */
export function thinSeries(values: number[], max = 90): number[] {
  if (values.length <= max) return values.slice();
  const out: number[] = [values[0]];
  const inner = values.slice(1, -1);
  const buckets = Math.max(1, Math.floor((max - 2) / 2));
  const size = inner.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const slice = inner.slice(Math.floor(b * size), Math.floor((b + 1) * size));
    if (!slice.length) continue;
    let lo = 0, hi = 0;
    slice.forEach((v, i) => { if (v < slice[lo]) lo = i; if (v > slice[hi]) hi = i; });
    for (const i of lo === hi ? [lo] : [Math.min(lo, hi), Math.max(lo, hi)]) out.push(slice[i]);
  }
  out.push(values[values.length - 1]);
  return out;
}

/** One season on the Career tab. */
export interface CareerSeason {
  season: number;
  current: boolean;
  /** MK World's season 1, shared by the 12 and 24 player lounges. */
  shared: boolean;
  /** At least one event that season. */
  played: boolean;
  mmr: number | null;
  maxMmr: number | null;
  division: string | null;
  events: number;
  winRate: number | null;
  worldRank: number | null;
  /** The number after every change, oldest first (placement included), thinned for the chart. */
  series: number[];
  /** That season's division starts (they moved between seasons). */
  steps: { name: string; at: number }[];
}

export interface CareerTotals { seasons: number; peak: number | null; events: number; winRate: number | null; bestRank: number | null }

/** The Career row: seasons played, the best peak, every event, the win rate across them and the best world rank. */
export function careerTotals(rows: CareerSeason[]): CareerTotals {
  const played = rows.filter((r) => r.played);
  const peaks = played.map((r) => r.maxMmr ?? r.mmr).filter((v): v is number => v != null);
  const ranks = played.map((r) => r.worldRank).filter((v): v is number => v != null && v > 0);
  const events = played.reduce((n, r) => n + r.events, 0);
  const weighted = played.filter((r) => r.winRate != null && r.events > 0);
  const weightedEvents = weighted.reduce((n, r) => n + r.events, 0);
  return {
    seasons: played.length,
    peak: peaks.length ? Math.max(...peaks) : null,
    events,
    winRate: weightedEvents ? weighted.reduce((n, r) => n + (r.winRate ?? 0) * r.events, 0) / weightedEvents : null,
    bestRank: ranks.length ? Math.min(...ranks) : null,
  };
}

/** Events by weekday (0 = Sunday), each counted on its night's day (an event at 1am belongs to the evening before).
 *  `dayOf` turns a time into the weekday in the reader's own time zone. */
export function byWeekday(evs: { at: string; delta: number }[], dayOf: (ms: number) => number): { day: number; events: number; average: number }[] {
  const rows = Array.from({ length: 7 }, (_, day) => ({ day, events: 0, total: 0 }));
  for (const e of evs) {
    const d = dayOf(Date.parse(e.at) - NIGHT_ROLLOVER_MS);
    if (d < 0 || d > 6) continue;
    rows[d].events++;
    rows[d].total += e.delta;
  }
  return rows.filter((r) => r.events > 0).map((r) => ({ day: r.day, events: r.events, average: r.total / r.events }));
}

// ── The header's colors ───────────────────────────────────────────────────

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (a: number[]) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (h: string, amt: number) => rgbHex(hexRgb(h).map((v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
const lum = (h: string) => {
  const [r, g, b] = hexRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** The player header's band in a division's two colors (`c` light, `c2` dark): a deep ground where the text
 *  sits, the dark shade toward the emblem, the light one as a glow, and the division's name in a tint that
 *  reads on the ground. Every text color passes AA (4.5:1) on `mid`, the lightest ground under text. */
export function heroColors(c: string, c2: string): { deep: string; mid: string; edge: string; label: string; glow: string; glow2: string } {
  const deep = mix(c2, -0.78), mid = mix(c2, -0.55), edge = mix(c2, -0.18);
  let label = mix(c, 0.35);
  for (let k = 0.35; contrast(label, mid) < 4.5 && k < 1; k += 0.1) label = mix(c, k);
  const [r, g, b] = hexRgb(c), [r2, g2, b2] = hexRgb(c2);
  return { deep, mid, edge, label, glow: `rgba(${r}, ${g}, ${b}, 0.42)`, glow2: `rgba(${r2}, ${g2}, ${b2}, 0.5)` };
}
