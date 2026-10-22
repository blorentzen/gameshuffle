/**
 * The match read (pure, client-safe; dashboard additions picks 2026-10-20): turn a pasted
 * room into names, then say what each place pays one player, where everyone is likely to
 * finish and who's favored. Lounge rooms are set up by MKCentral's Discord bot, which
 * GameShuffle can't read, so the player pastes or types the names.
 */

import { breakEven, likelyPlaces, payouts } from "./odds";

export const ROOM_MAX = 24;

/** Names from pasted text. Free-for-all: one name per line or comma; numbering ("1."), @, Discord
 *  mentions, MMR in brackets and headings like "Room 3" or "Tier A" are dropped. Team formats:
 *  one team per line, names separated by commas. */
export function parseRoom(text: string, teamSize = 1): string[][] {
  const clean = (raw: string) => raw
    .replace(/<@!?\d+>/g, "")
    .replace(/[([{][^)\]}]*[)\]}]/g, "")
    .replace(/^\s*(?:\d{1,2}[.):-]|[-*•·])\s*/, "")
    .replace(/^@/, "")
    .replace(/\s+/g, " ")
    .trim();
  const heading = (s: string) => /^(room|tier|lineup|teams?|mogi|format|ffa|\d+v\d+)\b/i.test(s) || /^[A-Z]{1,2}$/.test(s);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (teamSize > 1) {
    return lines
      .map((l) => l.replace(/^\s*(?:team\s*\d+|\d{1,2})[.):-]?\s*/i, "").split(/[,;|]/).map(clean).filter((n) => n && !heading(n)))
      .filter((t) => t.length)
      .slice(0, Math.floor(ROOM_MAX / teamSize));
  }
  const seen = new Set<string>();
  return lines
    .flatMap((l) => (heading(clean(l.split(/[·|]/)[0] ?? "")) && !/,/.test(l) ? [] : l.split(/[,;|·]/)))
    .map(clean)
    .filter((n) => n && !heading(n) && n.length <= 40)
    .filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, ROOM_MAX)
    .map((n) => [n]);
}

export interface RoomPlayer { name: string; mmr: number | null; division: string | null; found: boolean }
export interface RoomTeam { players: RoomPlayer[]; rating: number | null; likely: number | null }

export interface RoomRead {
  teamSize: number;
  teams: RoomTeam[];
  /** Average of every player found. */
  average: number | null;
  /** The team the read is for (by index), with its seed by rating, likely place and payouts. */
  me: { team: number; seed: number; likely: number; pay: number[]; breakEven: number | null } | null;
  /** The team most likely to finish first. */
  favorite: number | null;
  missing: string[];
}

export function readRoom(teams: RoomPlayer[][], meName: string | null, teamSize = 1): RoomRead {
  const rated = teams.map((players) => {
    const known = players.map((p) => p.mmr).filter((m): m is number => m != null);
    return { players, rating: known.length === players.length && known.length ? known.reduce((a, b) => a + b, 0) / known.length : null };
  });
  const usable = rated.map((t, i) => ({ ...t, i })).filter((t) => t.rating != null);
  const likely = likelyPlaces(usable.map((t) => t.rating!));
  const likelyOf = new Map(usable.map((t, k) => [t.i, likely[k]]));
  const all = rated.flatMap((t) => t.players).map((p) => p.mmr).filter((m): m is number => m != null);
  const meIdx = meName ? rated.findIndex((t) => t.players.some((p) => p.name.toLowerCase() === meName.toLowerCase())) : -1;
  let me: RoomRead["me"] = null;
  if (meIdx >= 0 && rated[meIdx].rating != null && usable.length >= 2) {
    const mine = rated[meIdx].rating!;
    const others = usable.filter((t) => t.i !== meIdx).map((t) => t.rating!);
    const pay = payouts(mine, others, teamSize);
    me = { team: meIdx, seed: 1 + others.filter((r) => r > mine).length, likely: likelyOf.get(meIdx)!, pay, breakEven: breakEven(pay) };
  }
  const favorite = usable.length ? usable.reduce((b, t) => (likelyOf.get(t.i)! < likelyOf.get(b.i)! ? t : b)).i : null;
  return {
    teamSize,
    teams: rated.map((t, i) => ({ players: t.players, rating: t.rating, likely: likelyOf.get(i) ?? null })),
    average: all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null,
    me,
    favorite,
    missing: rated.flatMap((t) => t.players).filter((p) => !p.found).map((p) => p.name),
  };
}
