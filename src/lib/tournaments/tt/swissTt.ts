/**
 * Swiss decided by time trial (builder picks 2026-11-05: "TT matches in brackets, lobbies, Swiss"). A Swiss event with
 * `settings.swiss.timeTrial` keeps Swiss's pairing, standings, top cut and finish exactly as they are; only the result
 * of each match comes from the two players' times instead of their reports. Best of 1 is one track, best of 3 is three
 * tracks (first to two). Client-safe and pure: the server turns times into the reports Swiss already understands.
 *
 * Tracks: the event's list (settings.tt) in order, each match taking the next 1 or 3 and wrapping around, so round 1
 * runs tracks 1-3, round 2 tracks 4-6, and the top cut carries on after the last Swiss round.
 */

import { gamesToWin, cutBracket, cutKey, roundKey, type BestOf, type SwissReport, type SwissState } from "../swiss";
import { matchResult, type TtRun } from "./rules";
import { matchHolds, type MatchClipRule, type MatchHold, type MatchProofTime } from "./matchProof";
import type { TtProof } from "./event";

/** Is this Swiss event decided by time trial? */
export function isTtSwiss(settings: unknown): boolean {
  return ((settings as { swiss?: { timeTrial?: unknown } } | null)?.swiss?.timeTrial) === true;
}

/** The time row's `round` for a Swiss round (its number) or a top cut round (1000 + its bracket round). */
export const CUT_ROUND_BASE = 1000;
export const ttRoundFor = (key: string, cutRound: number | null): number => (key.startsWith("c:") ? CUT_ROUND_BASE + (cutRound ?? 0) : Number(key.replace(/^r/, "")));

/** The tracks for a match: the nth slot of `bestOf` tracks, wrapping around the event's list. */
export function tracksForSlot(list: string[], bestOf: BestOf, slot: number): string[] {
  if (!list.length) return [];
  const k = bestOf === 3 ? 3 : 1;
  return Array.from({ length: k }, (_, i) => list[((slot - 1) * k + i) % list.length]);
}
/** Swiss round n is slot n; top cut round r (0-based) comes after the last Swiss round. */
export const slotFor = (state: Pick<SwissState, "rounds">, key: string, cutRound: number | null): number =>
  key.startsWith("c:") ? state.rounds + 1 + (cutRound ?? 0) : Number(key.replace(/^r/, ""));

/** A decided time trial match as a Swiss score: the winner has the games needed, the loser what they took (capped). */
function scoreOf(bestOf: BestOf, wa: number, wb: number): [number, number] {
  const need = gamesToWin(bestOf);
  if (wa === wb) return bestOf === 1 ? [0, 0] : [1, 1];
  return wa > wb ? [need, Math.min(wb, need - 1)] : [Math.min(wa, need - 1), need];
}

export interface TtSwissTime {
  participantId: string; round: number; track: string; ms: number; counts: boolean;
  /** With proof (the server's times): a match waits for the clips its rule asks for (matchProof.ts). */
  id?: string; proof?: TtProof; video?: string | null;
}

const proofTimes = (times: TtSwissTime[]): MatchProofTime[] =>
  times.filter((t) => t.id).map((t) => ({ id: t.id!, participantId: t.participantId, round: t.round, track: t.track, ms: t.ms, proof: t.proof ?? (t.counts ? "none" : "rejected"), video: t.video ?? null }));

/** The times holding a Swiss match until their clips are checked. */
export const swissHolds = (a: string, b: string, tracks: string[], round: number, times: TtSwissTime[], rule: MatchClipRule): MatchHold[] =>
  matchHolds(a, b, tracks, round, proofTimes(times), rule);

const runsFor = (times: TtSwissTime[], round: number): TtRun[] =>
  times.filter((t) => t.round === round).map((t) => ({ player: t.participantId, track: t.track, ms: t.ms, counts: t.counts }));

/**
 * The reports both players would have made, for every match the times have settled: a match is settled once one
 * player has taken more than half its tracks, or every track has both times. `closed` rounds (the organizer closed
 * them) also settle on what's there: a missing time loses its track. A level top cut match stays open for the
 * organizer (a cut match can't tie). With a clip rule, a decided match waits until its clips are checked.
 */
export function reportsFromTimes(state: SwissState, tracksList: string[], times: TtSwissTime[], closed: Set<string> = new Set(), rule: MatchClipRule = 0): SwissReport[] {
  const out: SwissReport[] = [];
  const add = (key: string, a: string, b: string, tracks: string[], round: number, cut: boolean) => {
    const m = matchResult(a, b, tracks, runsFor(times, round), closed.has(key));
    if (!m.done || (cut && m.winner === null)) return;
    // A decided match waits for the clips its rule asks for to be checked.
    if (!closed.has(key) && swissHolds(a, b, tracks, round, times, rule).length) return;
    const [sa, sb] = scoreOf(state.bestOf, m.a, m.b);
    out.push({ matchKey: key, participantId: a, mine: sa, theirs: sb }, { matchKey: key, participantId: b, mine: sb, theirs: sa });
  };
  for (const r of state.list) {
    const key = roundKey(r.n);
    for (const t of r.tables) {
      if (!t.b || r.results[String(t.t)]) continue;
      add(key, t.a, t.b, tracksForSlot(tracksList, state.bestOf, r.n), r.n, false);
    }
  }
  if (state.cut) {
    // Each cut round's winners decide who meets in the next, so settle round by round.
    for (let guard = 0; guard < 8; guard++) {
      const bracket = cutBracket(state, out)!;
      const before = out.length;
      for (const m of bracket.matches) {
        if (!m.a || !m.b || m.winner || state.cut.results[m.id]) continue;
        const key = cutKey(m.id);
        if (out.some((x) => x.matchKey === key)) continue;
        add(key, m.a, m.b, tracksForSlot(tracksList, state.bestOf, slotFor(state, key, m.round)), ttRoundFor(key, m.round), true);
      }
      if (out.length === before) break;
    }
  }
  return out;
}

/** Tracks won so far in a match, for the player's card. */
export function matchScore(a: string, b: string, tracks: string[], times: TtSwissTime[], round: number) {
  return matchResult(a, b, tracks, runsFor(times, round), false);
}
