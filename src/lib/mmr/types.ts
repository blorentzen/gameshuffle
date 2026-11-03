/** What the MMR card's live link returns (client-safe types). */

import type { MmrLook } from "./look";
import type { MmrGame, MmrSource } from "./rules";
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
  /** GameShuffle's bot answers !mmr in this streamer's Twitch chat (the panel's chat line shows only then). */
  chat?: boolean;
  /** Seconds between checks for the live card (a ladder look: 10; else the card's own 30). */
  poll?: number;
  fetchedAt: string;
}

export type MmrLiveFailure = {
  ok: false;
  /** not_on_ladder: the look reads a GameShuffle ladder this account isn't on (or has no Discord connected). */
  reason: "no_card" | "no_name" | "not_found" | "unavailable" | "not_on_ladder";
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

/** A GameShuffle ladder this account plays on (through its Discord account), for the studio's Rating from menu. */
export interface StudioLadder {
  id: string;
  slug: string;
  name: string;
  /** The lounge game it plays like (the look's game: its family and divisions). */
  game: MmrGame;
  gameLabel: string;
  /** The account's name on the ladder. */
  player: string;
}
