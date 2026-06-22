/** Moderation-status helpers. Pure logic — safe on server or client. */

import type { ModerationStatus } from "./types";

/**
 * Whether a user's PUBLIC-facing surfaces (the `/u` profile, and the live/
 * overlay surfaces) should render. A `suspended` user whose `until` has
 * passed is treated as visible again (the suspension self-expires at read
 * time; a cron can tidy the column later). `warned` is a private note with
 * no public effect.
 */
export function isPubliclyVisible(
  status: ModerationStatus | string | null | undefined,
  until: string | null | undefined,
): boolean {
  if (status === "banned") return false;
  if (status === "suspended") {
    if (!until) return false;
    return new Date(until).getTime() < Date.now();
  }
  return true;
}
