/**
 * Session service — platform-agnostic CRUD + state machine for `gs_sessions`.
 *
 * Phase 1 ships only the data layer. No platform integration (Phase 3), no
 * lifecycle automation / cron / timeouts (Phase 2), no UI (Phase 4). Every
 * method here is callable from API routes today; the same API will be the
 * one Phase 2 wires lifecycle hooks into and Phase 3 wires adapter callbacks
 * into.
 *
 * All writes go through the service-role admin client because writes are
 * trusted (route-level capability checks have already passed) and we
 * need to bypass RLS for cross-user / system writes (e.g. EventSub
 * webhook creating a session for a streamer).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { AUTO_TIMEOUT_MS, GRACE_PERIOD_MS } from "./constants";
import { SESSION_EVENT_TYPES } from "./event-types";
import type {
  ActivationVia,
  EndedVia,
  GsSession,
  SessionConfig,
  SessionFeatureFlags,
  SessionPlatforms,
  SessionStatus,
} from "./types";

// ---- Admin client ---------------------------------------------------------

let _admin: ReturnType<typeof createServiceClient> | null = null;
function admin() {
  if (_admin) return _admin;
  _admin = createServiceClient();
  return _admin;
}

// ---- State transition matrix (architecture doc §4.4) ---------------------

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ["scheduled", "active", "cancelled"],
  scheduled: ["ready", "cancelled"],
  ready: ["active", "scheduled", "cancelled"],
  active: ["ending"],
  ending: ["ended"],
  ended: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(public from: SessionStatus, public to: SessionStatus) {
    super(`Invalid session transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(public id: string) {
    super(`Session not found: ${id}`);
    this.name = "SessionNotFoundError";
  }
}

export function isValidTransition(from: SessionStatus, to: SessionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ---- Slug generation ------------------------------------------------------

const SLUG_NONWORD = /[^a-z0-9]+/g;
const MAX_SLUG_LEN = 48;

function slugify(input: string): string {
  const base = input.toLowerCase().replace(SLUG_NONWORD, "-").replace(/(^-|-$)/g, "");
  return base.slice(0, MAX_SLUG_LEN) || "session";
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  // Try the base slug first, then with a 4-char suffix, retrying up to 5 times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const { data } = await admin()
      .from("gs_sessions")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Fallback — collisions on five tries means a wildly contended base; just
  // append a longer random tail.
  return `${base}-${randomSuffix(8)}`;
}

function randomSuffix(len = 4): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// ---- Public API -----------------------------------------------------------

export interface CreateSessionInput {
  ownerUserId: string;
  name: string;
  description?: string | null;
  platforms?: SessionPlatforms;
  config?: SessionConfig;
  isTestSession?: boolean;
  /** Optional pre-existing slug (mostly for tests). */
  slug?: string;
}

export async function createSession(input: CreateSessionInput): Promise<GsSession> {
  const slug = input.slug ?? (await generateUniqueSlug(input.name));
  const featureFlags: SessionFeatureFlags = input.isTestSession ? { test_session: true } : {};

  const { data, error } = await admin()
    .from("gs_sessions")
    .insert({
      owner_user_id: input.ownerUserId,
      name: input.name,
      slug,
      description: input.description ?? null,
      status: "draft",
      platforms: (input.platforms ?? {}) as unknown as Record<string, unknown>,
      config: (input.config ?? {}) as unknown as Record<string, unknown>,
      tier_required: "pro",
      feature_flags: featureFlags as unknown as Record<string, unknown>,
    })
    .select("*")
    .single();
  if (error) throw error;

  await recordEvent({
    sessionId: (data as { id: string }).id,
    eventType: "state_change",
    actorType: "system",
    actorId: input.ownerUserId,
    payload: { from: null, to: "draft" },
  });

  return data as unknown as GsSession;
}

export async function getSession(id: string): Promise<GsSession | null> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as GsSession | null) ?? null;
}

export async function getSessionBySlug(slug: string): Promise<GsSession | null> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as GsSession | null) ?? null;
}

export async function listSessionsForOwner(
  ownerUserId: string,
  opts: { statuses?: SessionStatus[]; limit?: number } = {}
): Promise<GsSession[]> {
  let query = admin()
    .from("gs_sessions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false });
  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as GsSession[]) ?? [];
}

/**
 * Find the one session in `active` or `ending` status for an owner. The
 * unique partial index on `gs_sessions` enforces "one at a time" — this
 * is the canonical lookup for "is the streamer currently in a session?"
 */
export async function getActiveSessionForOwner(
  ownerUserId: string
): Promise<GsSession | null> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as GsSession | null) ?? null;
}

export type UpdateSessionInput = Partial<{
  name: string;
  description: string | null;
  platforms: SessionPlatforms;
  config: SessionConfig;
  scheduled_at: string | null;
  scheduled_eligibility_window_hours: number;
}>;

export async function updateSessionConfig(
  id: string,
  patch: UpdateSessionInput
): Promise<GsSession> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.platforms !== undefined
        ? { platforms: patch.platforms as unknown as Record<string, unknown> }
        : {}),
      ...(patch.config !== undefined
        ? { config: patch.config as unknown as Record<string, unknown> }
        : {}),
      ...(patch.scheduled_at !== undefined ? { scheduled_at: patch.scheduled_at } : {}),
      ...(patch.scheduled_eligibility_window_hours !== undefined
        ? {
            scheduled_eligibility_window_hours:
              patch.scheduled_eligibility_window_hours,
          }
        : {}),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as GsSession;
}

export interface TransitionInput {
  id: string;
  newStatus: SessionStatus;
  via?: ActivationVia | EndedVia | null;
  /** Used as the actor for the recorded event. */
  actorId?: string;
  actorType?: "streamer" | "mod" | "viewer" | "system";
  /**
   * Phase 2: extra fields merged into the `state_change` event's payload.
   * Used by sweeps + webhook handlers to record `trigger` (e.g.
   * `'eligibility_window_opened'`) or other context that explains why a
   * system-driven transition fired.
   */
  payload?: Record<string, unknown>;
}

export async function transitionSessionStatus(input: TransitionInput): Promise<GsSession> {
  const session = await getSession(input.id);
  if (!session) throw new SessionNotFoundError(input.id);

  if (!isValidTransition(session.status, input.newStatus)) {
    throw new InvalidTransitionError(session.status, input.newStatus);
  }

  const patch: Record<string, unknown> = { status: input.newStatus };
  if (input.newStatus === "active") {
    const activatedAt = new Date();
    patch.activated_at = activatedAt.toISOString();
    if (input.via) patch.activated_via = input.via;
    // Phase 2: pre-compute the 12h auto-timeout horizon so the cron sweep
    // is a simple `auto_timeout_at < now()` check instead of recomputing
    // from activated_at on every tick.
    patch.auto_timeout_at = new Date(activatedAt.getTime() + AUTO_TIMEOUT_MS).toISOString();
  }
  if (input.newStatus === "ended" || input.newStatus === "ending") {
    patch.ended_at = new Date().toISOString();
    if (input.via) patch.ended_via = input.via;
  }

  const { data, error } = await admin()
    .from("gs_sessions")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;

  await recordEvent({
    sessionId: input.id,
    eventType: SESSION_EVENT_TYPES.state_change,
    actorType: input.actorType ?? "system",
    actorId: input.actorId,
    payload: {
      from: session.status,
      to: input.newStatus,
      via: input.via ?? null,
      ...(input.payload ?? {}),
    },
  });

  // Phase 3A: dispatch lifecycle events to platform adapters AFTER the
  // state_change event row is durable. If dispatch fails, the audit log
  // still has the canonical record. Per gs-pro-v1-phase-3a-spec.md §6.3.
  // The lazy import breaks the otherwise-circular dependency
  // (dispatcher → adapter → service.recordEvent).
  const updatedSession = data as unknown as GsSession;
  if (
    input.newStatus === "active" ||
    input.newStatus === "ending" ||
    input.newStatus === "ended"
  ) {
    try {
      const { dispatchLifecycleEvent } = await import("@/lib/adapters/dispatcher");
      const eventType: "session_activated" | "session_ending" | "session_ended" =
        input.newStatus === "active"
          ? "session_activated"
          : input.newStatus === "ending"
            ? "session_ending"
            : "session_ended";
      await dispatchLifecycleEvent({ type: eventType, session: updatedSession });
    } catch (err) {
      // Dispatch errors are audited per-adapter inside the dispatcher
      // itself. This catch is the last-resort safety net for cases where
      // the dispatcher itself throws (DB outage, etc.) — don't roll back
      // the state transition just because the platform notice failed.
      console.error("[transitionSessionStatus] dispatch failed", err);
    }
  }

  return updatedSession;
}

// ---- Phase 2 helpers — grace period + auto-timeout + recap ----------------

/**
 * Called by the Twitch EventSub webhook when stream.offline arrives for a
 * streamer who has an active session. Stamps the offline timestamp + the
 * grace expiry, and writes a `grace_period_started` audit event.
 *
 * Idempotent: if the session already has stream_offline_at set, the values
 * are simply overwritten (no event row written) — the second webhook
 * delivery for the same logical offline doesn't double-record.
 */
export async function startGracePeriod(sessionId: string): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GRACE_PERIOD_MS);

  // Read first to preserve idempotency.
  const session = await getSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  const alreadyInGrace = !!session.stream_offline_at;

  const { error } = await admin()
    .from("gs_sessions")
    .update({
      stream_offline_at: now.toISOString(),
      grace_period_expires_at: expiresAt.toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;

  if (!alreadyInGrace) {
    await recordEvent({
      sessionId,
      eventType: SESSION_EVENT_TYPES.grace_period_started,
      actorType: "system",
      actorId: "webhook:stream.offline",
      payload: {
        offline_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
    });
  }
}

/**
 * Called by the Twitch EventSub webhook when stream.online arrives for a
 * streamer whose active session is in grace. Clears the grace fields and
 * writes a `grace_period_cancelled` audit event.
 *
 * Idempotent: if the session isn't in grace, this is a no-op.
 */
export async function cancelGracePeriod(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  if (!session.stream_offline_at) return;

  const { error } = await admin()
    .from("gs_sessions")
    .update({
      stream_offline_at: null,
      grace_period_expires_at: null,
      // Reset the inactive-notification ledger — the streamer came back,
      // future offline-then-online cycles get a fresh notification budget.
      inactive_notified_at: {},
    })
    .eq("id", sessionId);
  if (error) throw error;

  await recordEvent({
    sessionId,
    eventType: SESSION_EVENT_TYPES.grace_period_cancelled,
    actorType: "system",
    actorId: "webhook:stream.online",
    payload: {},
  });
}

/**
 * Updates `inactive_notified_at[level]` to mark a notification as sent.
 * Called by the inactive-cascade sweep.
 */
export async function markInactiveNotified(
  sessionId: string,
  level: "1h" | "24h" | "7d"
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  const next = {
    ...(session.inactive_notified_at ?? {}),
    [level]: new Date().toISOString(),
  };
  const { error } = await admin()
    .from("gs_sessions")
    .update({ inactive_notified_at: next })
    .eq("id", sessionId);
  if (error) throw error;

  await recordEvent({
    sessionId,
    eventType: SESSION_EVENT_TYPES.inactive_notification_sent,
    actorType: "system",
    actorId: "cron:lifecycle-sweep",
    payload: { level },
  });
}

/**
 * Compute the recap payload for a session that just transitioned from
 * `ending` to `ended`. Pulls participant + event data from the audit log
 * so the payload is durable — Phase 3 adapters consume it without needing
 * Phase 2 to know they exist.
 */
export interface RecapPayload {
  session_id: string;
  session_name: string;
  session_slug: string;
  activated_at: string | null;
  ended_at: string;
  duration_seconds: number;
  participant_count: number;
  shuffle_count: number;
  broadcasters: string[];
  final_combos: Array<{
    display_name: string;
    platform: string;
    combo: Record<string, unknown> | null;
  }>;
}

export async function computeRecapPayload(sessionId: string): Promise<RecapPayload> {
  const session = await getSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);

  const [eventsRes, participantsRes] = await Promise.all([
    admin()
      .from("session_events")
      .select("event_type, payload, created_at")
      .eq("session_id", sessionId),
    admin()
      .from("session_participants")
      .select("platform, platform_user_id, display_name, is_broadcaster, current_combo")
      .eq("session_id", sessionId),
  ]);

  const events = (eventsRes.data as Array<{ event_type: string; payload: Record<string, unknown>; created_at: string }> | null) ?? [];
  const participants = (participantsRes.data as Array<{
    platform: string;
    platform_user_id: string;
    display_name: string | null;
    is_broadcaster: boolean;
    current_combo: Record<string, unknown> | null;
  }> | null) ?? [];

  const endedAt = new Date();
  const activatedMs = session.activated_at ? Date.parse(session.activated_at) : NaN;
  const durationSeconds = Number.isFinite(activatedMs)
    ? Math.max(0, Math.floor((endedAt.getTime() - activatedMs) / 1000))
    : 0;

  return {
    session_id: session.id,
    session_name: session.name,
    session_slug: session.slug,
    activated_at: session.activated_at,
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
    participant_count: participants.length,
    shuffle_count: events.filter((e) => e.event_type === SESSION_EVENT_TYPES.shuffle).length,
    broadcasters: participants
      .filter((p) => p.is_broadcaster)
      .map((p) => p.display_name ?? p.platform_user_id),
    final_combos: participants.map((p) => ({
      display_name: p.display_name ?? p.platform_user_id,
      platform: p.platform,
      combo: p.current_combo,
    })),
  };
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await admin().from("gs_sessions").delete().eq("id", id);
  if (error) throw error;
}

// ---- Events ---------------------------------------------------------------

export interface RecordEventInput {
  sessionId: string;
  eventType: string;
  actorType?: "streamer" | "mod" | "viewer" | "system";
  actorId?: string;
  payload?: Record<string, unknown>;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  const { error } = await admin()
    .from("session_events")
    .insert({
      session_id: input.sessionId,
      event_type: input.eventType,
      actor_type: input.actorType ?? null,
      actor_id: input.actorId ?? null,
      payload: input.payload ?? {},
    });
  if (error) throw error;
}
