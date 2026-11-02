/**
 * The queue's rules (lounge system picks 2026-11-01, https://claude.ai/artifact/1nWqceDvxZpTToXyaem9vm, picks 2A to
 * 7A). Pure, client-safe; the store is queueStore.ts, the Discord cards queueCards.ts.
 *
 *   - Each queue channel is always open (a room opens the moment it's full, first come first in) or rush hour (join in a
 *     window; at the set time everyone is sorted by MMR into rooms, and whoever's left waits for the next one).
 *   - A channel can have an MMR range (Tier A: 7,000 and up). Placement players may join only the lowest tier.
 *   - The format is a 45-second vote: most votes wins; a tie goes to the bigger teams; no votes, the biggest allowed.
 *   - Teams are drawn by MMR: sorted and dealt in a snake (1, 2, 3 … 3, 2, 1), so each team averages about the same.
 *   - The host is the highest MMR who marked I can host, else the highest MMR in the room.
 *   - Subs: the first player on the sub list whose MMR fits the channel's range, asked for two minutes each.
 */

import { GS_TIME_ZONE, zonedDay, zonedInstant } from "@/lib/time/gsClock";

export interface QueueChannel {
  id: string;
  name: string;
  mode: "open" | "rush";
  size: 12 | 24;
  /** Inclusive MMR range; null for open ends. */
  minMmr: number | null;
  maxMmr: number | null;
  /** Players per team this channel allows (subset of 1, 2, 3, 4, 6). */
  formats: number[];
  voteSeconds: number;
  /** Rush hour: when rooms are made, as Pacific "HH:MM"; joining closes `closeMinutes` before. */
  rushTimes: string[];
  closeMinutes: number;
  /** The lowest tier takes placement players. */
  lowest: boolean;
}

export interface QueueEntry { key: string; name: string; mmr: number; placing: boolean; canHost: boolean; joinedAt: string }

export const DEFAULT_VOTE_SECONDS = 45;
export const SUB_ASK_SECONDS = 120;

export type JoinRefusal = "below_tier" | "above_tier" | "placement_lowest" | "already_in" | "on_break";

/** Whether a player may join a channel's queue. */
export function joinCheck(ch: QueueChannel, p: { mmr: number; placing: boolean; onBreak?: boolean }, inQueue: boolean): JoinRefusal | null {
  if (p.onBreak) return "on_break";
  if (inQueue) return "already_in";
  if (p.placing) return ch.lowest ? null : "placement_lowest";
  if (ch.minMmr != null && p.mmr < ch.minMmr) return "below_tier";
  if (ch.maxMmr != null && p.mmr > ch.maxMmr) return "above_tier";
  return null;
}

/** Always open: the first `size` in join order make a room once there are enough. */
export function openRoom<T extends QueueEntry>(entries: T[], size: number): { room: T[]; rest: T[] } | null {
  if (entries.length < size) return null;
  const sorted = [...entries].sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : a.key.localeCompare(b.key)));
  return { room: sorted.slice(0, size), rest: sorted.slice(size) };
}

/** Rush hour: everyone sorted by MMR (ties by who joined first) into full rooms; whoever doesn't fill a room waits. */
export function rushRooms<T extends QueueEntry>(entries: T[], size: number): { rooms: T[][]; waiting: T[] } {
  const sorted = [...entries].sort((a, b) => b.mmr - a.mmr || (a.joinedAt < b.joinedAt ? -1 : 1));
  const full = Math.floor(sorted.length / size);
  const rooms = Array.from({ length: full }, (_, i) => sorted.slice(i * size, (i + 1) * size));
  return { rooms, waiting: sorted.slice(full * size) };
}

/** The next rush hour after `now` (Pacific "HH:MM" times), and when joining for it closes. */
export function nextRush(times: string[], closeMinutes: number, now: Date): { at: Date; closesAt: Date } | null {
  const valid = times.filter((t) => /^\d{2}:\d{2}$/.test(t)).sort();
  if (!valid.length) return null;
  // Pacific wall-clock to an instant: try today and tomorrow, with the zone's offset at that moment.
  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    for (const t of valid) {
      const at = pacificInstant(now, dayOffset, t);
      if (at.getTime() > now.getTime()) return { at, closesAt: new Date(at.getTime() - closeMinutes * 60_000) };
    }
  }
  return null;
}

function pacificInstant(now: Date, dayOffset: number, hhmm: string): Date {
  // The shared helper measures the zone's offset at the time itself, so a daylight saving change that morning is right.
  const day = zonedDay(now.getTime() + dayOffset * 86_400_000, GS_TIME_ZONE);
  const [h, m] = hhmm.split(":").map(Number);
  return zonedInstant(day, h, m, GS_TIME_ZONE);
}

/** The format vote: most votes wins; a tie goes to the bigger teams; no votes, the biggest format allowed. */
export function voteWinner(votes: number[], allowed: number[]): number {
  const counts = new Map<number, number>();
  for (const v of votes) if (allowed.includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
  if (!counts.size) return Math.max(...allowed);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/** Teams by MMR: sorted, then dealt in a snake so each team's average comes out about the same. */
export function drawTeams<T extends { mmr: number; key: string }>(players: T[], format: number): T[][] {
  if (format <= 1) return players.map((p) => [p]);
  const count = Math.floor(players.length / format);
  const sorted = [...players].sort((a, b) => b.mmr - a.mmr || a.key.localeCompare(b.key));
  const teams: T[][] = Array.from({ length: count }, () => []);
  let i = 0;
  for (let round = 0; i < count * format; round++) {
    const order = round % 2 === 0 ? [...Array(count).keys()] : [...Array(count).keys()].reverse();
    for (const t of order) { if (i >= count * format) break; teams[t].push(sorted[i++]); }
  }
  return teams;
}

/** The host: the highest MMR who can host, else the highest MMR in the room. */
export function pickHost<T extends { mmr: number; canHost: boolean; key: string }>(room: T[]): T | null {
  const by = (a: T, b: T) => b.mmr - a.mmr || a.key.localeCompare(b.key);
  return [...room].filter((p) => p.canHost).sort(by)[0] ?? [...room].sort(by)[0] ?? null;
}

/** The first sub (in sign-up order) whose MMR fits the channel, leaving out anyone already asked. */
export function nextSub<T extends { key: string; mmr: number; joinedAt: string }>(subs: T[], ch: Pick<QueueChannel, "minMmr" | "maxMmr">, asked: ReadonlySet<string>): T | null {
  return [...subs]
    .sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1))
    .find((s) => !asked.has(s.key) && (ch.minMmr == null || s.mmr >= ch.minMmr) && (ch.maxMmr == null || s.mmr <= ch.maxMmr)) ?? null;
}

/** A team's average MMR (for the card). */
export const teamAverage = (t: { mmr: number }[]) => Math.round(t.reduce((a, p) => a + p.mmr, 0) / Math.max(1, t.length));
