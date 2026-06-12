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
  /** Phase A — race randomizer rolled a track. payload includes track id, name, cup. */
  track_randomized: "track_randomized",
  /** Phase A — race randomizer rolled an item preset. payload includes preset id, name. */
  items_randomized: "items_randomized",
  /** Phase A — race randomizer rolled both track + items in one !gs-race call. */
  race_randomized: "race_randomized",
  /** Multi-game refinements PR B — streamer opened a picks/bans round. */
  picks_bans_opened: "picks_bans_opened",
  /** Multi-game refinements PR B — streamer closed a picks/bans round. */
  picks_bans_closed: "picks_bans_closed",
  /** Multi-game refinements PR B — streamer applied results from a closed round. */
  picks_bans_applied: "picks_bans_applied",
  /** Multi-game refinements PR B — round was cancelled (manual or category pivot). */
  picks_bans_cancelled: "picks_bans_cancelled",
  /** Multi-game refinements PR B — viewer locked their ballot in a round. */
  picks_bans_ballot_locked: "picks_bans_ballot_locked",
  /** Multi-game spec — `gs_sessions.active_game` changed (streamer
   *  swapped Twitch category, or category went unsupported). Payload:
   *  `{ from: string | null, to: string | null, category_id?: string | null }`.
   *  Drives the live page's "Race History / Item History" reset + an
   *  activity-feed entry on category swap. */
  active_game_changed: "active_game_changed",
  /** Prequeue spec — streamer (or scheduled-session cron) opened the
   *  pre-stream Discord queue. Payload: `{ cap, opened_via }`. */
  prequeue_opened: "prequeue_opened",
  /** Prequeue spec — viewer clicked "I'm in" on the announcement
   *  embed. Payload: `{ discord_user_id, position, list: 'queue' | 'waitlist' }`. */
  prequeue_joined: "prequeue_joined",
  /** Prequeue spec — viewer pulled themselves out. Payload:
   *  `{ discord_user_id, was_position, list }`. */
  prequeue_left: "prequeue_left",
  /** Prequeue spec — waitlist position 1 auto-moved into the queue
   *  because someone dropped. Payload: `{ discord_user_id, new_position }`. */
  prequeue_promoted: "prequeue_promoted",
  /** Prequeue spec — streamer/mod removed a queued user. Payload:
   *  `{ discord_user_id, removed_by, was_position }`. */
  prequeue_kicked: "prequeue_kicked",
  /** Spec 02 Fix 1 — outbound domain event publisher recorded a
   *  fan-out decision. Payload:
   *  `{ domain_event: string, policy: { targets, mode },
   *     legs: Array<{ platform, ok, ... }> }`.
   *  Lands one row per `publishDomainEvent` call regardless of
   *  whether anything got sent — `mode: "silent"` events still
   *  produce an audit row so the operator can see what was
   *  suppressed and why. */
  fanout_dispatched: "fanout_dispatched",
} as const;

export type SessionEventType =
  (typeof SESSION_EVENT_TYPES)[keyof typeof SESSION_EVENT_TYPES];
