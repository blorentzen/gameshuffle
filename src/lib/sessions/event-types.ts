/**
 * Canonical `session_events.event_type` values.
 *
 * Phase 1 introduced `state_change`. Phase 2 adds the lifecycle-automation
 * event types per gs-pro-v1-phase-2-spec.md §3.2. Phase 3 will add adapter-
 * related ones.
 *
 * The DB column is plain `text`; this map is the code-side source of truth.
 * Adding a new event type is one entry here + the writer that emits it.
 */

export const SESSION_EVENT_TYPES = {
  /** Session moved between lifecycle statuses. payload.from / payload.to. */
  state_change: "state_change",
  /** Phase 1 — broadcaster or viewer rolled a new combo. */
  shuffle: "shuffle",
  /** Streamer went offline; grace timer started. */
  grace_period_started: "grace_period_started",
  /** Streamer came back online; grace timer cleared. */
  grace_period_cancelled: "grace_period_cancelled",
  /** 12h auto-timeout fired (or 7d inactive cascade). */
  auto_timeout_triggered: "auto_timeout_triggered",
  /** Wrap-up phase began (state_change to 'ending' fired alongside). */
  wrap_up_started: "wrap_up_started",
  /** Wrap-up phase finished; session transitioned to 'ended'. */
  wrap_up_complete: "wrap_up_complete",
  /** Recap payload computed. Phase 3 adapters subscribe to this. */
  recap_ready: "recap_ready",
  /** One of the inactive-cascade notifications (1h/24h/7d) fired. */
  inactive_notification_sent: "inactive_notification_sent",
  /** Phase 3A — viewer joined a session via a platform (Twitch, Discord, etc.). */
  participant_join: "participant_join",
  /** Phase 3A — viewer left a session (voluntary, kicked, session_ended, etc.). */
  participant_leave: "participant_leave",
  /** Phase 3A — adapter dispatch succeeded; payload records what was called + the result. */
  adapter_call: "adapter_call",
  /** Phase 3A — adapter dispatch threw; payload records the failing event + error. */
  adapter_call_failed: "adapter_call_failed",
} as const;

export type SessionEventType =
  (typeof SESSION_EVENT_TYPES)[keyof typeof SESSION_EVENT_TYPES];
