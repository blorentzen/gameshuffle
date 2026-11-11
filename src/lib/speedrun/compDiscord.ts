/**
 * Speedrun posts in a GameShuffle Competitive server (speedrun Twitch and Discord picks 2026-11-10, all as recommended;
 * on the Competitive bot by Britton's rule: anything competitive goes there). Kept in the server's
 * `discord_app_guilds.settings.speedrun`: new PB posts (free, opt-in) and PB pace alerts with an optional role ping
 * (GS Pro, judged on the server's owner). Both go to the server's posting channel. Client-safe.
 */

export interface CompSpeedrun {
  /** Post every new PB by the owner or a member who connected GameShuffle (free). */
  pbs: boolean;
  /** Post once per run when it's ahead of PB with a quarter left, while the runner is live (GS Pro). */
  pace: boolean;
  /** The role a pace alert pings, or null for none. */
  paceRole: string | null;
}

export const EMPTY_COMP_SPEEDRUN: CompSpeedrun = { pbs: false, pace: false, paceRole: null };

export function readCompSpeedrun(settings: Record<string, unknown> | null | undefined): CompSpeedrun {
  const raw = settings?.speedrun;
  if (!raw || typeof raw !== "object") return EMPTY_COMP_SPEEDRUN;
  const r = raw as Record<string, unknown>;
  return {
    pbs: r.pbs === true,
    pace: r.pace === true,
    paceRole: typeof r.paceRole === "string" && /^\d{5,25}$/.test(r.paceRole) ? r.paceRole : null,
  };
}
