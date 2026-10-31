/**
 * Tonight's goal on the MMR card (pure, client-safe; GS Pro, lounge night picks 2026-10-20).
 * A player sets a number for the night (say 15,500); the card, the OBS link and `!mmr` show
 * how far there is to go, and reaching it plays a moment.
 *
 * A goal belongs to the lounge night it was set on (6am to 6am Pacific, the lounge page's
 * nights) or to the Twitch stream it was set during, so a stream that runs past 6am keeps it.
 * After that it stops showing, unless the player keeps it.
 */

import { nightOf } from "@/lib/lounge/season";
import { fmtMmr, type MmrGame } from "./rules";

export interface MmrGoal {
  mmr: number;
  game: MmrGame;
  setAt: string;
  keep: boolean;
}

export const GOAL_MAX = 99_999;

/** A goal number from untrusted input (a whole number from 1 to 99,999), or null. */
export function cleanGoal(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw.replace(/[,\s]/g, "")) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n);
  return v >= 1 && v <= GOAL_MAX ? v : null;
}

/** Whether a goal still counts right now (`stream`: live on Twitch, and since when). */
export function goalActive(goal: MmrGoal | null | undefined, now: number = Date.now(), stream?: { live: boolean; since: string | null } | null): boolean {
  if (!goal) return false;
  if (goal.keep) return true;
  if (nightOf(goal.setAt) === nightOf(new Date(now).toISOString())) return true;
  if (stream?.live && stream.since && Date.parse(goal.setAt) >= Date.parse(stream.since)) return true;
  return false;
}

export interface GoalProgress {
  goal: number;
  toGo: number;
  reached: boolean;
  /** 0 to 1 from tonight's starting number to the goal (1 once reached). */
  pct: number;
}

/** How far there is to go. `start` is the number tonight began on. */
export function goalProgress(goal: number, mmr: number | null, start: number | null): GoalProgress {
  if (mmr == null) return { goal, toGo: goal, reached: false, pct: 0 };
  const reached = mmr >= goal;
  const from = start ?? mmr;
  const pct = reached ? 1 : goal > from ? Math.max(0, Math.min(1, (mmr - from) / (goal - from))) : 0;
  return { goal, toGo: Math.max(0, goal - mmr), reached, pct };
}

/** True when a change took the number from under the goal to it or past it. */
export const crossesGoal = (before: number | null, after: number | null, goal: number | null | undefined): boolean =>
  goal != null && before != null && after != null && before < goal && after >= goal;

/** The card's line: "184 to 15,500", or "Goal 15,500 reached". */
export const goalText = (p: GoalProgress) => (p.reached ? `Goal ${fmtMmr(p.goal)} reached` : `${fmtMmr(p.toGo)} to ${fmtMmr(p.goal)}`);

/** The chat line's part: "goal 15,500, 184 to go" or "goal 15,500 reached". */
export const goalChat = (p: GoalProgress) => (p.reached ? `goal ${fmtMmr(p.goal)} reached` : `goal ${fmtMmr(p.goal)}, ${fmtMmr(p.toGo)} to go`);
