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

// ---- Sweep result types --------------------------------------------------

export interface InactiveNotificationCounts {
  "1h": number;
  "24h": number;
  "7d": number;
}

export interface LifecycleSweepResult {
  scheduledToReady: number;
  readyToScheduled: number;
  graceTimeoutsTriggered: number;
  autoTimeoutsTriggered: number;
  wrapUpsCompleted: number;
  inactiveNotifications: InactiveNotificationCounts;
  reconciledStreams: number;
  errors: number;
}

function admin() {
  return createServiceClient();
}

// ---- Helpers --------------------------------------------------------------

const SESSION_COLUMNS =
  "id, owner_user_id, name, slug, status, scheduled_at, scheduled_eligibility_window_hours, activated_at, activated_via, ended_at, ended_via, platforms, config, tier_required, parent_session_id, feature_flags, stream_offline_at, grace_period_expires_at, inactive_notified_at, auto_timeout_at, created_at, updated_at";

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
    return true;
  } catch (err) {
    console.error("[lifecycle-sweep] transition failed", {
      sessionId,
      to,
      label,
      err: err instanceof Error ? err.message : err,
    });
    return false;
  }
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
    const enteredAtMs = await getEnteredEndingAtMs(session.id);
    if (enteredAtMs === null) continue;
    if (nowMs - enteredAtMs < WRAP_UP_DURATION_MS) continue;

    // Compute the recap and write the recap_ready event.
    try {
      const recap = await computeRecapPayload(session.id);
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
  const graceTimeoutsTriggered = await catching(sweepGraceTimeouts, errors);
  const autoTimeoutsTriggered = await catching(sweepAutoTimeouts, errors);
  const inactiveNotifications =
    (await catchingObj(sweepInactiveNotifications, errors)) ??
    { "1h": 0, "24h": 0, "7d": 0 };
  const reconciledStreams = await catching(reconcileStreamStatus, errors);
  const wrapUpsCompleted = await catching(sweepWrapUpCompletion, errors);

  return {
    scheduledToReady,
    readyToScheduled,
    graceTimeoutsTriggered,
    autoTimeoutsTriggered,
    wrapUpsCompleted,
    inactiveNotifications,
    reconciledStreams,
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
