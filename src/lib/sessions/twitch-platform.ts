/**
 * Twitch-platform session helpers — the data-layer half of what was the
 * Phase 1/2 bridge (`twitch-bridge.ts`, now deleted in Phase 3A). These
 * helpers translate between the generic `gs_sessions` /
 * `session_participants` / `session_events` tables and the Twitch-shape
 * the chat command handlers + webhook still want to read.
 *
 * The platform-IO half (chat send, announce, lifecycle hooks) moved to
 * `src/lib/adapters/twitch/adapter.ts`. This file is purely DB queries +
 * mutations + audit; it never calls Helix.
 *
 * Phase 3A gap fixes baked in:
 *
 *   - Gap 1 — `endAllTwitchSessionsForUser` walks rows and emits per-row
 *     `state_change` events + dispatches `session_ended` to adapters.
 *   - Gap 2 — `createTwitchBoundSession` and `endTwitchBoundSession`
 *     route through `createSession` / `transitionSessionStatus` so the
 *     audit log + adapter dispatch fire uniformly.
 *   - Gap 5 — participant insert/leave helpers emit
 *     `participant_join` / `participant_leave` events.
 *
 * Per gs-pro-v1-phase-3a-spec.md §§5.5, 7.1 + the audit notes' approved
 * gap dispositions.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_EVENT_TYPES } from "./event-types";
import type { GsSession } from "./types";
import {
  createSession,
  recordEvent,
  transitionSessionStatus,
} from "./service";

// ---- Twitch-shaped row types (consumer-facing API) -----------------------

export interface TwitchSessionRow {
  id: string;
  user_id: string;
  randomizer_slug: string | null;
  twitch_category_id: string | null;
  status: "active" | "ended" | "test";
  started_at: string;
  ended_at: string | null;
}

export interface TwitchParticipantRow {
  id: string;
  session_id: string;
  twitch_user_id: string;
  twitch_login: string;
  twitch_display_name: string;
  joined_at: string;
  left_at: string | null;
  left_reason: string | null;
  current_combo: Record<string, unknown> | null;
  current_combo_at: string | null;
  kick_until: string | null;
  rejoin_eligible_at: string | null;
}

export interface TwitchShuffleEventRow {
  id: string;
  session_id: string;
  twitch_user_id: string;
  twitch_display_name: string;
  trigger_type: string;
  combo: Record<string, unknown> | null;
  is_broadcaster: boolean;
  created_at: string;
}

// ---- Internal DB row shapes ---------------------------------------------

interface GsSessionDbRow {
  id: string;
  owner_user_id: string;
  status: string;
  config?: { game?: string | null } | null;
  platforms?: { streaming?: { category_id?: string | null } | null } | null;
  feature_flags?: { test_session?: boolean } | null;
  activated_at: string | null;
  created_at: string;
  ended_at: string | null;
}

interface ParticipantDbRow {
  id: string;
  session_id: string;
  platform: string;
  platform_user_id: string;
  display_name: string | null;
  is_broadcaster: boolean;
  joined_at: string;
  left_at: string | null;
  left_reason: string | null;
  current_combo: Record<string, unknown> | null;
  current_combo_at: string | null;
  kick_until: string | null;
  rejoin_eligible_at: string | null;
  metadata?: { twitch_login?: string } | null;
}

interface SessionEventDbRow {
  id: string;
  session_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// ---- Mappers ------------------------------------------------------------

function gsSessionToTwitchView(row: GsSessionDbRow): TwitchSessionRow {
  // Map status: gs_sessions has 'draft' | 'scheduled' | 'ready' | 'active'
  // | 'ending' | 'ended' | 'cancelled'. The Twitch-aware code only cares
  // about 'active' | 'ended' | 'test', and 'test' is derived from
  // feature_flags.test_session. Other lifecycle states project to 'ended'
  // because Twitch consumers don't differentiate (verified during the
  // Phase 3A audit per gap 3 disposition).
  let status: "active" | "ended" | "test" = "ended";
  if (row.status === "active" || row.status === "ending") status = "active";
  if (row.feature_flags?.test_session && status === "active") status = "test";
  return {
    id: row.id,
    user_id: row.owner_user_id,
    randomizer_slug: row.config?.game ?? null,
    twitch_category_id: row.platforms?.streaming?.category_id ?? null,
    status,
    started_at: row.activated_at ?? row.created_at,
    ended_at: row.ended_at,
  };
}

function participantToTwitchView(row: ParticipantDbRow): TwitchParticipantRow {
  return {
    id: row.id,
    session_id: row.session_id,
    twitch_user_id: row.platform_user_id,
    twitch_login: row.metadata?.twitch_login ?? row.display_name ?? row.platform_user_id,
    twitch_display_name: row.display_name ?? row.platform_user_id,
    joined_at: row.joined_at,
    left_at: row.left_at,
    left_reason: row.left_reason,
    current_combo: row.current_combo,
    current_combo_at: row.current_combo_at,
    kick_until: row.kick_until,
    rejoin_eligible_at: row.rejoin_eligible_at,
  };
}

function eventToShuffleView(row: SessionEventDbRow): TwitchShuffleEventRow {
  const p = row.payload ?? {};
  return {
    id: row.id,
    session_id: row.session_id,
    twitch_user_id: (p.twitch_user_id as string) ?? "",
    twitch_display_name: (p.twitch_display_name as string) ?? "",
    trigger_type: (p.trigger_type as string) ?? "chat_command",
    combo: (p.combo as Record<string, unknown> | null) ?? null,
    is_broadcaster: !!p.is_broadcaster,
    created_at: row.created_at,
  };
}

const SESSION_COLUMNS =
  "id, owner_user_id, status, config, platforms, feature_flags, activated_at, created_at, ended_at";

const PARTICIPANT_COLUMNS =
  "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, left_reason, current_combo, current_combo_at, kick_until, rejoin_eligible_at, metadata";

function admin(client?: SupabaseClient) {
  return client ?? createServiceClient();
}

// ---- Session helpers ----------------------------------------------------

/**
 * Find the most recent Twitch session for a user matching one of the
 * requested status filters.
 */
export async function findTwitchSessionForUser(
  userId: string,
  statuses: ("active" | "ended" | "test")[],
  client?: SupabaseClient
): Promise<TwitchSessionRow | null> {
  const want = {
    active: statuses.includes("active"),
    ended: statuses.includes("ended"),
    test: statuses.includes("test"),
  };
  const dbStatuses: string[] = [];
  if (want.active || want.test) dbStatuses.push("active", "ending");
  if (want.ended) dbStatuses.push("ended");
  if (dbStatuses.length === 0) return null;

  const { data } = await admin(client)
    .from("gs_sessions")
    .select(SESSION_COLUMNS)
    .eq("owner_user_id", userId)
    .in("status", dbStatuses)
    .order("activated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);

  for (const row of (data ?? []) as GsSessionDbRow[]) {
    const view = gsSessionToTwitchView(row);
    if (view.status === "test" && !want.test) continue;
    if (view.status === "active" && !want.active) continue;
    if (view.status === "ended" && !want.ended) continue;
    return view;
  }
  return null;
}

/** List open (active or ending) Twitch sessions for a user. */
export async function listOpenTwitchSessionsForUser(
  userId: string,
  client?: SupabaseClient
): Promise<TwitchSessionRow[]> {
  const { data } = await admin(client)
    .from("gs_sessions")
    .select(SESSION_COLUMNS)
    .eq("owner_user_id", userId)
    .in("status", ["active", "ending"]);
  return ((data ?? []) as GsSessionDbRow[]).map(gsSessionToTwitchView);
}

/**
 * Create a Twitch-bound session through the session service. Goes through
 * `createSession` (status='draft') then `transitionSessionStatus(active)`,
 * so the audit log + adapter dispatch fire uniformly with non-Twitch
 * paths. Phase 3A Gap 2 fix.
 */
export async function createTwitchBoundSession(args: {
  userId: string;
  randomizerSlug: string | null;
  twitchCategoryId: string | null;
  isTest?: boolean;
}): Promise<TwitchSessionRow | null> {
  const name = args.isTest
    ? "Test Session"
    : args.randomizerSlug
      ? `Twitch Session — ${args.randomizerSlug}`
      : "Twitch Session";
  const platforms: { streaming: { type: "twitch"; category_id?: string } } = {
    streaming: { type: "twitch" },
  };
  if (args.twitchCategoryId) platforms.streaming.category_id = args.twitchCategoryId;
  const config: Record<string, unknown> = {};
  if (args.randomizerSlug) config.game = args.randomizerSlug;

  let session: GsSession;
  try {
    session = await createSession({
      ownerUserId: args.userId,
      name,
      platforms,
      config,
      isTestSession: !!args.isTest,
    });
  } catch (err) {
    console.error("[twitch-platform] createSession failed:", err);
    return null;
  }

  try {
    session = await transitionSessionStatus({
      id: session.id,
      newStatus: "active",
      via: args.isTest ? "manual" : "auto_prompt",
      actorType: "system",
      actorId: args.isTest ? "test-session-endpoint" : "webhook:stream.online",
      payload: { source: args.isTest ? "test" : "stream.online" },
    });
  } catch (err) {
    console.error("[twitch-platform] activation failed:", err);
    return null;
  }

  return gsSessionToTwitchView(session as unknown as GsSessionDbRow);
}

/**
 * End a Twitch session through the service. Transitions from `active` to
 * `ending`; the lifecycle sweep wraps it up to `ended` after the wrap-up
 * duration. Phase 3A Gap 2 fix.
 *
 * The 60-second wrap-up window means callers can't expect immediate
 * disappearance — the dashboard should poll. UX trade-off accepted:
 * audit + adapter dispatch fire uniformly.
 */
export async function endTwitchBoundSession(
  sessionId: string,
  via: "manual" | "system" | "auto_timeout" | "stream_ended_grace" = "manual"
): Promise<void> {
  try {
    await transitionSessionStatus({
      id: sessionId,
      newStatus: "ending",
      via,
      actorType: "system",
      actorId: "twitch-platform:endTwitchBoundSession",
    });
  } catch (err) {
    // If the session is already past 'active' (e.g. another concurrent end
    // beat us), that's fine. Other errors are logged but don't crash.
    console.error("[twitch-platform] endTwitchBoundSession failed:", err);
  }
}

/**
 * End every open (active or ending) session for a user. Used by the
 * stream.online webhook to clean up stragglers from a previous stream
 * before opening a new session. Phase 3A Gap 1 fix: walks rows + emits
 * per-row state_change events + dispatches session_ended to adapters.
 *
 * **Direct DB update vs service routing.** This path force-ends sessions
 * to status='ended' (skipping the wrap-up cycle) because the
 * one-active-session-per-owner unique partial index would otherwise
 * block the new session creation in the same webhook tick. The state
 * transition `active → ended` is invalid per the state machine, so we
 * bypass the service. The audit trail + adapter notification still fire,
 * just emitted manually here.
 */
export async function endAllTwitchSessionsForUser(
  userId: string,
  client?: SupabaseClient
): Promise<void> {
  // Read the rows we're about to end so we can emit per-row events with
  // the correct `from` status.
  const { data: stragglers } = await admin(client)
    .from("gs_sessions")
    .select("id, status")
    .eq("owner_user_id", userId)
    .in("status", ["active", "ending"]);

  if (!stragglers || stragglers.length === 0) return;

  await admin(client)
    .from("gs_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      ended_via: "system",
    })
    .eq("owner_user_id", userId)
    .in("status", ["active", "ending"]);

  for (const row of stragglers as Array<{ id: string; status: string }>) {
    await recordEvent({
      sessionId: row.id,
      eventType: SESSION_EVENT_TYPES.state_change,
      actorType: "system",
      actorId: "twitch-platform:endAllForUser",
      payload: {
        from: row.status,
        to: "ended",
        via: "system",
        reason: "straggler_cleanup",
      },
    });

    // Best-effort adapter notification. Skip if dispatch errors — the
    // audit row above is the durable record.
    try {
      const fullSession = await fetchFullSession(row.id, client);
      if (fullSession) {
        const { dispatchLifecycleEvent } = await import("@/lib/adapters/dispatcher");
        await dispatchLifecycleEvent({
          type: "session_ended",
          session: fullSession,
        });
      }
    } catch (err) {
      console.error(
        `[twitch-platform] straggler dispatch failed for ${row.id}:`,
        err
      );
    }
  }
}

/** Update a session's category + slug after a channel.update event. */
export async function updateTwitchSessionCategory(
  sessionId: string,
  randomizerSlug: string | null,
  twitchCategoryId: string | null,
  client?: SupabaseClient
): Promise<void> {
  const { data: current } = await admin(client)
    .from("gs_sessions")
    .select("config, platforms")
    .eq("id", sessionId)
    .maybeSingle();
  const baseConfig = (current?.config as Record<string, unknown> | null) ?? {};
  const basePlatforms = (current?.platforms as {
    streaming?: Record<string, unknown>;
  } | null) ?? {};
  const newConfig = { ...baseConfig, game: randomizerSlug };
  const newPlatforms = {
    ...basePlatforms,
    streaming: {
      ...(basePlatforms.streaming ?? {}),
      type: "twitch" as const,
      category_id: twitchCategoryId,
    },
  };
  await admin(client)
    .from("gs_sessions")
    .update({ config: newConfig, platforms: newPlatforms })
    .eq("id", sessionId);
}

async function fetchFullSession(
  sessionId: string,
  client?: SupabaseClient
): Promise<GsSession | null> {
  const { data } = await admin(client)
    .from("gs_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as unknown as GsSession | null) ?? null;
}

// ---- Participant helpers ------------------------------------------------

export async function findTwitchParticipant(args: {
  sessionId: string;
  twitchUserId: string;
  client?: SupabaseClient;
}): Promise<TwitchParticipantRow | null> {
  const { data } = await admin(args.client)
    .from("session_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("session_id", args.sessionId)
    .eq("platform", "twitch")
    .eq("platform_user_id", args.twitchUserId)
    .maybeSingle();
  return data ? participantToTwitchView(data as ParticipantDbRow) : null;
}

export interface UpsertTwitchParticipantInput {
  sessionId: string;
  twitchUserId: string;
  twitchLogin: string;
  twitchDisplayName: string;
  isBroadcaster?: boolean;
  client?: SupabaseClient;
}

/**
 * Insert a new Twitch participant + emit a `participant_join` event.
 * Phase 3A Gap 5 fix.
 */
export async function insertTwitchParticipant(
  input: UpsertTwitchParticipantInput & {
    currentCombo?: Record<string, unknown>;
    currentComboAt?: string;
  }
): Promise<TwitchParticipantRow | null> {
  const { data } = await admin(input.client)
    .from("session_participants")
    .insert({
      session_id: input.sessionId,
      platform: "twitch",
      platform_user_id: input.twitchUserId,
      display_name: input.twitchDisplayName,
      is_broadcaster: !!input.isBroadcaster,
      current_combo: input.currentCombo ?? null,
      current_combo_at: input.currentComboAt ?? null,
      metadata: { twitch_login: input.twitchLogin },
    })
    .select(PARTICIPANT_COLUMNS)
    .maybeSingle();
  if (!data) return null;

  await recordEvent({
    sessionId: input.sessionId,
    eventType: SESSION_EVENT_TYPES.participant_join,
    actorType: "viewer",
    actorId: input.twitchUserId,
    payload: {
      platform: "twitch",
      platform_user_id: input.twitchUserId,
      display_name: input.twitchDisplayName,
      is_broadcaster: !!input.isBroadcaster,
    },
  });

  return participantToTwitchView(data as ParticipantDbRow);
}

/**
 * Patch a Twitch participant by id. Twitch-shape patch keys are
 * translated to the generic columns (`twitch_login` →
 * `metadata.twitch_login`, `twitch_display_name` → `display_name`).
 *
 * Emits a `participant_leave` event when `left_at` transitions from null
 * to a value. Phase 3A Gap 5 fix.
 */
export async function patchTwitchParticipantById(
  id: string,
  patch: Partial<{
    left_at: string | null;
    left_reason: string | null;
    rejoin_eligible_at: string | null;
    kick_until: string | null;
    twitch_login: string;
    twitch_display_name: string;
    current_combo: Record<string, unknown> | null;
    current_combo_at: string | null;
  }>,
  client?: SupabaseClient
): Promise<void> {
  const update: Record<string, unknown> = {};
  if ("left_at" in patch) update.left_at = patch.left_at;
  if ("left_reason" in patch) update.left_reason = patch.left_reason;
  if ("rejoin_eligible_at" in patch) update.rejoin_eligible_at = patch.rejoin_eligible_at;
  if ("kick_until" in patch) update.kick_until = patch.kick_until;
  if ("current_combo" in patch) update.current_combo = patch.current_combo;
  if ("current_combo_at" in patch) update.current_combo_at = patch.current_combo_at;
  if ("twitch_display_name" in patch) update.display_name = patch.twitch_display_name;
  if ("twitch_login" in patch) {
    const { data: existing } = await admin(client)
      .from("session_participants")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const meta = (existing?.metadata as Record<string, unknown> | null) ?? {};
    update.metadata = { ...meta, twitch_login: patch.twitch_login };
  }
  if (Object.keys(update).length === 0) return;

  // Detect a leave transition for the Gap 5 audit event. We need the prior
  // left_at to know if this is a no-op overwrite vs an actual leave.
  let emitLeaveEvent = false;
  let leaveContext: {
    sessionId: string;
    twitchUserId: string;
    displayName: string;
    leftReason: string | null;
  } | null = null;
  if ("left_at" in patch && patch.left_at) {
    const { data: prior } = await admin(client)
      .from("session_participants")
      .select("session_id, platform, platform_user_id, display_name, left_at")
      .eq("id", id)
      .maybeSingle();
    if (prior && prior.platform === "twitch" && !prior.left_at) {
      emitLeaveEvent = true;
      leaveContext = {
        sessionId: prior.session_id as string,
        twitchUserId: prior.platform_user_id as string,
        displayName: (prior.display_name as string | null) ?? "",
        leftReason: (patch.left_reason ?? null) as string | null,
      };
    }
  }

  await admin(client).from("session_participants").update(update).eq("id", id);

  if (emitLeaveEvent && leaveContext) {
    await recordEvent({
      sessionId: leaveContext.sessionId,
      eventType: SESSION_EVENT_TYPES.participant_leave,
      actorType: "viewer",
      actorId: leaveContext.twitchUserId,
      payload: {
        platform: "twitch",
        platform_user_id: leaveContext.twitchUserId,
        display_name: leaveContext.displayName,
        left_reason: leaveContext.leftReason,
      },
    });
  }
}

/**
 * Mark all active participants in a list of sessions as left, except the
 * given Twitch user. Used to clear the lobby on category switch.
 *
 * Emits per-row `participant_leave` events. Phase 3A Gap 5 fix.
 */
export async function leaveAllTwitchParticipantsExcept(
  sessionIds: string[],
  exceptTwitchUserId: string,
  reason: string,
  client?: SupabaseClient
): Promise<void> {
  if (sessionIds.length === 0) return;

  // Read the rows we're about to mark as left so we can emit
  // participant_leave events with the right metadata.
  const { data: leavers } = await admin(client)
    .from("session_participants")
    .select("id, session_id, platform_user_id, display_name")
    .in("session_id", sessionIds)
    .eq("platform", "twitch")
    .is("left_at", null)
    .neq("platform_user_id", exceptTwitchUserId);

  await admin(client)
    .from("session_participants")
    .update({ left_at: new Date().toISOString(), left_reason: reason })
    .in("session_id", sessionIds)
    .eq("platform", "twitch")
    .is("left_at", null)
    .neq("platform_user_id", exceptTwitchUserId);

  for (const row of (leavers ?? []) as Array<{
    id: string;
    session_id: string;
    platform_user_id: string;
    display_name: string | null;
  }>) {
    await recordEvent({
      sessionId: row.session_id,
      eventType: SESSION_EVENT_TYPES.participant_leave,
      actorType: "viewer",
      actorId: row.platform_user_id,
      payload: {
        platform: "twitch",
        platform_user_id: row.platform_user_id,
        display_name: row.display_name ?? "",
        left_reason: reason,
      },
    });
  }
}

export async function countActiveTwitchParticipants(
  sessionId: string,
  client?: SupabaseClient
): Promise<number> {
  const { count } = await admin(client)
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("platform", "twitch")
    .is("left_at", null);
  return count ?? 0;
}

export async function listActiveTwitchParticipants(
  sessionId: string,
  client?: SupabaseClient
): Promise<TwitchParticipantRow[]> {
  const { data } = await admin(client)
    .from("session_participants")
    .select(PARTICIPANT_COLUMNS)
    .eq("session_id", sessionId)
    .eq("platform", "twitch")
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  return ((data ?? []) as ParticipantDbRow[]).map(participantToTwitchView);
}

// ---- Shuffle event helpers -----------------------------------------------

export async function recordTwitchShuffleEvent(args: {
  sessionId: string;
  twitchUserId: string;
  twitchDisplayName: string;
  triggerType: string;
  combo: Record<string, unknown>;
  isBroadcaster: boolean;
  client?: SupabaseClient;
}): Promise<void> {
  await admin(args.client)
    .from("session_events")
    .insert({
      session_id: args.sessionId,
      event_type: SESSION_EVENT_TYPES.shuffle,
      actor_type: args.isBroadcaster ? "streamer" : "viewer",
      actor_id: args.twitchUserId,
      payload: {
        platform: "twitch",
        twitch_user_id: args.twitchUserId,
        twitch_display_name: args.twitchDisplayName,
        trigger_type: args.triggerType,
        combo: args.combo,
        is_broadcaster: args.isBroadcaster,
      },
    });
}

export async function getLatestTwitchShuffleEvent(
  sessionId: string,
  opts: { broadcasterOnly?: boolean; since?: string | null } = {},
  client?: SupabaseClient
): Promise<TwitchShuffleEventRow | null> {
  let query = admin(client)
    .from("session_events")
    .select("id, session_id, event_type, payload, created_at")
    .eq("session_id", sessionId)
    .eq("event_type", SESSION_EVENT_TYPES.shuffle)
    .order("created_at", { ascending: false })
    .limit(1);
  if (opts.broadcasterOnly) {
    query = query.eq("actor_type", "streamer");
  }
  if (opts.since) {
    query = query.gt("created_at", opts.since);
  }
  const { data } = await query.maybeSingle();
  return data ? eventToShuffleView(data as SessionEventDbRow) : null;
}

export async function listTwitchShuffleEvents(
  sessionId: string,
  limit = 10,
  client?: SupabaseClient
): Promise<TwitchShuffleEventRow[]> {
  const { data } = await admin(client)
    .from("session_events")
    .select("id, session_id, event_type, payload, created_at")
    .eq("session_id", sessionId)
    .eq("event_type", SESSION_EVENT_TYPES.shuffle)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as SessionEventDbRow[]).map(eventToShuffleView);
}
