/**
 * Elimination brackets for the free bracket generator, on the tournament
 * bracket engine (src/lib/tournaments/bracket.ts) without changing it.
 *
 * - Players are their list index as a string ("0" is the top seed).
 * - Single elimination takes any count; the engine seats byes itself.
 * - Double elimination: the engine only takes a power of two, so the field is
 *   padded with bye seats ("bye:0"…). A bye always loses: it drops into the
 *   losers bracket and is knocked out there by the first real player it meets.
 * - Results are picks (match id → winner's index). The bracket is rebuilt from
 *   scratch every time, so changing an early winner never leaves a stale later
 *   result: a later pick whose player is no longer in that match drops out.
 */

import {
  bracketChampion,
  computeBracketPlacements,
  generateDoubleElim,
  generateSingleElim,
  reportWinner,
  type Bracket,
  type BracketMatch,
} from "@/lib/tournaments/bracket";
import { fromCode, toCode } from "./tool";

export type ElimKind = "single" | "double";
export type Picks = Record<string, number>;

const BYE = "bye:";
export const isBye = (id: string | null | undefined) => !!id && id.startsWith(BYE);
export const playerIndex = (id: string | null | undefined): number | null => (id && !isBye(id) && /^\d+$/.test(id) ? Number(id) : null);

function nextPow2(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

/** The bracket for `count` players before any result (byes already through). */
export function blankElim(kind: ElimKind, count: number): Bracket {
  const ids = Array.from({ length: count }, (_, i) => String(i));
  if (kind === "single") return generateSingleElim(ids);
  const size = Math.max(4, nextPow2(count));
  const seeds = [...ids, ...Array.from({ length: size - count }, (_, i) => `${BYE}${i}`)];
  return generateDoubleElim(seeds);
}

/** The bracket with every pick that still fits applied, plus the picks that did (the rest are dropped). */
export function buildElim(kind: ElimKind, count: number, picks: Picks): { bracket: Bracket; picks: Picks } {
  return applyPicks(blankElim(kind, count), picks);
}

/** Applies picks to any blank bracket (also the Swiss top cut, whose seeds are players in standings order). */
export function applyPicks(blank: Bracket, picks: Picks): { bracket: Bracket; picks: Picks } {
  let b = blank;
  for (;;) {
    let next: { id: string; winner: string } | null = null;
    for (const m of b.matches) {
      if (!m.a || !m.b || m.winner) continue;
      const winner = autoWinner(m) ?? pickFor(m, picks);
      if (winner) { next = { id: m.id, winner }; break; }
    }
    if (!next) break;
    b = reportWinner(b, next.id, next.winner);
  }
  const kept: Picks = {};
  for (const m of b.matches) {
    const p = picks[m.id];
    if (p != null && m.winner === String(p) && !autoWinner(m)) kept[m.id] = p;
  }
  return { bracket: b, picks: kept };
}

/** A match against a bye decides itself. */
function autoWinner(m: BracketMatch): string | null {
  if (isBye(m.a) && isBye(m.b)) return m.a;
  if (isBye(m.a)) return m.b;
  if (isBye(m.b)) return m.a;
  return null;
}

function pickFor(m: BracketMatch, picks: Picks): string | null {
  const p = picks[m.id];
  if (p == null) return null;
  const id = String(p);
  return id === m.a || id === m.b ? id : null;
}

/** Sets (or clears, with null) one match's winner, then rebuilds. */
export function pickWinner(kind: ElimKind, count: number, picks: Picks, matchId: string, winner: number | null): { bracket: Bracket; picks: Picks } {
  const next = { ...picks };
  if (winner == null) delete next[matchId];
  else next[matchId] = winner;
  return buildElim(kind, count, next);
}

/** Matches a person decides (both players real), for counting progress. */
export function playableMatches(b: Bracket): BracketMatch[] {
  return b.matches.filter((m) => m.a && m.b && !autoWinner(m));
}

export function eliminationChampion(b: Bracket): number | null {
  return playerIndex(bracketChampion(b));
}

/** Final places, byes left out (ties share a place, as the engine works them out). */
export function eliminationPlaces(b: Bracket): { player: number; place: number }[] {
  return computeBracketPlacements(b)
    .map((p) => ({ player: playerIndex(p.participantId), place: p.placement }))
    .filter((p): p is { player: number; place: number } => p.player != null);
}

// ── Link code ────────────────────────────────────────────────────────────────
// One character per match, in the order the blank bracket lists them, then the
// grand final reset (which only exists once the losers' champion wins game one).

function matchOrder(kind: ElimKind, count: number): string[] {
  const ids = blankElim(kind, count).matches.map((m) => m.id);
  return kind === "double" ? [...ids, "gf-r1-m0"] : ids;
}

export function encodePicks(kind: ElimKind, count: number, picks: Picks): string {
  return matchOrder(kind, count).map((id) => toCode(picks[id])).join("").replace(/\.+$/, "");
}

export function decodePicks(kind: ElimKind, count: number, code: unknown): Picks {
  if (typeof code !== "string") return {};
  const order = matchOrder(kind, count);
  const picks: Picks = {};
  for (let i = 0; i < Math.min(code.length, order.length); i++) {
    const p = fromCode(code[i]);
    if (p != null && p < count) picks[order[i]] = p;
  }
  return picks;
}
