/**
 * War formats (team sizes picks 2026-11-10, all as recommended). Pure, client-safe.
 *
 * Two kinds of smaller war, plus Mario Kart World's 24-player rooms:
 *   - Two teams of 2 to 6, in a room of just them (a 4v4 is an 8-player room), the way Toad Bot runs them.
 *   - Several teams sharing a 12-player room: six teams of 2, four of 3, three of 4 (Sokuji's formats).
 *   - Mario Kart World's 24-player rooms: 12v12, or 4, 6, 8 or 12 teams of 6, 4, 3 or 2.
 *
 * Points per place depend on the room size. 12 players: 15 to 1, as before. Smaller Mario Kart 8 Deluxe rooms use the
 * tables Toad Bot uses (8 players: 10, 8, 6, 5, 4, 3, 2, 1). Mario Kart World's 24-player rooms: 15, 12, 10, 9, 9, 8,
 * 8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 1 (144 a race; MKCentral's 24-player lounge totals agree). Mario
 * Kart World's points for rooms under 12 players aren't written down anywhere we found, so those formats stay off
 * until they've been checked in a real room.
 *
 * Mario Kart Wii (added 2026-11-11): 12 players score 15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0 (73 a race, 876 a 12-race
 * war), checked against two sources: Super Mario Wiki's Mario Kart Wii page and the last row of MKW Table Bot's
 * scoreMatrix (common.py, github.com/BadWolf1023/MKW-Table-Bot). Only Table Bot lists smaller rooms (8 players: 15, 11,
 * 8, 6, 4, 2, 1, 0), one source, so two-team Wii wars smaller than 6v6 stay off like World's; several teams in a
 * 12-player room (six of 2, four of 3, three of 4) use the 12-player table and work.
 *
 * Teams are numbered in the order they were named: 0 is your team, 1 the team in vs:, then the others. A race keeps
 * your team's places in `spots` (as two-team wars always have), the other teams' in `places`, or only each team's
 * points (`scores`) when a war carried over from another bot never had the places.
 */

import type { WarGame } from "./rules";

export interface WarFormat {
  /** Players a team. */
  size: number;
  /** Teams in the room. */
  teams: number;
}

export const DEFAULT_FORMAT: WarFormat = { size: 6, teams: 2 };
export const roomOf = (f: WarFormat) => f.size * f.teams;
export const isDefaultFormat = (f: WarFormat) => f.size === 6 && f.teams === 2;

const P12 = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MK8DX_SMALL: Record<number, number[]> = {
  4: [5, 3, 2, 1],
  6: [7, 5, 4, 3, 2, 1],
  8: [10, 8, 6, 5, 4, 3, 2, 1],
  10: [12, 10, 8, 7, 6, 5, 4, 3, 2, 1],
};
const MKW24 = [15, 12, 10, 9, 9, 8, 8, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 1];
/** Mario Kart Wii's 12-player table. */
export const MKWII_P12: readonly number[] = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0];

/** Points per place for a room, or null when GameShuffle doesn't know them (a format that stays off). */
export function pointsTable(game: WarGame, room: number): readonly number[] | null {
  if (game === "mkwii") return room === 12 ? MKWII_P12 : null;
  if (room === 12) return P12;
  if (game === "mkworld" && room === 24) return MKW24;
  if (game === "mk8dx") return MK8DX_SMALL[room] ?? null;
  return null;
}

export const placePoints = (table: readonly number[], place: number) => table[place - 1] ?? 0;
export const raceTotal = (table: readonly number[]) => table.reduce((a, b) => a + b, 0);

/** "6v6", "4v4 · 3 teams". */
export const formatLabel = (f: WarFormat) => (f.teams === 2 ? `${f.size}v${f.size}` : `${f.size}v${f.size} · ${f.teams} teams`);

/** The formats a game offers in /war's format: option (the team size; how many teams comes from others:). */
export const FORMAT_SIZES: Record<WarGame, number[]> = { mk8dx: [6, 5, 4, 3, 2], mkworld: [6, 4, 3, 2, 12], mkwii: [6, 4, 3, 2] };

const GAME_NAME: Record<WarGame, string> = { mk8dx: "Mario Kart 8 Deluxe", mkworld: "Mario Kart World", mkwii: "Mario Kart Wii" };

/**
 * Whether a format can be played, or why not. Two teams of 2 to 6 (Mario Kart World: 6, or 12 in a 24-player room);
 * more teams fill a 12-player room exactly, or a 24-player one in Mario Kart World.
 */
export function formatProblem(game: WarGame, f: WarFormat): string | null {
  const room = roomOf(f);
  if (!Number.isInteger(f.size) || !Number.isInteger(f.teams) || f.teams < 2 || f.size < 1) return "That format doesn't work.";
  if (f.teams === 2) {
    if (f.size === 12) return game === "mkworld" ? null : "12v12 needs Mario Kart World's 24-player rooms.";
    if (f.size < 2 || f.size > 6) return "Two teams can be 2v2 to 6v6.";
    if (!pointsTable(game, room)) return `${GAME_NAME[game]}'s points for ${room === 8 || room === 11 ? "an" : "a"} ${room}-player room haven't been checked yet, so ${formatLabel(f)} isn't on. Play it in a 12-player room with more teams, or as 6v6.`;
    return null;
  }
  if (room === 12) return [2, 3, 4].includes(f.size) ? null : `A 12-player room fits six teams of 2, four of 3 or three of 4. ${f.teams} teams of ${f.size} is ${room}.`;
  if (room === 24 && game === "mkworld") return [2, 3, 4, 6].includes(f.size) ? null : "That doesn't fill a 24-player room.";
  return game === "mkworld"
    ? `Several teams have to fill a 12- or 24-player room. ${f.teams} teams of ${f.size} is ${room} players.`
    : `Several teams have to fill a 12-player room. ${f.teams} teams of ${f.size} is ${room} players.`;
}

/** The most one race can move the gap between two teams: one team's best places against the other's worst. */
export function swingFor(game: WarGame, f: WarFormat): number {
  const t = pointsTable(game, roomOf(f)) ?? P12;
  return t.slice(0, f.size).reduce((a, b) => a + b, 0) - t.slice(t.length - f.size).reduce((a, b) => a + b, 0);
}

// ── Reading places ────────────────────────────────────────────────────────────────────────────────

type Read = { ok: true; list: number[] } | { ok: false; error: string };

/** Sokuji's greedy shorthand (12-player rooms and smaller): 0 is 10th, + is 11th, 12 opens as 1st and 2nd. */
function shorthand(text: string, room: number): number[] | null {
  const data: number[] = [];
  let rest = text.toLowerCase();
  let prev = 0;
  let loop = false;
  while (rest.length) {
    let next: number[] = [];
    if (rest.startsWith("-")) { loop = true; rest = rest.slice(1); prev = data.length ? data[data.length - 1] : 0; }
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

const EXAMPLE = (room: number) => (room > 12 ? "1 2 4 5 8 9 11 14" : "12378 or 1-378");

/** One team's places as typed, before any are filled in. Past 12th they need spaces or commas between them. */
function readGroup(raw: string, room: number, spaced: boolean): Read {
  const text = raw.trim().replace(/[–—]/g, "-");
  if (!text) return { ok: false, error: `Type the places, like ${EXAMPLE(room)}.` };
  if (!/^[0-9abc+\-\s,]+$/i.test(text)) return { ok: false, error: `Couldn't read "${raw.trim().slice(0, 24)}". Use numbers, like ${EXAMPLE(room)}.` };
  let list: number[] | null;
  if (room > 12) {
    // Past 12th the shorthand can't work (13 already means 1st and 3rd): places need something between them.
    if (!spaced && /\d{3,}/.test(text)) return { ok: false, error: `Past 12th, put a space or a comma between places, like ${EXAMPLE(room)}.` };
    list = pieces(text, room);
  } else list = spaced ? pieces(text, room) : shorthand(text, room);
  if (!list) return { ok: false, error: `Couldn't read "${raw.trim().slice(0, 24)}". Use numbers, like ${EXAMPLE(room)}.` };
  if (list.some((p) => p < 1 || p > room)) return { ok: false, error: `Places run from 1 to ${room}.` };
  return { ok: true, list: [...new Set(list)].sort((a, b) => a - b) };
}

export type ReadPlaces = { ok: true; places: number[][]; note: string | null } | { ok: false; error: string };

const listText = (l: readonly number[]) => l.join(", ");

/**
 * Every team's places for one race. Two teams: your team's places (the other team has the rest). Several teams: one
 * group per team in the order they were named, separated by spaces (or / or | , which 24-player rooms need), and the
 * last team can be left out: it has the places left. A group short of places is filled with the worst places left;
 * one with too many keeps its best.
 */
export function readPlaces(raw: string, game: WarGame, f: WarFormat, names: string[] = []): ReadPlaces {
  const room = roomOf(f);
  const text = raw.trim();
  if (f.teams === 2) {
    const g = readGroup(text, room, /[\s,]/.test(text));
    if (!g.ok) return g;
    return finish([g.list], f, names, text);
  }
  // Several teams: groups by / or |, else (12-player rooms) by spaces.
  const slashed = /[/|]/.test(text);
  const parts = (slashed ? text.split(/[/|]/) : room > 12 ? [text] : text.split(/\s+/)).map((p) => p.trim()).filter(Boolean);
  if (!slashed && room > 12) return { ok: false, error: "Put a / between teams, like 1 2 4 5 8 9 / 3 6 7 10 11 12 / …" };
  if (parts.length < f.teams - 1) return { ok: false, error: `Type ${f.teams - 1} or ${f.teams} groups of places, one per team in order: ${names.slice(0, f.teams).join(", ") || "your team first"}.` };
  if (parts.length > f.teams) return { ok: false, error: `There are ${f.teams} teams, but that's ${parts.length} groups of places.` };
  const groups: number[][] = [];
  for (const p of parts) {
    const g = readGroup(p, room, slashed || room > 12);
    if (!g.ok) return g;
    groups.push(g.list);
  }
  return finish(groups, f, names, text);
}

/** Fills in the teams' places: duplicates refused, short groups topped up with the worst places left, the last team given the rest. */
function finish(typed: number[][], f: WarFormat, names: string[], text: string): ReadPlaces {
  const room = roomOf(f);
  const seen = new Map<number, number>();
  for (let i = 0; i < typed.length; i++) {
    for (const p of typed[i]) {
      if (seen.has(p)) return { ok: false, error: `${placeWord(p)} is in two teams' places.` };
      seen.set(p, i);
    }
  }
  const notes: string[] = [];
  const taken = new Set<number>(typed.flat());
  const places: number[][] = [];
  for (let i = 0; i < f.teams; i++) {
    const g = typed[i];
    if (!g) {
      // The team left out: the places nobody else has.
      const rest = Array.from({ length: room }, (_, k) => k + 1).filter((p) => !taken.has(p));
      places.push(rest.slice(0, f.size));
      rest.slice(0, f.size).forEach((p) => taken.add(p));
      continue;
    }
    let list = g;
    if (list.length > f.size) {
      list = list.slice(0, f.size);
      notes.push(`${f.teams === 2 ? text : names[i] ?? "A team"} has ${g.length} places, so the best ${f.size} count: ${listText(list)}.`);
    } else if (list.length < f.size) {
      const filled = [...list];
      for (let p = room; filled.length < f.size && p >= 1; p--) if (!taken.has(p)) { filled.push(p); taken.add(p); }
      // Leaving out the last place is how people type it (12378); two or more filled in gets said out loud.
      if (f.size - list.length > 1) notes.push(`${f.teams === 2 ? text : names[i] ?? "A team"} read as ${listText(filled.sort((a, b) => a - b))}: the last places filled the rest.`);
      list = filled.sort((a, b) => a - b);
    }
    places.push(list);
  }
  if (places.some((l) => l.length !== f.size)) return { ok: false, error: "Those places don't add up to the room." };
  // Two teams: the other team's places are always the rest.
  if (f.teams === 2) places[1] = Array.from({ length: room }, (_, k) => k + 1).filter((p) => !places[0].includes(p));
  return { ok: true, places, note: notes.length ? notes.join(" ") : null };
}

const placeWord = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;

// ── Scoring a race ────────────────────────────────────────────────────────────────────────────────

/** What a race keeps: your team's places, the other teams' (several teams), or only the points (carried over). */
export interface RacePlaces { spots: number[]; places?: number[][]; scores?: number[] }

/** Every team's places in a race (null for a race that only has points; only yours when a carried-over race has no one else's). */
export function placesOf(race: RacePlaces, f: WarFormat): number[][] | null {
  if (race.scores && !race.spots.length) return null;
  const room = roomOf(f);
  if (f.teams === 2) return [race.spots, Array.from({ length: room }, (_, k) => k + 1).filter((p) => !race.spots.includes(p))];
  return [race.spots, ...(race.places ?? [])];
}

/** Each team's points in a race: from the places, or from `scores` when a carried-over race doesn't have every team's. */
export function teamScores(race: RacePlaces, game: WarGame, f: WarFormat): number[] {
  if (race.scores && (!race.spots.length || (f.teams > 2 && !race.places?.length))) return Array.from({ length: f.teams }, (_, i) => race.scores![i] ?? 0);
  const table = pointsTable(game, roomOf(f)) ?? P12;
  const all = placesOf(race, f) ?? [];
  return Array.from({ length: f.teams }, (_, i) => (all[i] ?? []).reduce((a, p) => a + placePoints(table, p), 0));
}

/** The places of a race as the card's code: one character per place, the team's number (0 = yours); "-" for none. */
export function placesCode(race: RacePlaces, f: WarFormat): string {
  const all = placesOf(race, f);
  if (!all) return "";
  const room = roomOf(f);
  const by = new Map<number, number>();
  all.forEach((l, i) => l.forEach((p) => by.set(p, i)));
  return Array.from({ length: room }, (_, k) => {
    const t = by.get(k + 1);
    return t == null ? "-" : t.toString(36);
  }).join("");
}

/** Places from placesCode (null if it doesn't read: wrong length, a team past the room, a team without its places). */
export function placesFromCode(code: string, f: WarFormat): number[][] | null {
  const room = roomOf(f);
  if (code.length !== room) return null;
  const out: number[][] = Array.from({ length: f.teams }, () => []);
  for (let k = 0; k < room; k++) {
    const t = parseInt(code[k], 36);
    if (!(t >= 0 && t < f.teams)) return null;
    out[t].push(k + 1);
  }
  return out.every((l) => l.length === f.size) ? out : null;
}

/** The race's winning team (most points), or null on a tie at the top. */
export function raceWinner(race: RacePlaces, game: WarGame, f: WarFormat): number | null {
  const s = teamScores(race, game, f);
  const top = Math.max(...s);
  return s.filter((v) => v === top).length === 1 ? s.indexOf(top) : null;
}

/**
 * Team colors on dark ground (the card, the overlay): yours is the card's ice, the others in the order they were
 * named. All light enough to carry dark numbers on top.
 */
export const TEAM_COLORS = ["#8cc8f0", "#f2994a", "#c49bff", "#57d49a", "#f2c14e", "#ff8f8f", "#5ed1d1", "#f08fd0", "#b8c4d0", "#d9b27c", "#9db4ff", "#cfe07a"] as const;
export const teamColor = (i: number) => TEAM_COLORS[i % TEAM_COLORS.length];

/** Example places for this format (the race form's placeholder). */
export function placesExample(f: WarFormat): string {
  const room = roomOf(f);
  if (f.teams === 2) {
    if (room > 12) return "1 2 4 5 8 9 11 14 15 19 20 23";
    return ({ 2: "13", 3: "136", 4: "1257", 5: "12379", 6: "12378" } as Record<number, string>)[f.size] ?? "12378";
  }
  if (room > 12) return Array.from({ length: f.teams - 1 }, (_, i) => `${i * f.size + 1}-${(i + 1) * f.size}`).join(" / ");
  return ({ 2: "12 34 56 78 90", 3: "126 347 59", 4: "1269 347" } as Record<number, string>)[f.size] ?? "1269 347";
}

