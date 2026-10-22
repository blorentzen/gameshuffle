/**
 * A table submitted but not yet verified (pure, client-safe): the player's finishing place
 * and the change the formula expects once staff verify it (src/lib/lounge/odds.ts, within
 * about 2 MMR). Dashboard additions picks, 2026-10-20: shown on the MMR card, the lounge
 * page and !mmr as "about +129, waiting for verification".
 */

import type { LoungeTable } from "@/lib/mmr/mkcentral";
import { eventDeltas } from "./odds";
import { formatOf, type Format } from "./season";

export interface MmrPending { tableId: number; place: number; delta: number; format: Format; at: string | null }

export function pendingFor(table: LoungeTable, playerId: number): MmrPending | null {
  const mine = table.teams.findIndex((t) => t.scores.some((s) => s.playerId === playerId));
  if (mine < 0) return null;
  const ratings = table.teams.map((t) => {
    const known = t.scores.map((s) => s.prevMmr).filter((m): m is number => m != null);
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  });
  if (ratings.some((r) => r == null)) return null;
  const size = Math.max(1, Math.round(table.numPlayers / Math.max(1, table.numTeams)));
  const deltas = eventDeltas(table.teams.map((t, i) => ({ rating: ratings[i]!, rank: t.rank })), size);
  return { tableId: table.id, place: table.teams[mine].rank, delta: deltas[mine], format: formatOf({ teams: table.numTeams, players: table.numPlayers }), at: table.createdOn };
}
