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
  brain: { id: string; board: number; boards: number; question: string; strikes: number; score: number } | null;
  market: { id: string; question: string; status: "open" | "locked"; lockAt: string | null } | null;
  bounties: { count: number; first: string | null; amount: number | null };
}
