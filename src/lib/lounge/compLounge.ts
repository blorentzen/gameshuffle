/**
 * Mario Kart lounge posts in a GameShuffle Competitive server (two-app picks, https://claude.ai/artifact/HahsGm6TargWVxfTPeLMPo:
 * lounge rank-ups, division roles and the Monday board move to the competitive bot, with a 30-day pointer in the old app).
 * Kept in the server's `discord_app_guilds.settings.lounge`. When Competitive is in a server it does these there; a
 * server with only GameShuffle keeps getting them from GameShuffle until the move ends (src/lib/lounge/sync.ts).
 * Client-safe.
 */

import { isMmrGame, type MmrGame } from "@/lib/mmr/rules";

export interface CompLounge {
  /** Rank-up posts (free, opt-in). */
  rankUps: boolean;
  /** The game division roles follow (GS Pro), or null for off. */
  rolesGame: MmrGame | null;
  /** The game the Monday board covers (GS Pro), or null for off. */
  boardGame: MmrGame | null;
  /** Division name → role id (made once by a bot; carried over from GameShuffle when it made them first). */
  roleIds: Record<string, string>;
  /** The week (Monday's date) the board was last posted. */
  boardWeek: string | null;
}

export const EMPTY_COMP_LOUNGE: CompLounge = { rankUps: false, rolesGame: null, boardGame: null, roleIds: {}, boardWeek: null };

/** The server's lounge settings, or null when it has never had any (so GameShuffle's can be carried over). */
export function readCompLounge(settings: Record<string, unknown> | null | undefined): CompLounge | null {
  const raw = settings?.lounge;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ids = r.roleIds && typeof r.roleIds === "object" ? Object.fromEntries(Object.entries(r.roleIds as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string> : {};
  return {
    rankUps: r.rankUps === true,
    rolesGame: isMmrGame(r.rolesGame) ? r.rolesGame : null,
    boardGame: isMmrGame(r.boardGame) ? r.boardGame : null,
    roleIds: ids,
    boardWeek: typeof r.boardWeek === "string" ? r.boardWeek : null,
  };
}
