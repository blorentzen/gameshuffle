/**
 * Session lifecycle constants. Phase 2 hardcodes these; Phase 4+ may
 * surface some as per-session config.
 */

/** How long a streamer can be offline before their active session ends. */
export const GRACE_PERIOD_MS = 60 * 60_000; // 1 hour

/** Maximum time a session can be active before auto-ending. */
export const AUTO_TIMEOUT_MS = 12 * 60 * 60_000; // 12 hours

/** How long the wrap-up phase (status='ending') lasts before transitioning to 'ended'. */
export const WRAP_UP_DURATION_MS = 60_000; // 60 seconds

/** Inactive cascade thresholds — how long after stream_offline_at each
 *  notification level fires. The 7d threshold also force-ends the session. */
export const INACTIVE_NOTIFICATION_THRESHOLDS_MS = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
} as const;

export type InactiveNotificationLevel = keyof typeof INACTIVE_NOTIFICATION_THRESHOLDS_MS;
