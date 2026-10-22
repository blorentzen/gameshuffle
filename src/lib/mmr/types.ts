/** What the MMR card's live link returns (client-safe types). */

import type { MmrLook } from "./look";
import type { MmrSource } from "./rules";
import type { MmrPending } from "@/lib/lounge/pending";
import type { MmrGoal } from "./goal";

export interface MmrMilestone {
  /** 10, 100, 250 or 1000. */
  tier: number;
  rank: number;
  at: string;
  /** Already inside it the first time the card saw the player: shown, never played as a moment. */
  initial: boolean;
}

export interface MmrLiveData {
  ok: true;
  source: MmrSource;
  look: MmrLook;
  pro: boolean;
  season: number | null;
  milestone: MmrMilestone | null;
  /** A submitted table staff haven't verified yet, with the change it should bring. */
  pending?: MmrPending | null;
  /** Tonight's goal (GS Pro), when one is set for this night and this look's game. */
  goal?: number | null;
  fetchedAt: string;
}

export type MmrLiveFailure = {
  ok: false;
  reason: "no_card" | "no_name" | "not_found" | "unavailable";
  look?: MmrLook;
  pro?: boolean;
};

export type MmrLiveResult = MmrLiveData | MmrLiveFailure;

/** The card as its owner edits it in the studio. */
export interface MmrCardView {
  token: string;
  loungeName: string | null;
  loungePlayerId: number | null;
  looks: MmrLook[];
  activeLook: string | null;
  followTwitch: boolean;
  showOnProfile: boolean;
  updatedAt: string;
  /** Tonight's goal as saved (GS Pro). `active`: it still counts tonight. */
  goal: (MmrGoal & { active: boolean }) | null;
  /** The Monday lounge report (GS Pro); on unless turned off. */
  weeklyReport: boolean;
  /** False until supabase/lounge-night-m1.sql has run: the goal and report switch can't save yet. */
  nightReady: boolean;
}
