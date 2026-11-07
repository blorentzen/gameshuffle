/**
 * Brackets decided by time trial (builder picks 2026-11-05: "TT matches in brackets, lobbies, Swiss"). A single or
 * double elimination tournament with `settings.timeTrial` keeps its 1v1 bracket exactly as it is; only the winner of
 * each match comes from the two players' times on the match's tracks instead of the organizer's pick. Best of 1 is one
 * track, best of 3 is three tracks (first to two). Lobbies of more than two are the Time trial format's groups.
 *
 * Every match whose two players are seated is open at once (online events run in parallel). A match settles itself
 * once one player has taken more than half its tracks or both have a time on every track; the organizer can settle
 * one on the times so far (a missing time loses its track) and pick by hand when that leaves it level.
 *
 * Tracks: the event's list (settings.tt) in order, each bracket round taking the next 1 or 3 and wrapping around:
 * winners round 1 runs the first tracks, then each later winners round, then the losers rounds, then the grand final.
 * Times are kept per (group, round) in tt_event_times.round as 2000 + 100 × group + round, which is unique per player
 * (nobody plays twice in the same round of the same bracket). Client-safe and pure.
 */

import { reportWinner, type Bracket, type BracketGroup, type BracketMatch } from "../bracket";
import { matchResult, type TtRun } from "./rules";
import { matchHolds, type MatchClipRule, type MatchHold, type MatchProofState, type MatchProofTime } from "./matchProof";
import type { TtProof } from "./event";
import { tracksForSlot } from "./swissTt";
import type { TtEventSettings } from "./event";

export type TtBestOf = 1 | 3;

/** Is this elimination tournament decided by time trial? (1v1 only: lobbies of more use the Time trial format.) */
export function isTtBracket(t: { format?: string | null; settings?: unknown }): boolean {
  if (t.format !== "single_elim" && t.format !== "double_elim") return false;
  const s = (t.settings ?? {}) as { timeTrial?: unknown; lobbySize?: unknown };
  return s.timeTrial === true && (Number(s.lobbySize) || 2) <= 2;
}

export const ttBestOfOf = (settings: unknown): TtBestOf => ((settings as { ttBestOf?: unknown } | null)?.ttBestOf === 3 ? 3 : 1);

/** The times table's `round` for a bracket match: 2000 + 100 × group + its round in that group. */
export const BRACKET_ROUND_BASE = 2000;
const GROUP_N: Record<BracketGroup, number> = { wb: 0, lb: 1, gf: 2 };
export const bracketTtRound = (m: Pick<BracketMatch, "group" | "round">): number => BRACKET_ROUND_BASE + 100 * GROUP_N[m.group] + m.round;

/** Winners rounds first, then losers rounds, then the grand final (and its reset). 1-based. */
export function bracketSlot(b: Pick<Bracket, "rounds" | "lbRounds">, m: Pick<BracketMatch, "group" | "round">): number {
  if (m.group === "wb") return m.round + 1;
  if (m.group === "lb") return b.rounds + m.round + 1;
  return b.rounds + (b.lbRounds ?? 0) + m.round + 1;
}

export const bracketTracks = (list: string[], bestOf: TtBestOf, b: Pick<Bracket, "rounds" | "lbRounds">, m: Pick<BracketMatch, "group" | "round">): string[] =>
  tracksForSlot(list, bestOf, bracketSlot(b, m));

/** A match both players can race now: both seated, no winner yet. */
export const isOpenMatch = (m: BracketMatch): boolean => !!m.a && !!m.b && !m.winner;

export interface TtBracketTime {
  participantId: string; round: number; track: string; ms: number; counts: boolean;
  /** With proof (the server's times): a match waits for the clips its rule asks for (matchProof.ts). */
  id?: string; proof?: TtProof; video?: string | null;
}

const proofTimes = (times: TtBracketTime[]): MatchProofTime[] =>
  times.filter((t) => t.id).map((t) => ({ id: t.id!, participantId: t.participantId, round: t.round, track: t.track, ms: t.ms, proof: t.proof ?? (t.counts ? "none" : "rejected"), video: t.video ?? null }));

/** The times holding a match (decided or not) until their clips are checked. */
export const bracketHolds = (b: Bracket, m: BracketMatch, list: string[], bestOf: TtBestOf, times: TtBracketTime[], rule: MatchClipRule): MatchHold[] =>
  m.a && m.b ? matchHolds(m.a, m.b, bracketTracks(list, bestOf, b, m), bracketTtRound(m), proofTimes(times), rule) : [];

const runsFor = (times: TtBracketTime[], round: number): TtRun[] =>
  times.filter((t) => t.round === round).map((t) => ({ player: t.participantId, track: t.track, ms: t.ms, counts: t.counts }));

/** Tracks won so far in one match (the a side first). */
export function bracketMatchScore(b: Bracket, m: BracketMatch, list: string[], bestOf: TtBestOf, times: TtBracketTime[], closed = false) {
  return matchResult(m.a ?? "", m.b ?? "", bracketTracks(list, bestOf, b, m), runsFor(times, bracketTtRound(m)), closed);
}

/**
 * Report every open match the times have settled, then any match that opened because of it, until nothing changes.
 * `close` settles that one match on the times so far as well (a missing time loses its track); a close that leaves it
 * level is reported back so the organizer can pick. With a clip rule, a decided match waits until the clips it asks
 * for are checked (unless it's the one being closed). Returns the bracket (new object when anything changed).
 */
export function settleBracket(bracket: Bracket, list: string[], bestOf: TtBestOf, times: TtBracketTime[], close?: string | null, rule: MatchClipRule = 0): { bracket: Bracket; settled: string[]; level: string | null } {
  let b = bracket;
  const settled: string[] = [];
  let level: string | null = null;
  for (let guard = 0; guard < 256; guard++) {
    let next: { m: BracketMatch; side: "a" | "b" } | null = null;
    level = null;
    for (const m of b.matches) {
      if (!isOpenMatch(m)) continue;
      const r = bracketMatchScore(b, m, list, bestOf, times, m.id === close);
      // A decided match waits for its clips to be checked; the organizer settling it on the times so far doesn't.
      if (r.done && r.winner && m.id !== close && bracketHolds(b, m, list, bestOf, times, rule).length) continue;
      if (r.done && r.winner) { next = { m, side: r.winner }; break; }
      if (r.done && m.id === close) level = m.id;
    }
    if (!next) break;
    b = reportWinner(b, next.m.id, next.side === "a" ? next.m.a! : next.m.b!);
    settled.push(next.m.id);
  }
  return { bracket: b, settled, level };
}

/** The open match a player is in (online, every open match runs at once; a player is in at most one). */
export const openMatchFor = (b: Bracket, participantId: string): BracketMatch | null =>
  b.matches.find((m) => isOpenMatch(m) && (m.a === participantId || m.b === participantId)) ?? null;

// ── What each person sees (built in bracketStore.ts) ──────────────────────────────────────────────────

export interface TtBracketTrack {
  id: string; a: number | null; b: number | null;
  /** Where each side's best time stands when the match asks for clips (null: nothing to show). */
  aProof: { timeId: string; state: MatchProofState } | null;
  bProof: { timeId: string; state: MatchProofState } | null;
}
export interface TtBracketMatchView {
  id: string; label: string;
  a: { id: string; name: string; won: number }; b: { id: string; name: string; won: number };
  tracks: TtBracketTrack[];
  /** Decided by the times, waiting for its clips to be checked. */
  held: boolean;
}
export interface TtBracketView {
  settings: TtEventSettings;
  bestOf: TtBestOf;
  /** Matches open once the organizer starts the tournament. */
  started: boolean;
  generated: boolean;
  champion: string | null;
  /** Which tracks each bracket round races. */
  schedule: { label: string; tracks: string[] }[];
  open: TtBracketMatchView[];
  you: { participantId: string; match: (TtBracketMatchView & { side: "a" | "b" }) | null; out: boolean } | null;
  canManage: boolean;
  /** A verifier (or organizer): the page shows the times to check. */
  canCheck: boolean;
}
