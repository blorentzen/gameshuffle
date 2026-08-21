/**
 * GS Pro Polling — shared types (client-safe, no server deps).
 *
 * A poll is a question + 2–8 options with one vote per identity; the tally is
 * always derived from `gs_poll_votes`, never stored. Option ids are the
 * 1-based position (`"1"`, `"2"`, …) so a chat "!vote 3" maps straight to an
 * option without a lookup table.
 */

export type PollStatus = "draft" | "open" | "closed";

export interface PollOption {
  /** 1-based position as a string ("1".."8"). */
  id: string;
  label: string;
}

export interface Poll {
  id: string;
  communityId: string;
  sessionId: string | null;
  question: string;
  options: PollOption[];
  status: PollStatus;
  allowChange: boolean;
  anonAllowed: boolean;
  createdBy: string | null;
  openedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface PollTally {
  /** Total votes cast. */
  total: number;
  /** optionId → vote count (missing key = 0). */
  byOption: Record<string, number>;
}

export interface PollWithTally {
  poll: Poll;
  tally: PollTally;
}

export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 8;
