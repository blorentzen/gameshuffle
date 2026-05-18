/**
 * Picks/Bans round + ballot types.
 *
 * Per the multi-game refinements spec — viewer ballots replace the
 * `!gs-pick-*` / `!gs-ban-*` chat commands. Streamer opens a round per
 * (session, game), viewers go to /live/[streamer-slug] and lock their
 * picks + bans, streamer closes the round and either recommends or
 * auto-applies the top-N back into the canonical RaceRandomizerConfig.
 */

export type PicksBansRoundStatus =
  | "open"
  | "closed"
  | "applied"
  | "cancelled";

export type RecommendationMode = "recommend" | "auto_apply";

export interface PicksBansRound {
  id: string;
  session_id: string;
  game_slug: string;
  status: PicksBansRoundStatus;
  recommendation_top_n: number;
  recommendation_mode: RecommendationMode;
  closes_at: string | null;
  closed_at: string | null;
  applied_at: string | null;
  results: PicksBansResults | null;
  opened_by_user_id: string | null;
  opened_at: string;
  updated_at: string;
}

export interface PicksBansBallot {
  id: string;
  round_id: string;
  viewer_twitch_user_id: string | null;
  anon_session_id: string | null;
  picks_tracks: string[];
  bans_tracks: string[];
  /** MKWorld knockout rally picks. Default `[]` for games without
   *  a rally pool — only MKW exposes the Rallies tab in the picker. */
  picks_rallies: string[];
  bans_rallies: string[];
  picks_item_modes: string[];
  bans_item_modes: string[];
  picks_item_literal: string[];
  bans_item_literal: string[];
  locked_at: string | null;
  viewer_display_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Evergreen per-(session, game, viewer) draft. Survives across rounds
 *  within the same GS session — when a round opens, the draft seeds
 *  the picker; locking mirrors the locked state back to the draft so
 *  the next round opens with the viewer's last confirmed picks. */
export interface PicksBansDraft {
  id: string;
  session_id: string;
  game_slug: string;
  viewer_twitch_user_id: string | null;
  anon_session_id: string | null;
  picks_tracks: string[];
  bans_tracks: string[];
  /** MKW rally picks/bans — see PicksBansBallot. */
  picks_rallies: string[];
  bans_rallies: string[];
  picks_item_modes: string[];
  bans_item_modes: string[];
  picks_item_literal: string[];
  bans_item_literal: string[];
  created_at: string;
  updated_at: string;
}

export interface PicksBansResults {
  tracks: PoolResults;
  /** MKW rallies — empty results when no game has rallies. */
  rallies: PoolResults;
  itemModes: PoolResults;
  itemLiteral: PoolResults;
}

export interface PoolResults {
  topPicks: Array<{ id: string; count: number }>;
  topBans: Array<{ id: string; count: number }>;
  totals: { picks: number; bans: number };
}

export type Pool = "tracks" | "rallies" | "itemModes" | "itemLiteral";

/** Ballot fields on a per-pool basis. */
export const POOL_BALLOT_FIELDS: Record<
  Pool,
  { picks: keyof PicksBansBallot; bans: keyof PicksBansBallot }
> = {
  tracks: { picks: "picks_tracks", bans: "bans_tracks" },
  rallies: { picks: "picks_rallies", bans: "bans_rallies" },
  itemModes: { picks: "picks_item_modes", bans: "bans_item_modes" },
  itemLiteral: { picks: "picks_item_literal", bans: "bans_item_literal" },
};
