/**
 * After someone connects Discord, the times they added with /gs-tt move to their account
 * (claimDiscordTimes). The sign-in callback leaves how many moved in this short-lived cookie,
 * and TtMovedToast on the time trials pages says so once (picks 2026-10-29, 4A). Client-safe.
 */

export const TT_MOVED_COOKIE = "gs-tt-moved";

export function movedLine(n: number): string {
  return `Moved ${n} ${n === 1 ? "time" : "times"} from Discord to your account.`;
}
