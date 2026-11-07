/**
 * Proof for time trial matches (Swiss and single or double elimination decided by time trial): the organizer picks
 * who adds a clip of the run's last 30 seconds, and a match the times have decided waits until those clips are
 * checked (by the organizer, a co-organizer or a verifier). Holding the match, rather than settling it and undoing it
 * later, means a bracket never moves on from a result that a check then overturns. Times typed in by staff count as
 * checked. Client-safe and pure.
 *
 * Rules: 0 = screenshots only (the default: matches settle as soon as the times decide them), 1 = the faster time on
 * each track, -1 = both players' times. Only each player's best counting time on each of the match's tracks matters.
 */

import { clipNeeded } from "./rules";
import type { TtProof } from "./event";

export type MatchClipRule = 0 | 1 | -1;

export const MATCH_CLIP_CHOICES: { value: MatchClipRule; label: string }[] = [
  { value: 0, label: "Nobody (screenshots only)" },
  { value: 1, label: "The faster time on each track" },
  { value: -1, label: "Both players" },
];

export const matchClipRuleOf = (v: unknown): MatchClipRule => (Number(v) === 1 ? 1 : Number(v) === -1 ? -1 : 0);
export const matchClipText = (rule: MatchClipRule) => MATCH_CLIP_CHOICES.find((c) => c.value === rule)?.label ?? "Nobody";

/** A time in a match, with its proof. */
export interface MatchProofTime { id: string; participantId: string; round: number; track: string; ms: number; proof: TtProof; video: string | null }

/** Where a player's best time on a track stands: needs a clip, has one waiting for a check, or checked. */
export type MatchProofState = "clip" | "waiting" | "checked";

export interface MatchHold {
  id: string;
  participantId: string;
  track: string;
  ms: number;
  /** 1 for the faster time on the track (both on a tie), 2 for the slower. */
  place: 1 | 2;
  proof: TtProof;
  /** No clip yet (the player still has to add one). */
  needsClip: boolean;
}

/** Each player's best counting time on each track (a rejected time doesn't count). */
function bests(a: string, b: string, tracks: string[], round: number, times: MatchProofTime[]): Map<string, Map<string, MatchProofTime>> {
  const out = new Map<string, Map<string, MatchProofTime>>();
  for (const t of tracks) out.set(t, new Map());
  for (const x of times) {
    if (x.round !== round || x.proof === "rejected" || (x.participantId !== a && x.participantId !== b)) continue;
    const m = out.get(x.track);
    if (!m) continue;
    const cur = m.get(x.participantId);
    if (!cur || x.ms < cur.ms) m.set(x.participantId, x);
  }
  return out;
}

/** Every best time in the match that the rule asks a clip for and nobody has checked yet. */
export function matchHolds(a: string, b: string, tracks: string[], round: number, times: MatchProofTime[], rule: MatchClipRule): MatchHold[] {
  if (rule === 0) return [];
  const out: MatchHold[] = [];
  for (const [track, m] of bests(a, b, tracks, round, times)) {
    const ta = m.get(a), tb = m.get(b);
    for (const [mine, theirs] of [[ta, tb], [tb, ta]] as const) {
      if (!mine) continue;
      const place: 1 | 2 = !theirs || mine.ms <= theirs.ms ? 1 : 2;
      if (!clipNeeded(rule, place) || mine.proof === "checked") continue;
      out.push({ id: mine.id, participantId: mine.participantId, track, ms: mine.ms, place, proof: mine.proof, needsClip: mine.proof !== "waiting" && !mine.video });
    }
  }
  return out;
}

/** The proof state of each player's best time on each track, for the match card (null: nothing to show). */
export function matchProofStates(a: string, b: string, tracks: string[], round: number, times: MatchProofTime[], rule: MatchClipRule): Map<string, Map<string, { timeId: string; state: MatchProofState }>> {
  const holds = new Map(matchHolds(a, b, tracks, round, times, rule).map((h) => [h.id, h]));
  const out = new Map<string, Map<string, { timeId: string; state: MatchProofState }>>();
  for (const [track, m] of bests(a, b, tracks, round, times)) {
    const row = new Map<string, { timeId: string; state: MatchProofState }>();
    for (const [pid, t] of m) {
      const h = holds.get(t.id);
      if (h) row.set(pid, { timeId: t.id, state: h.needsClip ? "clip" : "waiting" });
      else if (rule !== 0 && t.proof === "checked") row.set(pid, { timeId: t.id, state: "checked" });
    }
    out.set(track, row);
  }
  return out;
}

/** The player-facing word for a proof state. */
export const proofStateWord = (s: MatchProofState): string => (s === "clip" ? "Clip needed" : s === "waiting" ? "Clip waiting for a check" : "Checked");
