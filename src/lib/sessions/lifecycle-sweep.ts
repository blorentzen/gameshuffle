/**
 * Session lifecycle sweep — periodic state-machine driver.
 *
 * Runs from /api/cron/session-lifecycle every 5 minutes. Walks through
 * each lifecycle transition that's time-driven (eligibility windows,
 * timeouts, inactive cascades) and applies them atomically. Each sweep
 * function is independent + idempotent — safe to re-run mid-tick if a
 * deploy interrupts the sweep, and safe to drop the cron entirely
 * without state corruption (cron only ever transitions; it never
 * deletes or rewrites).
 *
 * Per gs-pro-v1-phase-2-spec.md §§4–5.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  INACTIVE_NOTIFICATION_THRESHOLDS_MS,
  WRAP_UP_DURATION_MS,
} from "./constants";
import { SESSION_EVENT_TYPES } from "./event-types";
import {
  computeRecapPayload,
  markInactiveNotified,
  recordEvent,
  startGracePeriod,
  transitionSessionStatus,
} from "./service";
import type { GsSession, SessionStatus } from "./types";
import {
  onSessionEnding,
  sweepStreamEndsAndRefund,
} from "@/lib/economy/sessionHooks";
import { publishDomainEvent } from "@/lib/events/publisher";
import { hasAllCurrentScopes } from "@/lib/twitch/scopes";
import {
  resolveTwitchCategoryIdForSlug,
  setBroadcasterCategory,
} from "@/lib/twitch/broadcaster";

// ---- Sweep result types --------------------------------------------------

export interface InactiveNotificationCounts {
  "1h": number;
  "24h": number;
  "7d": number;
}

export interface LifecycleSweepResult {
  scheduledToReady: number;
  readyToScheduled: number;
  /** Spec 02 §5 — scheduled sessions whose `open_mode === "auto_open"`
   *  hit their `scheduled_at` time this tick. The sweep transitioned
   *  them to `active` AND published the `session_opened` domain event. */
  scheduledAutoOpened: number;
  /** Spec 02 §5 — scheduled sessions whose `open_mode === "announce_only"`
   *  hit their `scheduled_at` time this tick. The sweep published the
   *  `session_announced` heads-up but kept status `scheduled`; the
   *  streamer opens the lobby manually afterwards. */
  scheduledAnnounced: number;
  /** Spec 02 §5 follow-on — scheduled+announce_only sessions whose
   *  `announce_at` (pre-go-live moment) hit this tick. The sweep
   *  fired the all-in package: Discord ping + pre-live lobby open +
   *  Twitch category set. Status stays `scheduled`. */
  preLiveAnnounced: number;
  /** Spec 02 §8 — recurring sessions whose `recurrence` triggered
   *  a child instance this tick. */
  recurrencesMaterialized: number;
  graceTimeoutsTriggered: number;
  autoTimeoutsTriggered: number;
  wrapUpsCompleted: number;
  inactiveNotifications: InactiveNotificationCounts;
  reconciledStreams: number;
  streamGraceFinalized: number;
  streamGraceRefundedMarkets: number;
  errors: number;
}

function admin() {
  return createServiceClient();
}

// ---- Helpers --------------------------------------------------------------

const SESSION_COLUMNS =
  "id, owner_user_id, name, slug, description, status, scheduled_at, scheduled_eligibility_window_hours, open_mode, announce_at, pre_live_lobby_opened_at, activated_at, activated_via, ended_at, ended_via, platforms, config, configured_games, tier_required, parent_session_id, feature_flags, stream_offline_at, grace_period_expires_at, inactive_notified_at, auto_timeout_at, recurrence, recurrence_until, parent_recurrence_id, created_at, updated_at";

async function safeTransition(
  sessionId: string,
  to: SessionStatus,
  via: string | null,
  label: string,
  payload: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    await transitionSessionStatus({
      id: sessionId,
      newStatus: to,
      via: via as never,
      actorType: "system",
      actorId: `cron:lifecycle-sweep:${label}`,
      payload,
    });
  } catch (err) {
    console.error("[lifecycle-sweep] transition failed", {
      sessionId,
      to,
      label,
      err: err instanceof Error ? err.message : err,
    });
    return false;
  }
  // Session-end refund per Spec 02 §8. Any transition into `ending`
  // is the moment the session's open markets must close cleanly —
  // a separate (and silent) refund fires per-stream when the
  // broadcast itself ends, but session-end alone never waits for
  // the stream to end. Best-effort; logged inside the hook.
  if (to === "ending") {
    await onSessionEnding({ sessionId, reason: "session_end" });
  }
  return true;
}

// ---- §5.1 sweepScheduledToReady ------------------------------------------

export async function sweepScheduledToReady(): Promise<number> {
  const { data } = await admin()
    .from("gs_sessions")
    .select("id, scheduled_at, scheduled_eligibility_window_hours")
    .eq("status", "scheduled")
    .not("scheduled_at", "is", null);

  const now = Date.now();
  let count = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    scheduled_at: string;
    scheduled_eligibility_window_hours: number | null;
  }>) {
    const windowHours = row.scheduled_eligibility_window_hours ?? 4;
    const scheduledMs = Date.parse(row.scheduled_at);
    if (!Number.isFinite(scheduledMs)) continue;
    const windowStart = scheduledMs - windowHours * 3600_000;
    const windowEnd = scheduledMs + windowHours * 3600_000;
    if (now >= windowStart && now <= windowEnd) {
      const ok = await safeTransition(row.id, "ready", null, "scheduled-to-ready", {
        trigger: "eligibility_window_opened",
        scheduled_at: row.scheduled_at,
        window_hours: windowHours,
      });
      if (ok) count++;
    }
  }
  return count;
}

// ---- §5.2 sweepReadyToScheduled ------------------------------------------

export async function sweepReadyToScheduled(): Promise<number> {
  const { data } = await admin()
    .from("gs_sessions")
    .select("id, scheduled_at, scheduled_eligibility_window_hours")
    .eq("status", "ready")
    .not("scheduled_at", "is", null);

  const now = Date.now();
  let count = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    scheduled_at: string;
    scheduled_eligibility_window_hours: number | null;
  }>) {
    const windowHours = row.scheduled_eligibility_window_hours ?? 4;
    const scheduledMs = Date.parse(row.scheduled_at);
    if (!Number.isFinite(scheduledMs)) continue;
    const windowEnd = scheduledMs + windowHours * 3600_000;
    if (now > windowEnd) {
      // Window passed without activation. Bump back to scheduled so Phase 4
      // Hub can surface a "missed schedule — reschedule or cancel" prompt.
      const ok = await safeTransition(row.id, "scheduled", null, "ready-to-scheduled", {
        trigger: "eligibility_window_passed",
        scheduled_at: row.scheduled_at,
        window_hours: windowHours,
      });
      if (ok) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Spec 02 §5 — scheduled → open transition
// ---------------------------------------------------------------------------

/**
 * Walk scheduled sessions whose `scheduled_at` is in the past AND
 * carry an `open_mode` value, and fire the per-mode behavior:
 *
 *   - `auto_open`     — transition status `scheduled → active` so the
 *                       lobby is joinable, then publish the
 *                       `session_opened` domain event so Twitch /
 *                       Discord get the "lobby is live" announcement.
 *   - `announce_only` — publish the `session_announced` heads-up but
 *                       LEAVE status as `scheduled`. Streamer opens
 *                       manually afterwards. Subsequent ticks won't
 *                       re-announce because we mark
 *                       `feature_flags.scheduled_open_announced_at`
 *                       on first fire and the filter skips marked rows.
 *
 * Continuity (Spec 02 §6): this sweep NEVER closes/recreates a
 * session. The `auto_open` path TRANSITIONS the row in place; the
 * existing go-live-attach path in `handleStreamOnline` later flips
 * `feature_flags.test_session: false` when stream.online fires. The
 * recent `promoteSessionToLive` helper preserves the row, so a
 * session that auto-opens then goes live keeps the same id end-to-
 * end. Verified by `test-scheduled-opens-sweep.ts`.
 *
 * Idempotency:
 *   - auto_open mode is self-idempotent — once status flips from
 *     `scheduled → active`, the filter `status = 'scheduled'`
 *     stops matching.
 *   - announce_only mode marks the session via feature_flags so the
 *     filter (`scheduled_open_announced_at IS NULL`) skips it on
 *     the next tick.
 *
 * Returns:
 *   `{ autoOpened, announced }` counters for the orchestrator's
 *   result aggregation.
 */
export async function sweepScheduledOpens(): Promise<{
  autoOpened: number;
  announced: number;
}> {
  const now = Date.now();
  const { data } = await admin()
    .from("gs_sessions")
    .select(
      "id, owner_user_id, scheduled_at, open_mode, pre_live_lobby_opened_at, feature_flags, platforms, config",
    )
    .eq("status", "scheduled")
    .not("open_mode", "is", null)
    .not("scheduled_at", "is", null);

  let autoOpened = 0;
  let announced = 0;

  for (const row of (data ?? []) as Array<{
    id: string;
    owner_user_id: string;
    scheduled_at: string;
    open_mode: "announce_only" | "auto_open";
    pre_live_lobby_opened_at: string | null;
    feature_flags: Record<string, unknown> | null;
    platforms: Record<string, unknown> | null;
    config: Record<string, unknown> | null;
  }>) {
    const scheduledMs = Date.parse(row.scheduled_at);
    if (!Number.isFinite(scheduledMs)) continue;
    if (scheduledMs > now) continue; // not yet — wait for future tick

    if (row.open_mode === "auto_open") {
      // Status-flip is the idempotency anchor — once active, this row
      // drops out of the filter for the next tick.
      const transitionedOk = await safeTransition(
        row.id,
        "active",
        "scheduled_auto",
        "scheduled-auto-open",
        {
          trigger: "scheduled_auto_open",
          scheduled_at: row.scheduled_at,
        },
      );
      if (!transitionedOk) continue;
      autoOpened++;

      // Best-effort fan-out. Audit lands inside `publishDomainEvent`.
      // Lifecycle sweep tolerates any failure here — the status
      // change already committed, the fan-out failure shows up in
      // `session_events.fanout_dispatched.legs`.
      try {
        const slug = resolveActiveGameSlug(row.config);
        await publishDomainEvent({
          type: "session_opened",
          actor: {
            ownerUserId: row.owner_user_id,
            streamerSlug: null,
            sessionId: row.id,
          },
          payload: {
            randomizerSlug: slug,
            via: "auto_open",
          },
        });
      } catch (err) {
        console.error(
          `[lifecycle-sweep] auto_open publish failed for ${row.id}`,
          err,
        );
      }
    } else if (row.open_mode === "announce_only") {
      // Idempotency: skip if we've already announced this session
      // (sweep runs every 5 min; a row that hits its scheduled_at
      // would otherwise re-announce on every subsequent tick until
      // the host activates). Either anchor counts:
      //   - legacy `scheduled_open_announced_at` feature_flags
      //   - new `pre_live_lobby_opened_at` column (filled by
      //     `sweepAnnouncements` when the streamer set an earlier
      //     `announce_at` — the all-in pre-live package replaces
      //     this simpler at-scheduled-time fallback).
      const alreadyAnnounced =
        row.feature_flags?.scheduled_open_announced_at != null ||
        row.pre_live_lobby_opened_at != null;
      if (alreadyAnnounced) continue;

      // Mark the row BEFORE the publish so a transient publish
      // failure doesn't leave the sweep loop announcing forever.
      const { error: markErr } = await admin()
        .from("gs_sessions")
        .update({
          feature_flags: {
            ...(row.feature_flags ?? {}),
            scheduled_open_announced_at: new Date(now).toISOString(),
          },
        })
        .eq("id", row.id);
      if (markErr) {
        console.error(
          `[lifecycle-sweep] announce_only mark failed for ${row.id}`,
          markErr,
        );
        continue;
      }
      announced++;

      try {
        await publishDomainEvent({
          type: "session_announced",
          actor: {
            ownerUserId: row.owner_user_id,
            streamerSlug: null,
            sessionId: row.id,
          },
          payload: {
            startAt: row.scheduled_at,
            description: null,
            awaitingHost: true,
          },
        });
      } catch (err) {
        console.error(
          `[lifecycle-sweep] announce_only publish failed for ${row.id}`,
          err,
        );
      }
    }
  }

  return { autoOpened, announced };
}

/** Pull the active game slug for the publisher payload from
 *  `session.config.game` — the canonical single-game pointer for
 *  Twitch-bound sessions. Multi-game sessions use `active_game`
 *  which the sweep doesn't currently read. */
function resolveActiveGameSlug(
  config: Record<string, unknown> | null,
): string | null {
  const slug = config?.game;
  if (typeof slug === "string" && slug.length > 0) return slug;
  return null;
}

/**
 * Resolve the streamer-declared starting game for a session. Falls
 * back to `config.game` when `configured_games` is unset (legacy
 * single-game shape). Returns null when no game has been declared.
 */
function resolveStartingGameSlug(
  config: Record<string, unknown> | null,
  configuredGames: string[] | null,
): string | null {
  if (Array.isArray(configuredGames) && configuredGames.length > 0) {
    const first = configuredGames[0];
    if (typeof first === "string" && first.length > 0) return first;
  }
  return resolveActiveGameSlug(config);
}

// ---- §5.2.1 sweepAnnouncements -------------------------------------------

/**
 * Spec 02 §5 follow-on — `announce_only` sessions with an explicit
 * `announce_at` get an all-in pre-live package at that earlier moment:
 *
 *   1. Discord ping (session_announced fan-out, awaitingHost = true).
 *   2. Pre-live lobby opens — viewer chat commands (notably !gs-join)
 *      start accepting against the still-scheduled session.
 *   3. Twitch category set to the starting game so the broadcaster
 *      shows the right game in viewer discovery. Requires
 *      `channel:manage:broadcast` (skipped cleanly when missing —
 *      streamer reconnects when they hit the upgrade banner).
 *
 * Idempotency:
 *   - The `pre_live_lobby_opened_at` column doubles as both the
 *     "viewer commands accepted" flag and the sweep's idempotency
 *     anchor. Once stamped, this row drops out of the filter.
 *   - The partial index `idx_gs_sessions_announce_pending` keeps
 *     the hot path narrow.
 *
 * Twitch category-set failures are best-effort — logged, but the
 * Discord ping + pre-live lobby flag still land so the cron tick
 * isn't blocked on a single streamer's missing scope.
 *
 * Returns the count of sessions whose pre-live package fired this tick.
 */
export async function sweepAnnouncements(): Promise<number> {
  const now = Date.now();
  const { data } = await admin()
    .from("gs_sessions")
    .select(
      "id, owner_user_id, scheduled_at, announce_at, open_mode, config, configured_games",
    )
    .eq("status", "scheduled")
    // Both `announce_only` and `auto_open` can carry an explicit
    // `announce_at` — the streamer picked a preset/custom pre-session
    // notification AND optionally checked auto-activate at start time.
    // Either way, this sweep fires the pre-live package; the
    // scheduled-opens sweep separately handles the auto-activation
    // when `scheduled_at` lands.
    .in("open_mode", ["announce_only", "auto_open"])
    .is("pre_live_lobby_opened_at", null)
    .not("announce_at", "is", null);

  let fired = 0;
  for (const row of (data ?? []) as Array<{
    id: string;
    owner_user_id: string;
    scheduled_at: string | null;
    announce_at: string;
    open_mode: "announce_only" | "auto_open";
    config: Record<string, unknown> | null;
    configured_games: string[] | null;
  }>) {
    const announceMs = Date.parse(row.announce_at);
    if (!Number.isFinite(announceMs)) continue;
    if (announceMs > now) continue; // future tick

    // Mark FIRST so a transient publish/Twitch failure doesn't leave
    // the row eligible for the next tick (loops are worse than missed
    // chat sends). Same pattern as sweepScheduledOpens announce_only.
    const stampedAt = new Date(now).toISOString();
    const { error: markErr } = await admin()
      .from("gs_sessions")
      .update({ pre_live_lobby_opened_at: stampedAt })
      .eq("id", row.id);
    if (markErr) {
      console.error(
        `[lifecycle-sweep] sweepAnnouncements mark failed for ${row.id}`,
        markErr,
      );
      continue;
    }
    fired++;

    // 1. Discord ping. Reuses the existing session_announced event
    //    type — the publisher's default policy routes it to Discord.
    try {
      await publishDomainEvent({
        type: "session_announced",
        actor: {
          ownerUserId: row.owner_user_id,
          streamerSlug: null,
          sessionId: row.id,
        },
        payload: {
          startAt: row.scheduled_at ?? row.announce_at,
          description: null,
          awaitingHost: true,
        },
      });
    } catch (err) {
      console.error(
        `[lifecycle-sweep] sweepAnnouncements publish failed for ${row.id}`,
        err,
      );
    }

    // 2. Twitch category set. Best-effort; only attempts when the
    //    streamer has reconnected with `channel:manage:broadcast`.
    //    The pre-live lobby flag (step above) lands regardless so
    //    chat commands work even when this fails.
    try {
      const startingSlug = resolveStartingGameSlug(
        row.config,
        row.configured_games,
      );
      if (!startingSlug) continue;
      const { data: conn } = await admin()
        .from("twitch_connections")
        .select("twitch_user_id, scopes")
        .eq("user_id", row.owner_user_id)
        .maybeSingle();
      const connection = conn as
        | { twitch_user_id: string; scopes: string[] | null }
        | null;
      if (!connection?.twitch_user_id) continue;
      if (!hasAllCurrentScopes(connection.scopes)) {
        // Streamer is on a stale scope bundle — log and move on.
        // They'll see the reconnect banner on the Twitch dashboard
        // and the next session's announce will succeed.
        console.warn(
          `[lifecycle-sweep] skipping category set for ${row.id} — scope reconnect pending`,
        );
        continue;
      }
      const gameId = await resolveTwitchCategoryIdForSlug(startingSlug);
      if (!gameId) {
        console.warn(
          `[lifecycle-sweep] no twitch_game_categories row for slug ${startingSlug}`,
        );
        continue;
      }
      await setBroadcasterCategory(
        row.owner_user_id,
        connection.twitch_user_id,
        gameId,
      );
    } catch (err) {
      console.error(
        `[lifecycle-sweep] sweepAnnouncements category set failed for ${row.id}`,
        err,
      );
    }
  }

  return fired;
}

// ---- §5.3 sweepGraceTimeouts ---------------------------------------------

export async function sweepGraceTimeouts(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await admin()
    .from("gs_sessions")
    .select("id, grace_period_expires_at")
    .eq("status", "active")
    .not("grace_period_expires_at", "is", null)
    .lt("grace_period_expires_at", nowIso);

  let count = 0;
  for (const row of (data ?? []) as Array<{ id: string; grace_period_expires_at: string }>) {
    const ok = await safeTransition(row.id, "ending", "stream_ended_grace", "grace-timeout", {
      trigger: "grace_period_expired",
      grace_period_expires_at: row.grace_period_expires_at,
    });
    if (ok) count++;
  }
  return count;
}

// ---- §5.4 sweepAutoTimeouts ----------------------------------------------

export async function sweepAutoTimeouts(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await admin()
    .from("gs_sessions")
    .select("id, auto_timeout_at, activated_at")
    .eq("status", "active")
    .not("auto_timeout_at", "is", null)
    .lt("auto_timeout_at", nowIso);

  let count = 0;
  for (const row of (data ?? []) as Array<{ id: string; auto_timeout_at: string; activated_at: string | null }>) {
    await recordEvent({
      sessionId: row.id,
      eventType: SESSION_EVENT_TYPES.auto_timeout_triggered,
      actorType: "system",
      actorId: "cron:lifecycle-sweep:auto-timeout",
      payload: {
        reason: "12h_max_active",
        activated_at: row.activated_at,
        auto_timeout_at: row.auto_timeout_at,
      },
    });
    const ok = await safeTransition(row.id, "ending", "auto_timeout", "auto-timeout", {
      trigger: "12h_max_active",
    });
    if (ok) count++;
  }
  return count;
}

// ---- §5.5 sweepWrapUpCompletion ------------------------------------------

export async function sweepWrapUpCompletion(): Promise<number> {
  // Find sessions in `ending`, then check the audit log for when they
  // entered `ending` to compute whether the wrap-up duration has elapsed.
  const { data: sessions } = await admin()
    .from("gs_sessions")
    .select(SESSION_COLUMNS)
    .eq("status", "ending");

  if (!sessions || sessions.length === 0) return 0;

  const nowMs = Date.now();
  let count = 0;
  for (const session of sessions as unknown as GsSession[]) {
    // Test sessions skip the wrap-up window entirely. The end action
    // already transitioned them to `ended` directly; if a test session
    // is still in `ending` here, it's likely a stale row from a prior
    // bug — close it without firing recap-to-chat.
    if (session.feature_flags?.test_session) {
      await safeTransition(session.id, "ended", null, "wrap-up", {
        trigger: "test_session_wrap_up_skip",
      });
      continue;
    }
    const enteredAtMs = await getEnteredEndingAtMs(session.id);
    if (enteredAtMs === null) continue;
    if (nowMs - enteredAtMs < WRAP_UP_DURATION_MS) continue;

    // Compute the recap and write the recap_ready event. Phase 3A
    // dispatches recap_ready to attached adapters AFTER the audit row is
    // durable so the recap data is recoverable even if every adapter
    // fails. Per spec §6.3.
    let recap: import("./service").RecapPayload | null = null;
    try {
      recap = await computeRecapPayload(session.id);
      await recordEvent({
        sessionId: session.id,
        eventType: SESSION_EVENT_TYPES.recap_ready,
        actorType: "system",
        actorId: "cron:lifecycle-sweep:wrap-up",
        payload: recap as unknown as Record<string, unknown>,
      });
    } catch (err) {
      console.error("[lifecycle-sweep] recap computation failed", {
        sessionId: session.id,
        err: err instanceof Error ? err.message : err,
      });
      // Don't block the transition — we still want the session to end.
    }

    if (recap) {
      try {
        const { dispatchLifecycleEvent } = await import("@/lib/adapters/dispatcher");
        await dispatchLifecycleEvent({ type: "recap_ready", session, recap });
      } catch (err) {
        console.error("[lifecycle-sweep] recap dispatch failed", {
          sessionId: session.id,
          err: err instanceof Error ? err.message : err,
        });
      }
    }

    const ok = await safeTransition(session.id, "ended", null, "wrap-up", {
      trigger: "wrap_up_complete",
    });
    if (ok) {
      await recordEvent({
        sessionId: session.id,
        eventType: SESSION_EVENT_TYPES.wrap_up_complete,
        actorType: "system",
        actorId: "cron:lifecycle-sweep:wrap-up",
        payload: { duration_ms: WRAP_UP_DURATION_MS },
      });
      // Dispatch wrap_up_complete to adapters. (session_ended dispatch
      // already fired inside transitionSessionStatus → safeTransition.)
      try {
        const { dispatchLifecycleEvent } = await import("@/lib/adapters/dispatcher");
        await dispatchLifecycleEvent({ type: "wrap_up_complete", session });
      } catch (err) {
        console.error("[lifecycle-sweep] wrap_up_complete dispatch failed", {
          sessionId: session.id,
          err: err instanceof Error ? err.message : err,
        });
      }
      count++;
    }
  }
  return count;
}

/**
 * Finds the most recent `state_change` event whose payload.to = 'ending'
 * and returns its created_at as ms. Returns null if no such event found.
 */
async function getEnteredEndingAtMs(sessionId: string): Promise<number | null> {
  const { data } = await admin()
    .from("session_events")
    .select("created_at, payload")
    .eq("session_id", sessionId)
    .eq("event_type", SESSION_EVENT_TYPES.state_change)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data) return null;
  for (const row of data as Array<{ created_at: string; payload: { to?: string } }>) {
    if (row.payload?.to === "ending") {
      const ms = Date.parse(row.created_at);
      return Number.isFinite(ms) ? ms : null;
    }
  }
  return null;
}

// ---- §8 sweepRecurrences -------------------------------------------------

/**
 * Spec 02 §8 — materialize the next instance of a recurring session
 * after the parent ends. Walks `gs_sessions` for ended parents that:
 *   - have `recurrence` set
 *   - haven't already produced a child for the next slot
 *   - whose next computed scheduled_at hasn't exceeded `recurrence_until`
 *
 * The child clones the parent's editable config (name, description,
 * platforms, modules, configured_games, open_mode, opens_queue,
 * announce_at offset, recurrence) and advances `scheduled_at` by the
 * cadence. `recurrence_until` is carried over verbatim so the chain
 * continues materializing until the cutoff.
 *
 * Idempotency anchor: the child's `parent_recurrence_id` plus its
 * `scheduled_at` uniquely identify a slot — checked before insert so
 * concurrent ticks can't double-create.
 *
 * Returns the count of children materialized this tick.
 */
export async function sweepRecurrences(): Promise<number> {
  const { data: parents } = await admin()
    .from("gs_sessions")
    .select(SESSION_COLUMNS)
    .eq("status", "ended")
    .not("recurrence", "is", null);

  if (!parents || parents.length === 0) return 0;

  let materialized = 0;
  for (const parent of parents as unknown as GsSession[]) {
    if (!parent.scheduled_at) continue;

    const nextScheduledAt = computeNextScheduledAt(
      parent.scheduled_at,
      parent.recurrence as "daily" | "weekly" | "monthly",
    );
    if (!nextScheduledAt) continue;

    // Recurrence_until is a cutoff: once the next slot would exceed
    // it, stop materializing. Compares as ISO strings → relies on
    // lexicographic ordering matching chronological for ISO-8601 with
    // the same timezone format, which is the case here (always 'Z').
    if (
      parent.recurrence_until &&
      nextScheduledAt > parent.recurrence_until
    ) {
      continue;
    }

    // Look up any existing child for this slot. Indexed via
    // `idx_gs_sessions_parent_recurrence`.
    const { data: existing } = await admin()
      .from("gs_sessions")
      .select("id")
      .eq("parent_recurrence_id", parent.id)
      .eq("scheduled_at", nextScheduledAt)
      .maybeSingle();
    if (existing) continue;

    // Clone the parent into a new draft-shaped insert.
    const childPayload = buildRecurrenceChildPayload(parent, nextScheduledAt);
    try {
      const { error } = await admin()
        .from("gs_sessions")
        .insert(childPayload);
      if (error) {
        // Defensive — duplicate-key races shouldn't happen with the
        // parent_recurrence_id + scheduled_at check above, but log
        // anyway so a recurring chain doesn't silently stall.
        console.error(
          `[lifecycle-sweep] sweepRecurrences insert failed for parent ${parent.id}`,
          error,
        );
        continue;
      }
      materialized++;
    } catch (err) {
      console.error(
        `[lifecycle-sweep] sweepRecurrences unexpected error for parent ${parent.id}`,
        err,
      );
    }
  }

  return materialized;
}

/** Advance a scheduled_at ISO string by the recurrence cadence.
 *  Returns the next ISO timestamp, or null on parse failure. */
function computeNextScheduledAt(
  scheduledAt: string,
  cadence: "daily" | "weekly" | "monthly",
): string | null {
  const ms = Date.parse(scheduledAt);
  if (!Number.isFinite(ms)) return null;
  const next = new Date(ms);
  switch (cadence) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next.toISOString();
}

/** Build the insert row for a recurrence child. Slug is uniquified
 *  with a short ISO date suffix so it stays human-readable. */
function buildRecurrenceChildPayload(
  parent: GsSession,
  nextScheduledAt: string,
): Record<string, unknown> {
  const datePart = nextScheduledAt.slice(0, 10).replace(/-/g, "");
  // Strip any prior date suffix to avoid "name-20260605-20260612" chains.
  const baseSlug = parent.slug.replace(/-\d{8}$/, "");
  const childSlug = `${baseSlug}-${datePart}`;

  // Advance announce_at by the same delta the schedule moved by, so
  // the pre-live offset (e.g. 1h before) stays consistent across the
  // chain. Null announce_at copies straight through.
  let nextAnnounceAt: string | null = null;
  if (parent.announce_at) {
    const announceMs = Date.parse(parent.announce_at);
    const oldScheduledMs = Date.parse(parent.scheduled_at as string);
    const nextScheduledMs = Date.parse(nextScheduledAt);
    if (
      Number.isFinite(announceMs) &&
      Number.isFinite(oldScheduledMs) &&
      Number.isFinite(nextScheduledMs)
    ) {
      const delta = nextScheduledMs - oldScheduledMs;
      nextAnnounceAt = new Date(announceMs + delta).toISOString();
    }
  }

  return {
    owner_user_id: parent.owner_user_id,
    name: parent.name,
    slug: childSlug,
    description: parent.description,
    status: "scheduled" as SessionStatus,
    scheduled_at: nextScheduledAt,
    scheduled_eligibility_window_hours:
      parent.scheduled_eligibility_window_hours ?? 4,
    open_mode: parent.open_mode,
    announce_at: nextAnnounceAt,
    platforms: parent.platforms,
    config: parent.config,
    configured_games: parent.configured_games,
    tier_required: parent.tier_required,
    feature_flags: parent.feature_flags,
    recurrence: parent.recurrence,
    recurrence_until: parent.recurrence_until,
    parent_recurrence_id: parent.id,
  };
}

// ---- §5.6 sweepInactiveNotifications -------------------------------------

export async function sweepInactiveNotifications(): Promise<InactiveNotificationCounts> {
  const counts: InactiveNotificationCounts = { "1h": 0, "24h": 0, "7d": 0 };

  const { data } = await admin()
    .from("gs_sessions")
    .select("id, owner_user_id, stream_offline_at, inactive_notified_at")
    .eq("status", "active")
    .not("stream_offline_at", "is", null);

  if (!data) return counts;

  const nowMs = Date.now();
  for (const row of data as Array<{
    id: string;
    owner_user_id: string;
    stream_offline_at: string;
    inactive_notified_at: Record<string, string> | null;
  }>) {
    const offlineMs = Date.parse(row.stream_offline_at);
    if (!Number.isFinite(offlineMs)) continue;
    const elapsed = nowMs - offlineMs;
    const ledger = row.inactive_notified_at ?? {};

    // 1h notification — Hub indicator (Phase 4 will render). Phase 2 only
    // writes the event row.
    if (elapsed >= INACTIVE_NOTIFICATION_THRESHOLDS_MS["1h"] && !ledger["1h"]) {
      try {
        await markInactiveNotified(row.id, "1h");
        counts["1h"]++;
      } catch (err) {
        console.error("[lifecycle-sweep] 1h notify failed", { sessionId: row.id, err });
      }
    }

    // 24h notification — email queued (Phase 3 wires delivery). Phase 2
    // writes the event row.
    if (elapsed >= INACTIVE_NOTIFICATION_THRESHOLDS_MS["24h"] && !ledger["24h"]) {
      try {
        await markInactiveNotified(row.id, "24h");
        counts["24h"]++;
      } catch (err) {
        console.error("[lifecycle-sweep] 24h notify failed", { sessionId: row.id, err });
      }
    }

    // 7d auto-close — also force-end the session.
    if (elapsed >= INACTIVE_NOTIFICATION_THRESHOLDS_MS["7d"] && !ledger["7d"]) {
      try {
        await markInactiveNotified(row.id, "7d");
        counts["7d"]++;
      } catch (err) {
        console.error("[lifecycle-sweep] 7d notify failed", { sessionId: row.id, err });
      }
      // Force-end via auto_timeout — same end state as the 12h timeout.
      await safeTransition(row.id, "ending", "auto_timeout", "inactive-7d", {
        trigger: "7d_inactive_streamer",
        offline_at: row.stream_offline_at,
      });
    }
  }

  return counts;
}

// ---- §7.4 reconcileStreamStatus -----------------------------------------

/**
 * Cross-check active sessions' stream_offline_at against Twitch Helix's
 * live status. Catches missed EventSub events (rare, but the
 * architecture doc calls for graceful degradation if EventSub fails).
 *
 * For each active Twitch session: fetches the streamer's stream status
 * via Helix `GET /streams?user_id=<channel_id>`. Helix returns a row when
 * the stream is live, nothing when offline.
 *   - Helix says offline + session has no stream_offline_at → start grace
 *   - Helix says online + session has stream_offline_at → cancel grace
 *
 * Cost: one Helix call per active Twitch session per 5-min tick. Helix
 * supports up to 100 user_ids per call, so this batches naturally if the
 * active count grows.
 */
export async function reconcileStreamStatus(): Promise<number> {
  const { data: sessions } = await admin()
    .from("gs_sessions")
    .select("id, owner_user_id, stream_offline_at, platforms")
    .eq("status", "active");
  if (!sessions || sessions.length === 0) return 0;

  // Build a list of Twitch channel_ids → session ids.
  const channelToSession = new Map<string, { sessionId: string; offlineAt: string | null }>();
  for (const s of sessions as Array<{
    id: string;
    owner_user_id: string;
    stream_offline_at: string | null;
    platforms: { streaming?: { type?: string; channel_id?: string } } | null;
  }>) {
    const streaming = s.platforms?.streaming;
    if (streaming?.type !== "twitch" || !streaming.channel_id) continue;
    channelToSession.set(streaming.channel_id, {
      sessionId: s.id,
      offlineAt: s.stream_offline_at,
    });
  }

  if (channelToSession.size === 0) return 0;

  // Lazy-import the Twitch client so non-Twitch deployments don't pay the
  // import cost. (Also keeps the lifecycle module from circular-importing
  // through the Twitch lib.)
  const { getStreamsByUserIds } = await import("@/lib/twitch/client");
  const channelIds = Array.from(channelToSession.keys());
  const liveStatuses = new Map<string, boolean>(); // channel_id → is_live

  // Helix accepts up to 100 user_ids per call.
  const CHUNK = 100;
  try {
    for (let i = 0; i < channelIds.length; i += CHUNK) {
      const chunk = channelIds.slice(i, i + CHUNK);
      const liveStreams = await getStreamsByUserIds(chunk);
      for (const id of chunk) liveStatuses.set(id, false);
      for (const stream of liveStreams) {
        liveStatuses.set(stream.user_id, true);
      }
    }
  } catch (err) {
    console.error("[lifecycle-sweep] reconcile Helix call failed", err);
    return 0;
  }

  let reconciled = 0;
  for (const [channelId, info] of channelToSession.entries()) {
    const isLive = liveStatuses.get(channelId);
    if (isLive === undefined) continue;
    if (!isLive && !info.offlineAt) {
      // Webhook missed stream.offline — start grace now.
      try {
        await startGracePeriod(info.sessionId);
        reconciled++;
      } catch (err) {
        console.error("[lifecycle-sweep] reconcile startGrace failed", {
          sessionId: info.sessionId,
          err,
        });
      }
    } else if (isLive && info.offlineAt) {
      // Webhook missed stream.online — cancel grace.
      try {
        const { cancelGracePeriod } = await import("./service");
        await cancelGracePeriod(info.sessionId);
        reconciled++;
      } catch (err) {
        console.error("[lifecycle-sweep] reconcile cancelGrace failed", {
          sessionId: info.sessionId,
          err,
        });
      }
    }
  }
  return reconciled;
}

// ---- Dispatcher ----------------------------------------------------------

export async function runLifecycleSweep(): Promise<LifecycleSweepResult> {
  // Order matters slightly:
  //   - Time-based sweeps first so freshly-transitioned sessions show up
  //     in the right state for downstream sweeps in this same tick.
  //   - Reconcile after time-based sweeps so any EventSub-missed offline
  //     gets a fresh grace period (which the next tick's grace sweep
  //     evaluates).
  //   - Wrap-up last so any session that just hit an auto-timeout this
  //     tick has its `state_change → ending` event row written before
  //     wrap-up looks for it.

  const errors = { count: 0 };

  const scheduledToReady = await catching(sweepScheduledToReady, errors);
  const readyToScheduled = await catching(sweepReadyToScheduled, errors);
  // Spec 02 §5 — runs after the eligibility-window sweeps so a
  // session that just became `ready` doesn't double-fire the new
  // open transitions on the same tick (sweepScheduledToReady would
  // have flipped its status away from `scheduled` first).
  // Pre-live announcements (sweepAnnouncements) run BEFORE
  // sweepScheduledOpens so a session whose announce_at hit this
  // tick gets its `pre_live_lobby_opened_at` stamp before the
  // open sweep considers re-announcing at scheduled_at.
  const preLiveAnnounced = await catching(sweepAnnouncements, errors);
  const scheduledOpens =
    (await catchingObj(sweepScheduledOpens, errors)) ??
    { autoOpened: 0, announced: 0 };
  const graceTimeoutsTriggered = await catching(sweepGraceTimeouts, errors);
  const autoTimeoutsTriggered = await catching(sweepAutoTimeouts, errors);
  const inactiveNotifications =
    (await catchingObj(sweepInactiveNotifications, errors)) ??
    { "1h": 0, "24h": 0, "7d": 0 };
  const reconciledStreams = await catching(reconcileStreamStatus, errors);
  const wrapUpsCompleted = await catching(sweepWrapUpCompletion, errors);
  // Recurrence sweep runs AFTER wrap-up so a session that ended this
  // tick is already in `ended` status before we check it for
  // recurring instances. Order matters: same tick can both wrap up
  // a session AND materialize its next instance.
  const recurrencesMaterialized = await catching(sweepRecurrences, errors);
  // gs_streams grace sweep — runs alongside session sweeps. A stream
  // can expire independently of any session (e.g. test session ended
  // hours ago but the broadcast is still tracked), so we walk
  // gs_streams directly. Finalize + per-stream market refund.
  const streamSweep =
    (await catchingObj(sweepStreamEndsAndRefund, errors)) ??
    { finalizedStreams: 0, refundedMarkets: 0, refundedBets: 0 };

  return {
    scheduledToReady,
    readyToScheduled,
    scheduledAutoOpened: scheduledOpens.autoOpened,
    scheduledAnnounced: scheduledOpens.announced,
    preLiveAnnounced,
    recurrencesMaterialized,
    graceTimeoutsTriggered,
    autoTimeoutsTriggered,
    wrapUpsCompleted,
    inactiveNotifications,
    reconciledStreams,
    streamGraceFinalized: streamSweep.finalizedStreams,
    streamGraceRefundedMarkets: streamSweep.refundedMarkets,
    errors: errors.count,
  };
}

async function catching(
  fn: () => Promise<number>,
  errors: { count: number }
): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    errors.count++;
    console.error(`[lifecycle-sweep] ${fn.name} threw`, err);
    return 0;
  }
}

async function catchingObj<T>(
  fn: () => Promise<T>,
  errors: { count: number }
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    errors.count++;
    console.error(`[lifecycle-sweep] ${fn.name} threw`, err);
    return null;
  }
}
