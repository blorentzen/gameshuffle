/**
 * Twitch ↔ generic session bridge.
 *
 * The old code spoke directly to `twitch_sessions` / `twitch_session_participants`
 * / `twitch_shuffle_events` with Twitch-specific column shapes. Phase 1
 * generalizes those tables. To keep call-site churn manageable, this
 * bridge exposes Twitch-flavored helpers that translate to/from the new
 * generic shape:
 *
 *   - `gs_sessions` rows store `randomizer_slug` inside `config.game`,
 *     `twitch_category_id` inside `platforms.streaming.category_id`, and
 *     ownership in `owner_user_id`.
 *   - `session_participants` keys by `(session_id, platform='twitch',
 *     platform_user_id)` and stores Twitch login in `metadata.twitch_login`.
 *   - `session_events` represents legacy shuffles as
 *     `event_type='shuffle'`, with the original Twitch fields preserved
 *     in `payload`.
 *
 * Phase 3 (`PlatformAdapter`) will fold these helpers into the
 * `TwitchAdapter` class. Until then they're called from the same routes
 * that called the raw queries before.
 */

import { createTwitchAdminClient } from "@/lib/twitch/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---- Twitch-shaped row types (what call sites already expect) ------------

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

// ---- Row mappers ---------------------------------------------------------

interface GsSessionDbRow {
  id: string;
  owner_user_id: string;
  status: string;
  config?: { game?: string | null } | null;
  platforms?: {
    streaming?: { category_id?: string | null } | null;
  } | null;
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

function gsSessionToTwitchView(row: GsSessionDbRow): TwitchSessionRow {
  // Map status: gs_sessions has 'draft' | 'scheduled' | 'ready' | 'active' |
  // 'ending' | 'ended' | 'cancelled'. The Twitch-aware code only ever needs
  // 'active' | 'ended' | 'test', and 'test' is now derived from the feature
  // flag rather than a status value.
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

const SESSION_COLUMNS =
  "id, owner_user_id, status, config, platforms, feature_flags, activated_at, created_at, ended_at";

const PARTICIPANT_COLUMNS =
  "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, left_reason, current_combo, current_combo_at, kick_until, rejoin_eligible_at, metadata";

function admin(client?: SupabaseClient) {
  return client ?? createTwitchAdminClient();
}

// ---- Session helpers ------------------------------------------------------

/**
 * Find the Twitch session for a user with one of the requested statuses.
 * Returns the most recent (active first, then test).
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
    // If 'test' was not requested, skip test rows; symmetrically for non-test.
    if (view.status === "test" && !want.test) continue;
    if (view.status === "active" && !want.active) continue;
    if (view.status === "ended" && !want.ended) continue;
    return view;
  }
  return null;
}

/** Read a Twitch session by id. */
export async function getTwitchSession(
  id: string,
  client?: SupabaseClient
): Promise<TwitchSessionRow | null> {
  const { data } = await admin(client)
    .from("gs_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return data ? gsSessionToTwitchView(data as GsSessionDbRow) : null;
}

/**
 * Create a Twitch-bound session. Sets status='active' immediately (the
 * EventSub `stream.online` path) or 'active' with `test_session` flag (the
 * test-session button path).
 */
export async function createTwitchSession(args: {
  userId: string;
  randomizerSlug: string | null;
  twitchCategoryId: string | null;
  isTest?: boolean;
  client?: SupabaseClient;
}): Promise<TwitchSessionRow | null> {
  const name = args.isTest
    ? "Test Session"
    : args.randomizerSlug
      ? `Twitch Session — ${args.randomizerSlug}`
      : "Twitch Session";
  const slug = `twitch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const platforms: { streaming: { type: "twitch"; category_id?: string } } = {
    streaming: { type: "twitch" },
  };
  if (args.twitchCategoryId) platforms.streaming.category_id = args.twitchCategoryId;
  const config: Record<string, unknown> = {};
  if (args.randomizerSlug) config.game = args.randomizerSlug;

  const featureFlags = args.isTest ? { test_session: true } : {};

  const { data, error } = await admin(args.client)
    .from("gs_sessions")
    .insert({
      owner_user_id: args.userId,
      name,
      slug,
      status: "active",
      activated_at: new Date().toISOString(),
      activated_via: args.isTest ? "manual" : "auto_prompt",
      platforms,
      config,
      tier_required: "pro",
      feature_flags: featureFlags,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[twitch-bridge] createTwitchSession failed:", error);
    return null;
  }
  return gsSessionToTwitchView(data as GsSessionDbRow);
}

/** End a session by id. */
export async function endTwitchSession(
  id: string,
  client?: SupabaseClient
): Promise<void> {
  await admin(client)
    .from("gs_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      ended_via: "system",
    })
    .eq("id", id);
}

/** End all open (active + test) Twitch sessions for a user. Used when a new session opens to clear stragglers. */
export async function endAllTwitchSessionsForUser(
  userId: string,
  client?: SupabaseClient
): Promise<void> {
  await admin(client)
    .from("gs_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      ended_via: "system",
    })
    .eq("owner_user_id", userId)
    .in("status", ["active", "ending"]);
}

/** Update a session's category + slug (channel.update event). */
export async function updateTwitchSessionCategory(
  sessionId: string,
  randomizerSlug: string | null,
  twitchCategoryId: string | null,
  client?: SupabaseClient
): Promise<void> {
  // Read current row to merge JSONB fields.
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

/** List open (active or test) Twitch sessions for a user. */
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

// ---- Participant helpers --------------------------------------------------

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

/** Insert a Twitch participant. Caller should ensure no duplicate. */
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
  return data ? participantToTwitchView(data as ParticipantDbRow) : null;
}

/** Patch a participant by id. Twitch-shaped patch keys are translated. */
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
    // Read existing metadata to merge twitch_login.
    const { data: existing } = await admin(client)
      .from("session_participants")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const meta = (existing?.metadata as Record<string, unknown> | null) ?? {};
    update.metadata = { ...meta, twitch_login: patch.twitch_login };
  }
  if (Object.keys(update).length === 0) return;
  await admin(client).from("session_participants").update(update).eq("id", id);
}

/** Mark all active participants in a list of sessions as left, except a specific Twitch user. */
export async function leaveAllTwitchParticipantsExcept(
  sessionIds: string[],
  exceptTwitchUserId: string,
  reason: string,
  client?: SupabaseClient
): Promise<void> {
  if (sessionIds.length === 0) return;
  await admin(client)
    .from("session_participants")
    .update({ left_at: new Date().toISOString(), left_reason: reason })
    .in("session_id", sessionIds)
    .eq("platform", "twitch")
    .is("left_at", null)
    .neq("platform_user_id", exceptTwitchUserId);
}

/** Count active participants for a session. */
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

/** List active participants for a session. */
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

// ---- Shuffle event helpers ------------------------------------------------

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

interface SessionEventDbRow {
  id: string;
  session_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
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
      event_type: "shuffle",
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
    .eq("event_type", "shuffle")
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
    .eq("event_type", "shuffle")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as SessionEventDbRow[]).map(eventToShuffleView);
}
