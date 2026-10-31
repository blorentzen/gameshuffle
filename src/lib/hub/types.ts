/**
 * Client-safe shapes for the stream page's live data (/api/hub/running).
 */

import type { RollSlot } from "@/lib/twitch/chatRoll";

/** Everything happening on a live stream right now; null = not running. */
export interface HubRunning {
  activeGame: string | null;
  lobby: number;
  onScreen:
    | { kind: "roll"; who: string; title: string | null; slots: RollSlot[]; at: string }
    | { kind: "race"; track: string | null; items: string | null; index: number; total: number; at: string }
    | null;
  picks: { id: string; game: string; ballots: number; locked: number } | null;
  poll: { id: string; question: string; votes: number; closesAt: string | null } | null;
  bingo: { id: string; status: "open" | "won" | "closed"; doors: boolean; called: number; pattern: string; winner: string | null } | null;
  draft: { id: string; title: string; status: string; picked: number; slots: number; mode: string } | null;
  /** `scores` is set for 1v1 and Teams ("Nova 40 · Marco 63"). */
  brain: { id: string; board: number; boards: number; question: string; strikes: number; score: number; scores?: string } | null;
  /** Break mode: the break running now. */
  breakMode: { id: string; game: string | null; phase: string; round: number; rounds: number; players: number; ending: boolean } | null;
  market: { id: string; question: string; status: "open" | "locked"; lockAt: string | null } | null;
  bounties: { count: number; first: string | null; amount: number | null };
  /** Chat Sets the Bounty from a break, waiting to be called. */
  breakBounty: { text: string; tokens: number; voters: number } | null;
  /** Chaos challenges to call: still open, or a market marked done and nobody's been paid. */
  challenges: { open: number; needsWinner: number };
}
