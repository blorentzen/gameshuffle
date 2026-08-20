/**
 * Shared presence constants + helpers (isomorphic — safe on server or client).
 *
 * "Online" has two sources in the app:
 *   1. Coarse fallback — `users.last_seen_at` written by the presence heartbeat
 *      every ~2 min; considered online if seen within ONLINE_MS. Used for
 *      server-rendered initial state and anywhere realtime isn't wired.
 *   2. Live — a Supabase Realtime presence channel per watched user
 *      (`PresenceProvider` / `useUserPresence`), which overrides the coarse
 *      value the moment it resolves.
 *
 * ONLINE_MS lived duplicated in four modules; this is now the single source.
 */

/** A user counts as recently-online if their last heartbeat is within this window. */
export const ONLINE_MS = 5 * 60 * 1000;

/** Coarse online check from a `last_seen_at` timestamp. */
export function isRecentlyOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return !Number.isNaN(t) && Date.now() - t < ONLINE_MS;
}
