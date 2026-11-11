/**
 * War scoring for GameShuffle Competitive (war tools picks 2026-10-31, walkthrough
 * https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT, all as recommended). Pure, client-safe.
 *
 * A 6v6 war is 12 races in a 12-player room: 15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1 (82 a race, 984 a war,
 * the table every community bot shares). A team's race score is the sum of its six places; the swing in one
 * race is at most 40 (1st to 6th against 7th to 12th), so a war can't be caught once the lead is more than
 * 40 times the races left.
 *
 * Places read the way Sokuji and Quaxly read them, so nobody learns anything new: 0 is 10th, + is 11th (and
 * a, b, c are 10th to 12th), 10 and 11 read as one place, 12 is 1st and 2nd when it comes first and 12th after,
 * a dash fills a range (a leading dash starts at 1st, a trailing one runs to 12th), fewer than six are topped up
 * with the last places (said on the card when it's more than one), more than six keep the best six. Ours adds one thing: with spaces or commas, each piece
 * is a place or a range ("1-3 7 8 12"), which those bots refuse.
 */

import { tracksByCode, trackCode } from "@/lib/timeTrials/codes";
import { ttTracks, type TtTrack } from "@/lib/timeTrials/tracks";
import { DEFAULT_FORMAT, swingFor, teamScores, type WarFormat } from "./format";

export type WarGame = "mk8dx" | "mkworld";
export type WarSide = "us" | "them";
export type WarEntry = "scorer" | "taps";

export const ROOM = 12;
export const TEAM = 6;
export const RACES = 12;
export const POINTS: readonly number[] = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const RACE_TOTAL = POINTS.slice(0, ROOM).reduce((a, b) => a + b, 0);

/** The most one race can move the gap: the top `team` places against the bottom `team`. */
export function maxSwing(team = TEAM, room = ROOM): number {
  const pts = POINTS.slice(0, room);
  return pts.slice(0, team).reduce((a, b) => a + b, 0) - pts.slice(room - team).reduce((a, b) => a + b, 0);
}

export const pointsFor = (place: number): number => POINTS[place - 1] ?? 0;

export interface RaceScore { us: number; them: number; diff: number }
export function raceScore(spots: readonly number[], room = ROOM): RaceScore {
  const us = spots.reduce((a, p) => a + pointsFor(p), 0);
  const total = POINTS.slice(0, room).reduce((a, b) => a + b, 0);
  return { us, them: total - us, diff: us - (total - us) };
}

/** A race's places as read: your team's, and with several teams (format.ts) the other teams' in the order they were named. */
export type ReadSpots = { ok: true; spots: number[]; note: string | null; others?: number[][] } | { ok: false; error: string };

const tidy = (text: string) => text.trim().replace(/[–—]/g, "-");

/** Sokuji's greedy shorthand, rebuilt from how it reads (not its code). */
function shorthand(text: string, room: number): number[] | null {
  const data: number[] = [];
  let rest = text.toLowerCase();
  let prev = 0;
  let loop = false;
  while (rest.length) {
    let next: number[] = [];
    if (rest.startsWith("-")) {
      loop = true;
      rest = rest.slice(1);
      prev = data.length ? data[data.length - 1] : 0;
    }
    if (rest.startsWith("0")) { next = [10]; rest = rest.slice(1); }
    else if (rest.startsWith("+")) { next = [11]; rest = rest.slice(1); }
    else if (rest.startsWith("10")) { next = [10]; rest = rest.slice(2); }
    else if (rest.startsWith("110")) { next = [1, 10]; rest = rest.slice(3); }
    else if (rest.startsWith("1112")) { next = [11, 12]; rest = rest.slice(4); }
    else if (rest.startsWith("111")) { next = [1, 11]; rest = rest.slice(3); }
    else if (rest.startsWith("112")) { next = [1, 12]; rest = rest.slice(3); }
    else if (rest.startsWith("11")) { next = [11]; rest = rest.slice(2); }
    else if (rest.startsWith("12")) { next = data.length ? [12] : [1, 2]; rest = rest.slice(2); }
    else if (rest.length) {
      const c = rest[0];
      const n = /[1-9]/.test(c) ? Number(c) : c === "a" ? 10 : c === "b" ? 11 : c === "c" ? 12 : NaN;
      if (Number.isNaN(n)) return null;
      next = [n];
      rest = rest.slice(1);
    }
    if (loop) {
      if (!next.length) next = [room];
      for (let p = prev + 1; p < next[0]; p++) data.push(p);
      loop = false;
    }
    data.push(...next);
  }
  return data;
}

/** "1-3 7 8 12" or "1,2,3,7,8,12": each piece a place or a range. */
function pieces(text: string, room: number): number[] | null {
  const out: number[] = [];
  for (const piece of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d{1,2})?-(\d{1,2})?$/.exec(piece);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1;
      const b = m[2] ? Number(m[2]) : room;
      if (a > b) return null;
      for (let p = a; p <= b; p++) out.push(p);
    } else if (/^\d{1,2}$/.test(piece)) out.push(Number(piece));
    else return null;
  }
  return out;
}

export const placesText = (spots: readonly number[]) => spots.join(", ");

/** Reads a team's places from what someone typed. */
export function readSpots(raw: string, team = TEAM, room = ROOM): ReadSpots {
  const text = tidy(raw);
  if (!text) return { ok: false, error: "Type your team's places, like 12378 or 1-378." };
  if (!/^[0-9abc+\-\s,]+$/i.test(text)) return { ok: false, error: `Couldn't read "${raw.trim().slice(0, 24)}". Use numbers, like 12378 or 1-378.` };
  const list = /[\s,]/.test(text) ? pieces(text, room) : shorthand(text, room);
  if (!list) return { ok: false, error: `Couldn't read "${raw.trim().slice(0, 24)}". Use numbers, like 12378 or 1-378.` };
  if (list.some((p) => p < 1 || p > room)) return { ok: false, error: `Places run from 1 to ${room}.` };
  const set = [...new Set(list)].sort((a, b) => a - b);
  if (!set.length) return { ok: false, error: "Type your team's places, like 12378 or 1-378." };
  let spots = set;
  let note: string | null = null;
  if (set.length > team) {
    spots = set.slice(0, team);
    note = `${text} has ${set.length} places, so the best ${team} count: ${placesText(spots)}.`;
  } else if (set.length < team) {
    const filled = new Set(set);
    for (let p = room; filled.size < team; p--) filled.add(p);
    spots = [...filled].sort((a, b) => a - b);
    // Leaving out 12th is how people type it (12378); two or more filled in gets said out loud.
    if (team - set.length > 1) note = `${text} read as ${placesText(spots)}: the last places filled the rest.`;
  }
  return { ok: true, spots, note };
}

// ── The war's state ───────────────────────────────────────────────────────────────────────────

export interface WarPlayer { id: string; name: string; place: number }
export interface WarRace {
  n: number;
  spots: number[];
  track: string | null;
  by: { id: string; name: string };
  at: string;
  fixedBy?: string | null;
  /** When the team tapped their own places: who finished where. */
  players?: WarPlayer[];
  /** Several teams in the room (format.ts): the other teams' places, in the order they were named. */
  places?: number[][];
  /** Only each team's points, no places: a race carried over from another bot that never had them. */
  scores?: number[];
}
/** `team`: which team, for wars with several (0 = yours); two-team wars go by `side`. */
export interface WarPenalty { side: WarSide; points: number; reason: string; by: string; at: string; team?: number }

export interface Standing {
  us: number;
  them: number;
  diff: number;
  /** Each race's swing, in order. */
  diffs: number[];
  played: number;
  left: number;
  penalty: { us: number; them: number };
  /** Who can no longer be caught (or null while it's open). */
  decided: WarSide | null;
  /** What the side behind needs to average a race to pass (null when level, decided or over). */
  need: { side: WarSide; avg: number } | null;
  /** Every team's total, in the order they were named (0 = yours). */
  totals: number[];
  /** Team numbers, highest total first. */
  order: number[];
  /** The team `them` means: the other team, or with several teams the leader (the team behind you when you lead). */
  rival: number;
  /** Your team's place in the standings. */
  rank: number;
}

/** Which team a penalty is on: its own number with several teams, else by side. */
export const penaltyTeam = (p: WarPenalty) => p.team ?? (p.side === "us" ? 0 : 1);

/**
 * Where the war stands. Two teams: your total against theirs, as always. Several teams: every team's total, and `us`
 * against `them` = your team against the leader (or the team right behind you when you lead), which the card, the
 * overlay and "can't be caught" follow.
 */
export function standing(races: readonly WarRace[], penalties: readonly WarPenalty[] = [], total = RACES, game: WarGame = "mk8dx", fmt: WarFormat = DEFAULT_FORMAT): Standing {
  const sorted = [...races].sort((a, b) => a.n - b.n);
  const scores = sorted.map((r) => teamScores(r, game, fmt));
  const pen = Array.from({ length: fmt.teams }, () => 0);
  for (const p of penalties) { const t = penaltyTeam(p); if (t < pen.length) pen[t] += p.points; }
  const totals = pen.map((x, i) => scores.reduce((a, s) => a + (s[i] ?? 0), 0) - x);
  const order = totals.map((_, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
  const rival = fmt.teams === 2 ? 1 : order[0] === 0 ? order[1] : order[0];
  const us = totals[0];
  const them = totals[rival];
  const diff = us - them;
  const played = sorted.length;
  const left = Math.max(0, total - played);
  const lead = Math.abs(diff);
  const ahead: WarSide | null = diff > 0 ? "us" : diff < 0 ? "them" : null;
  const decided = ahead && (left === 0 || lead > swingFor(game, fmt) * left) ? ahead : null;
  const need = ahead && !decided && left > 0 ? { side: (ahead === "us" ? "them" : "us") as WarSide, avg: Math.ceil((lead + 1) / left) } : null;
  return {
    us, them, diff, diffs: scores.map((s) => (s[0] ?? 0) - (s[rival] ?? 0)), played, left, penalty: { us: pen[0], them: pen[rival] }, decided, need,
    totals, order, rival, rank: order.indexOf(0) + 1,
  };
}

export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * One race line for the card: " 6: +16 | 1,2,3,7,9,11   SSC". A race carried over with only points:
 * " 3: +10 | 46 : 36   MKS". Several teams: " 6: KC 38 · NOR 26 · PBM 18   SSC".
 */
export function raceLine(r: WarRace, game: WarGame, fmt: WarFormat = DEFAULT_FORMAT, tags: string[] = []): string {
  const track = r.track ? trackLabel(game, r.track) : "";
  const s = teamScores(r, game, fmt);
  if (fmt.teams > 2) return `${String(r.n).padStart(2)}: ${s.map((v, i) => `${tags[i] ?? `Team ${i + 1}`} ${v}`).join(" · ")}   ${track}`.trimEnd();
  const diff = s[0] - s[1];
  const places = r.spots.length ? r.spots.join(",") : `${s[0]} : ${s[1]}`;
  return `${String(r.n).padStart(2)}: ${signed(diff).padStart(3)} | ${places.padEnd(14)} ${track}`.trimEnd();
}

// ── Places in a button id (12 bits as three hex digits) ──────────────────────────────────────────

export function spotsCode(spots: readonly number[]): string {
  const mask = spots.reduce((m, p) => m + 2 ** (p - 1), 0);
  return mask.toString(16).padStart(3, "0");
}
export function spotsFromCode(code: string, room = ROOM): number[] {
  const mask = parseInt(code, 16);
  if (!Number.isFinite(mask)) return [];
  return Array.from({ length: room }, (_, i) => i + 1).filter((p) => Math.floor(mask / 2 ** (p - 1)) % 2 === 1);
}

/** Six different places from the team's taps, or null until there are six. */
export function tapsToSpots(taps: readonly { place: number }[], team = TEAM): number[] | null {
  const places = [...new Set(taps.map((t) => t.place))].sort((a, b) => a - b);
  return places.length === team && taps.length === team ? places : null;
}

/** Places tapped by more than one player. */
export function tapClashes(taps: readonly { place: number }[]): number[] {
  const seen = new Map<number, number>();
  for (const t of taps) seen.set(t.place, (seen.get(t.place) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([p]) => p).sort((a, b) => a - b);
}

export const placeName = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;

// ── Tracks ────────────────────────────────────────────────────────────────────────────────────

export function warTrack(game: WarGame, id: string): TtTrack | null {
  return ttTracks(game).find((t) => t.id === id) ?? null;
}

export function trackLabel(game: WarGame, id: string): string {
  const t = warTrack(game, id);
  return t ? trackCode(t) ?? t.name : id;
}

/** A typed track code: the exact code (any case) when only one track has it. */
export function readTrack(game: WarGame, raw: string): TtTrack | null {
  const text = raw.trim();
  if (!text) return null;
  const exactCase = ttTracks(game).find((t) => trackCode(t) === text);
  if (exactCase) return exactCase;
  const list = tracksByCode(text, game).filter((t) => (trackCode(t) ?? "").toLowerCase() === text.toLowerCase());
  return list.length === 1 ? list[0] : null;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** The closest tracks to a code nobody has (up to `max`): codes that start with it, then the nearest codes, then names. */
export function suggestTracks(game: WarGame, raw: string, max = 3): TtTrack[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const all = ttTracks(game).filter((t) => trackCode(t));
  const scored = all.map((t) => {
    const code = (trackCode(t) ?? "").toLowerCase();
    const name = t.name.toLowerCase();
    let score = distance(q, code) * 2;
    if (code.startsWith(q) || q.startsWith(code)) score -= 3;
    if (name.includes(q)) score -= 2;
    return { t, score };
  });
  return scored.sort((a, b) => a.score - b.score || a.t.name.localeCompare(b.t.name)).slice(0, max).map((s) => s.t);
}

/** "Track then places" in one line ("SSC 12379+"), or places alone; the track is optional. */
export function readRaceLine(game: WarGame, raw: string): { track: TtTrack | null; trackText: string | null; spots: ReadSpots } {
  const parts = raw.trim().split(/\s+/);
  // A first word with a letter is the track (codes like CC and bBC3 are made of letters places can use too).
  if (parts.length >= 2 && /[a-z]/i.test(parts[0])) {
    return { track: readTrack(game, parts[0]), trackText: parts[0], spots: readSpots(parts.slice(1).join(" ")) };
  }
  return { track: null, trackText: null, spots: readSpots(raw) };
}
