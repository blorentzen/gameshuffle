"use server";

/**
 * Server Actions for /hub/sessions/[slug] state transitions.
 *
 * Per gs-pro-v1-phase-4a-spec.md §§5.5, 6. Each action verifies
 * ownership + capability, then routes through the session service so
 * the audit log + adapter dispatch fire uniformly.
 *
 * Actions return { ok, error?, redirectTo? } so the client component can
 * surface errors inline + navigate after a restart.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  createSession,
  getSessionBySlug,
  transitionSessionStatus,
} from "@/lib/sessions/service";
import { ensureBroadcasterSeatedForTwitchSession } from "@/lib/sessions/twitch-platform";
import {
  hasCapability,
  normalizeTier,
  type CapabilityUser,
} from "@/lib/subscription";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";

export interface ActionResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

async function resolveAuthorizedUser(): Promise<
  | { ok: true; userId: string; capabilityUser: CapabilityUser }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  const rawTier = normalizeTier(
    (profile?.subscription_tier as string | null) ?? null
  );

  const impersonation = await getStaffImpersonationState();
  if (impersonation.viewingAsUnauth) return { ok: false, error: "unauthenticated" };

  const capabilityUser: CapabilityUser = {
    tier: rawTier,
    role,
    viewingAsTier:
      role === "staff" || role === "admin"
        ? impersonation.viewingAsTier ?? undefined
        : undefined,
  };
  if (!hasCapability(capabilityUser, "hub.access")) {
    return { ok: false, error: "capability_required" };
  }
  return { ok: true, userId: user.id, capabilityUser };
}

async function loadSessionForOwner(slug: string, userId: string) {
  const session = await getSessionBySlug(slug);
  if (!session) return null;
  if (session.owner_user_id !== userId) return null;
  return session;
}

export async function activateSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  try {
    await transitionSessionStatus({
      id: session.id,
      newStatus: "active",
      via: "manual",
      actorType: "streamer",
      actorId: auth.userId,
      payload: { source: "hub_ui" },
    });
    // Auto-seat the broadcaster on Twitch-bound sessions so the streamer
    // is in the lobby the moment the session activates — same invariant
    // the webhook + test-session endpoint enforce. No-op for non-Twitch.
    await ensureBroadcasterSeatedForTwitchSession({
      sessionId: session.id,
      ownerUserId: auth.userId,
    });
    revalidatePath(`/hub/sessions/${slug}`);
    revalidatePath("/hub");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "transition_failed",
    };
  }
}

export async function cancelSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  try {
    await transitionSessionStatus({
      id: session.id,
      newStatus: "cancelled",
      via: null,
      actorType: "streamer",
      actorId: auth.userId,
      payload: { source: "hub_ui" },
    });
    revalidatePath(`/hub/sessions/${slug}`);
    revalidatePath("/hub");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "transition_failed",
    };
  }
}

export async function endSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  // Test sessions skip wrap-up: end immediately with no recap-to-chat
  // posting. Live sessions still go through `active → ending → ended`
  // so the wrap-up window + recap fire normally.
  const isTestSession = !!session.feature_flags?.test_session;

  try {
    await transitionSessionStatus({
      id: session.id,
      newStatus: "ending",
      via: "manual",
      actorType: "streamer",
      actorId: auth.userId,
      payload: { source: "hub_ui" },
    });
    if (isTestSession) {
      // Roll the wrap-up forward immediately. The lifecycle sweep would
      // do this in 60s for a live session; test sessions don't need the
      // delay or the recap-to-chat post.
      await transitionSessionStatus({
        id: session.id,
        newStatus: "ended",
        via: "manual",
        actorType: "streamer",
        actorId: auth.userId,
        payload: { source: "hub_ui", reason: "test_session_skip_wrap_up" },
      });
    }
    revalidatePath(`/hub/sessions/${slug}`);
    revalidatePath("/hub");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "transition_failed",
    };
  }
}

export interface UpdateSessionDetailsInput {
  name?: string;
  description?: string | null;
  scheduledAt?: string | null;
  scheduledEligibilityWindowHours?: number;
  /** Multi-game spec: streamer-declared list in play order. When set,
   *  this writes both `gs_sessions.configured_games` AND mirrors the
   *  first entry into `config.game` for backward compat with single-
   *  game readers (lobby cap fallback, etc.). */
  configuredGames?: string[];
  isTestSession?: boolean;
  /** Queue-mode cap (config.max_participants). Only meaningful when the
   *  session has no games declared. */
  maxParticipants?: number | null;
}

/**
 * Update editable session metadata. Field-by-field permission model:
 *   - name + description: always editable
 *   - game (config.game), scheduledAt, scheduledEligibilityWindowHours,
 *     test_session: editable only while status is draft / scheduled / ready
 *   - everything else: not editable here (use the dedicated state-
 *     transition actions instead)
 *
 * Scheduling change side-effect: setting scheduledAt on a draft moves the
 * session to status='scheduled'; clearing scheduledAt on a scheduled
 * session moves it back to draft. Active/ended sessions can't reschedule.
 */
export async function updateSessionDetailsAction(
  slug: string,
  input: UpdateSessionDetailsInput
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  const editableForState =
    session.status === "draft" ||
    session.status === "scheduled" ||
    session.status === "ready";

  const update: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: "Name is required" };
    if (trimmed.length > 120) {
      return { ok: false, error: "Name must be 120 characters or fewer" };
    }
    update.name = trimmed;
  }

  if (input.description !== undefined) {
    update.description = input.description?.trim() || null;
  }

  if (
    input.configuredGames !== undefined ||
    input.scheduledAt !== undefined ||
    input.scheduledEligibilityWindowHours !== undefined ||
    input.isTestSession !== undefined ||
    input.maxParticipants !== undefined
  ) {
    if (!editableForState) {
      return {
        ok: false,
        error: `Games / schedule / queue cap / test-session can't change after the session ${session.status === "active" ? "starts" : "ends"}.`,
      };
    }
  }

  // Build a single config patch so game + queue cap can update together.
  let configPatch: Record<string, unknown> | null = null;
  const ensureConfigPatch = () => {
    if (!configPatch) {
      configPatch = {
        ...((session.config as Record<string, unknown> | null) ?? {}),
      };
    }
    return configPatch;
  };

  if (input.configuredGames !== undefined) {
    // Validate: ensure each entry is a string. Defensive — the multi-
    // select doesn't emit anything else, but the action is callable
    // from anywhere.
    const cleaned = input.configuredGames
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0);
    update.configured_games = cleaned;
    // Mirror the first entry into config.game so single-game consumers
    // (lobby cap fallback, twitch view shape) keep working. Empty array
    // → clears config.game entirely (queue mode).
    ensureConfigPatch().game = cleaned[0] ?? null;
  }

  if (input.maxParticipants !== undefined) {
    const patch = ensureConfigPatch();
    if (input.maxParticipants === null) {
      delete (patch as Record<string, unknown>).max_participants;
    } else {
      const n = Math.floor(input.maxParticipants);
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        return { ok: false, error: "Queue cap must be between 1 and 200." };
      }
      (patch as Record<string, unknown>).max_participants = n;
    }
  }

  if (configPatch) {
    update.config = configPatch;
  }

  if (input.scheduledAt !== undefined) {
    if (input.scheduledAt) {
      const ms = Date.parse(input.scheduledAt);
      if (!Number.isFinite(ms)) {
        return { ok: false, error: "Invalid scheduled date" };
      }
      if (ms <= Date.now()) {
        return { ok: false, error: "Schedule a time in the future" };
      }
      update.scheduled_at = new Date(ms).toISOString();
      // draft → scheduled when a date is added.
      if (session.status === "draft") update.status = "scheduled";
    } else {
      update.scheduled_at = null;
      // scheduled → draft when the date is cleared.
      if (session.status === "scheduled" || session.status === "ready") {
        update.status = "draft";
      }
    }
  }

  if (
    input.scheduledEligibilityWindowHours !== undefined &&
    Number.isFinite(input.scheduledEligibilityWindowHours)
  ) {
    const hours = Math.max(
      1,
      Math.min(24, Math.floor(input.scheduledEligibilityWindowHours))
    );
    update.scheduled_eligibility_window_hours = hours;
  }

  if (input.isTestSession !== undefined) {
    const flags = {
      ...((session.feature_flags as Record<string, unknown> | null) ?? {}),
      test_session: input.isTestSession,
    };
    update.feature_flags = flags;
  }

  if (Object.keys(update).length === 0) {
    return { ok: true };
  }

  // The unique-draft-per-owner index will reject a draft transition if a
  // sibling draft already exists. Surface that as a friendly error.
  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("gs_sessions")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", session.id);
  if (updateErr) {
    if ((updateErr as { code?: string }).code === "23505") {
      return {
        ok: false,
        error:
          "You already have another draft session — finish or cancel it before clearing this one's schedule.",
      };
    }
    console.error("[hub/sessions] updateSessionDetails failed:", updateErr);
    return { ok: false, error: updateErr.message };
  }

  // Audit any state changes triggered by scheduling edits.
  if (update.status && update.status !== session.status) {
    await import("@/lib/sessions/service").then(({ recordEvent }) =>
      recordEvent({
        sessionId: session.id,
        eventType: "state_change",
        actorType: "streamer",
        actorId: auth.userId,
        payload: {
          from: session.status,
          to: update.status,
          source: "configure_page",
          reason: input.scheduledAt ? "scheduled_set" : "scheduled_cleared",
        },
      })
    );
  }

  revalidatePath(`/hub/sessions/${slug}`);
  revalidatePath(`/hub/sessions/${slug}/configure`);
  revalidatePath("/hub");
  return { ok: true };
}

/**
 * Update GS Queue config (queue cap + rotation) on a session. Lives
 * under `gs_sessions.config.queue` so it can evolve without DDL.
 *
 * Edits flow from the Modules tab's GS Queue surface — the universal
 * queue config that applies whenever active_game is null. Always
 * editable (no lifecycle gate) because the queue is engaged on every
 * unsupported-category pivot, including mid-stream.
 */
export interface UpdateQueueConfigInput {
  cap?: number;
  rotation?: "fifo" | "random";
}

export async function updateQueueConfigAction(
  slug: string,
  input: UpdateQueueConfigInput
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  const baseConfig = (session.config as Record<string, unknown> | null) ?? {};
  const baseQueue = (baseConfig.queue as Record<string, unknown> | null) ?? {};
  const nextQueue: Record<string, unknown> = { ...baseQueue };

  if (input.cap !== undefined) {
    const n = Math.floor(input.cap);
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      return { ok: false, error: "Queue cap must be between 1 and 200." };
    }
    nextQueue.cap = n;
  }

  if (input.rotation !== undefined) {
    if (input.rotation !== "fifo" && input.rotation !== "random") {
      return { ok: false, error: "Rotation must be 'fifo' or 'random'." };
    }
    nextQueue.rotation = input.rotation;
  }

  const nextConfig = { ...baseConfig, queue: nextQueue };

  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("gs_sessions")
    .update({ config: nextConfig, updated_at: new Date().toISOString() })
    .eq("id", session.id);
  if (updateErr) {
    console.error("[hub/sessions] updateQueueConfig failed:", updateErr);
    return { ok: false, error: updateErr.message };
  }

  revalidatePath(`/hub/sessions/${slug}`);
  return { ok: true };
}

/**
 * Write the race-randomizer module config for a session + game slice.
 * Works on any session status (including draft) so streamers can
 * pre-curate picks/bans before activating. Routes through the existing
 * per-game module config writer.
 */
export async function updateRaceConfigAction(
  slug: string,
  args: {
    gameSlug: string;
    config: Record<string, unknown>;
  }
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  if (!args.gameSlug?.trim()) {
    return { ok: false, error: "gameSlug is required." };
  }

  // Module store accepts the typed config as `never`; the race-randomizer
  // shape is validated by our UI. Lazy import keeps the actions file off
  // the module-loader cycle.
  const { ensureSessionModule, updateModuleConfigForGame } = await import(
    "@/lib/modules/store"
  );
  await ensureSessionModule({
    sessionId: session.id,
    moduleId: "race_randomizer",
  });
  await updateModuleConfigForGame({
    sessionId: session.id,
    moduleId: "race_randomizer",
    gameSlug: args.gameSlug,
    config: args.config as never,
    legacyGameSlug: args.gameSlug,
  });

  revalidatePath(`/hub/sessions/${slug}`);
  return { ok: true };
}

// ---------- Picks/bans rounds (multi-game spec PR B) -----------------------

import {
  getOpenRoundForGame,
  getRoundById,
  listBallotsForRound,
  getLastClosedRoundForGame,
} from "@/lib/picks-bans/queries";
import { aggregateBallots, topN } from "@/lib/picks-bans/aggregate";
import {
  getModuleConfigForGame,
  updateModuleConfigForGame,
  ensureSessionModule,
} from "@/lib/modules/store";
import {
  getItemModesConfig,
  getLiteralItemsConfig,
  type RaceRandomizerConfig,
} from "@/lib/modules/types";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import { dispatchLifecycleEvent } from "@/lib/adapters/dispatcher";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import type { RecommendationMode } from "@/lib/picks-bans/types";
import {
  getTrackById,
  getItemModeById,
  getItemById,
} from "@/lib/randomizers/race";
import {
  picksBansOpenedMessage,
  picksBansClosedMessage,
  picksBansCancelledMessage,
  picksBansAppliedMessage,
  picksBansAutoAppliedMessage,
} from "@/lib/twitch/commands/messages";
import {
  getLiveSlugForUser,
  getLiveUrlForUser,
} from "@/lib/twitch/streamerSlug";
import { getGameName } from "@/data/game-registry";

export interface OpenPicksBansRoundInput {
  gameSlug: string;
  recommendationTopN?: number;
  recommendationMode?: RecommendationMode;
  /** Optional ISO timestamp for an auto-close timer. Null = manual only. */
  closesAt?: string | null;
}

/** Open a new picks/bans round for the given game on this session.
 *  Errors when one is already open for the same (session, game) — the
 *  unique partial index enforces this at the DB level. */
export async function openPicksBansRoundAction(
  slug: string,
  input: OpenPicksBansRoundInput
): Promise<ActionResult & { roundId?: string }> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  if (session.status !== "active" && session.status !== "ending") {
    return { ok: false, error: "Session must be active to open a round." };
  }

  const cleanGameSlug = input.gameSlug.trim();
  if (!cleanGameSlug) {
    return { ok: false, error: "gameSlug is required." };
  }

  const topNValue =
    typeof input.recommendationTopN === "number" &&
    Number.isFinite(input.recommendationTopN) &&
    input.recommendationTopN >= 1
      ? Math.floor(input.recommendationTopN)
      : 5;
  const mode: RecommendationMode =
    input.recommendationMode === "auto_apply" ? "auto_apply" : "recommend";

  const admin = createServiceClient();
  const { data, error: insertErr } = await admin
    .from("session_picks_bans_rounds")
    .insert({
      session_id: session.id,
      game_slug: cleanGameSlug,
      status: "open",
      recommendation_top_n: topNValue,
      recommendation_mode: mode,
      closes_at: input.closesAt ?? null,
      opened_by_user_id: auth.userId,
    })
    .select("id")
    .single();
  if (insertErr) {
    if ((insertErr as { code?: string }).code === "23505") {
      return {
        ok: false,
        error:
          "A picks/bans round is already open for this game. Close it before opening another.",
      };
    }
    console.error("[hub/picks-bans] openRound failed:", insertErr);
    return { ok: false, error: insertErr.message };
  }

  const roundId = (data as { id: string }).id;

  // Audit + Twitch chat announcement
  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.picks_bans_opened,
    actorType: "streamer",
    actorId: auth.userId,
    payload: {
      round_id: roundId,
      game_slug: cleanGameSlug,
      recommendation_top_n: topNValue,
      recommendation_mode: mode,
    },
  });

  // Cross-platform fan-out — Discord adapter posts the round-open
  // embed in the streamer's announcement channel (gated on the user's
  // Discord routing + per-event subscription/ping toggles).
  void dispatchLifecycleEvent({
    type: "picks_bans_opened",
    session,
    roundId,
    gameSlug: cleanGameSlug,
  }).catch((err) =>
    console.error("[hub/picks-bans] dispatch open failed:", err),
  );

  // Best-effort chat post — failure here doesn't roll back the open.
  // `postChatMessage()` returns an AdapterResult (resolved promise) on
  // expected failure modes — missing connection, missing bot user ID,
  // 4xx from Helix — so we must check the return value rather than
  // relying on try/catch alone. Without this, "Twitch never got the
  // announce" debugged as silent.
  try {
    const adapter = new TwitchAdapter({
      sessionId: session.id,
      ownerUserId: auth.userId,
    });
    // `slug` here is the session slug (URL path param). The live-page
    // URL is keyed on the *streamer* slug (users.username / twitch_
    // username), so resolve that separately rather than passing the
    // session slug straight through — the previous code shipped a
    // broken URL to chat (`gameshuffle.co/live/<session-slug>` →
    // 404 on the live page resolver).
    const streamerSlug =
      (await getLiveSlugForUser(auth.userId).catch(() => null)) ?? slug;
    const chatRes = await adapter.postChatMessage(
      picksBansOpenedMessage({
        streamerSlug,
        gameName: getGameName(cleanGameSlug),
      })
    );
    if (!chatRes.ok) {
      console.error(
        `[hub/picks-bans] chat announce returned not-ok: ${chatRes.error} (retryable=${chatRes.retryable})`,
      );
    }
  } catch (err) {
    console.error("[hub/picks-bans] chat announce threw:", err);
  }

  revalidatePath(`/hub/sessions/${slug}`);
  return { ok: true, roundId };
}

/** Close an open round. Aggregates locked ballots and stores the
 *  results snapshot. When `recommendation_mode === 'auto_apply'`, also
 *  fires apply immediately and posts a combined chat message. When
 *  `'recommend'`, just posts the close message and waits for the
 *  streamer to apply manually from the Hub. */
export async function closePicksBansRoundAction(
  slug: string,
  roundId: string
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  const round = await getRoundById(roundId);
  if (!round) return { ok: false, error: "round_not_found" };
  if (round.session_id !== session.id) {
    return { ok: false, error: "round_not_for_session" };
  }
  if (round.status !== "open") {
    return { ok: false, error: "round_not_open" };
  }

  const ballots = await listBallotsForRound(roundId);
  const lockedCount = ballots.filter((b) => b.locked_at != null).length;
  // Streamer's apply runs on locked-only ballots (Britton's rule:
  // viewer locks their vote, streamer decides). The closing snapshot
  // also stores locked-only counts so post-apply audits are honest.
  const results = aggregateBallots(ballots, { lockedOnly: true });

  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("session_picks_bans_rounds")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      results: results as unknown as Record<string, unknown>,
    })
    .eq("id", roundId);
  if (updateErr) {
    console.error("[hub/picks-bans] closeRound failed:", updateErr);
    return { ok: false, error: updateErr.message };
  }

  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.picks_bans_closed,
    actorType: "streamer",
    actorId: auth.userId,
    payload: {
      round_id: roundId,
      game_slug: round.game_slug,
      ballot_count: lockedCount,
      total_ballots: ballots.length,
    },
  });

  void dispatchLifecycleEvent({
    type: "picks_bans_closed",
    session,
    roundId,
    gameSlug: round.game_slug,
    ballotCount: lockedCount,
  }).catch((err) =>
    console.error("[hub/picks-bans] dispatch close failed:", err),
  );

  // Auto-apply mode: roll directly into the apply path so the chat
  // message is the combined "closed + auto-applied" recap. The apply
  // helper also writes its own audit + chat post.
  if (round.recommendation_mode === "auto_apply") {
    const applyResult = await applyPicksBansResultsAction(slug, roundId, {
      topN: round.recommendation_top_n,
      autoAppliedOnClose: true,
    });
    if (!applyResult.ok) {
      console.error(
        "[hub/picks-bans] auto-apply on close failed:",
        applyResult.error
      );
      // Fall through to the standard close message so chat still gets
      // a signal — just without the apply recap.
    } else {
      revalidatePath(`/hub/sessions/${slug}`);
      return { ok: true };
    }
  }

  // Manual review mode (or auto-apply fallback): post the close-only
  // message; streamer reviews + applies from the Hub. Append the live
  // URL so viewers who voted can see the results on the live page.
  try {
    const adapter = new TwitchAdapter({
      sessionId: session.id,
      ownerUserId: auth.userId,
    });
    const liveUrl = await getLiveUrlForUser(auth.userId).catch(() => null);
    await adapter.postChatMessage(
      picksBansClosedMessage({
        gameName: getGameName(round.game_slug),
        ballotCount: lockedCount,
        liveUrl,
      })
    );
  } catch (err) {
    console.error("[hub/picks-bans] chat close-announce failed:", err);
  }

  revalidatePath(`/hub/sessions/${slug}`);
  return { ok: true };
}

export interface ApplyPicksBansResultsInput {
  /** Override the round's `recommendation_top_n` if provided. */
  topN?: number;
  /** Which pools to apply. Default `'all'`. */
  target?: "tracks" | "rallies" | "itemModes" | "itemLiteral" | "all";
  /** Apply picks, bans, or both. Default `'both'`. */
  fields?: "picks" | "bans" | "both";
  /** Streamer-curated overrides — when supplied, exactly these IDs land
   *  in the final config (instead of the raw top-N). Use `null` for any
   *  pool to fall back to the auto top-N. Per the multi-game spec PR C
   *  edit-before-confirm flow. */
  overrides?: {
    tracks?: { picks?: string[] | null; bans?: string[] | null };
    rallies?: { picks?: string[] | null; bans?: string[] | null };
    itemModes?: { picks?: string[] | null; bans?: string[] | null };
    itemLiteral?: { picks?: string[] | null; bans?: string[] | null };
  };
  /** When true, the action posts an auto-apply combined message in
   *  chat instead of the standard "applied" message. Set by
   *  `closePicksBansRoundAction` when running the auto-apply path. */
  autoAppliedOnClose?: boolean;
}

/** Apply the top-N from a closed round into the canonical
 *  RaceRandomizerConfig picks/bans for the round's game slug. Idempotent
 *  on the round (running twice writes the same config; the second run
 *  is a no-op for the round itself but the module config rewrite is
 *  fine). */
export async function applyPicksBansResultsAction(
  slug: string,
  roundId: string,
  input: ApplyPicksBansResultsInput = {}
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  const round = await getRoundById(roundId);
  if (!round) return { ok: false, error: "round_not_found" };
  if (round.session_id !== session.id) {
    return { ok: false, error: "round_not_for_session" };
  }
  if (round.status !== "closed" && round.status !== "applied") {
    return {
      ok: false,
      error: "Round must be closed before applying results.",
    };
  }
  if (!round.results) {
    return { ok: false, error: "Round has no results to apply." };
  }

  const limit =
    typeof input.topN === "number" && Number.isFinite(input.topN) && input.topN >= 1
      ? Math.floor(input.topN)
      : round.recommendation_top_n;
  const target = input.target ?? "all";
  const fields = input.fields ?? "both";
  const overrides = input.overrides ?? {};

  // Read current module config for the round's game.
  await ensureSessionModule({
    sessionId: session.id,
    moduleId: "race_randomizer",
  });
  const existing =
    (await getModuleConfigForGame({
      sessionId: session.id,
      moduleId: "race_randomizer",
      gameSlug: round.game_slug,
      includeDisabled: true,
    })) ??
    ({
      enabled: true,
      tracks: { enabled: true, picks: [], bans: [] },
      items: {
        modes: { enabled: true, picks: [], bans: [] },
        literal: { enabled: true, picks: [], bans: [] },
      },
    } as RaceRandomizerConfig);

  const resultsSnap = round.results;
  // Auto top-N from the aggregate. Overrides (when present) replace
  // the auto-derived list before we compute the final write.
  const tracksTop = topN(resultsSnap.tracks, limit);
  // Older snapshots predate the rallies field — fall back to empty.
  const ralliesAgg = resultsSnap.rallies ?? {
    topPicks: [],
    topBans: [],
    totals: { picks: 0, bans: 0 },
  };
  const ralliesTop = topN(ralliesAgg, limit);
  const itemModesTop = topN(resultsSnap.itemModes, limit);
  const itemLiteralTop = topN(resultsSnap.itemLiteral, limit);

  const finalTracksPicks = overrides.tracks?.picks ?? tracksTop.picks;
  const finalTracksBans = overrides.tracks?.bans ?? tracksTop.bans;
  const finalRalliesPicks = overrides.rallies?.picks ?? ralliesTop.picks;
  const finalRalliesBans = overrides.rallies?.bans ?? ralliesTop.bans;
  const finalModesPicks = overrides.itemModes?.picks ?? itemModesTop.picks;
  const finalModesBans = overrides.itemModes?.bans ?? itemModesTop.bans;
  const finalLiteralPicks = overrides.itemLiteral?.picks ?? itemLiteralTop.picks;
  const finalLiteralBans = overrides.itemLiteral?.bans ?? itemLiteralTop.bans;

  // Snapshot existing config for the audit diff. We only diff the
  // pools we're about to write so the audit row stays focused.
  const existingModes = getItemModesConfig(existing.items);
  const existingLiteral = getLiteralItemsConfig(existing.items);
  const before = {
    tracks: {
      picks: [...existing.tracks.picks],
      bans: [...existing.tracks.bans],
    },
    itemModes: {
      picks: [...existingModes.picks],
      bans: [...existingModes.bans],
    },
    itemLiteral: {
      picks: [...existingLiteral.picks],
      bans: [...existingLiteral.bans],
    },
  };

  // Rally writes are skipped when the existing config has no rally
  // sub-pool AND the round contributed no rally picks/bans — keeps
  // MK8DX config rows clean. MKW configs always carry rallies.
  const writeRallies =
    !!existing.rallies ||
    finalRalliesPicks.length > 0 ||
    finalRalliesBans.length > 0;

  const next: RaceRandomizerConfig = {
    ...existing,
    tracks: {
      ...existing.tracks,
      ...((target === "all" || target === "tracks") && fields !== "bans"
        ? { picks: finalTracksPicks }
        : {}),
      ...((target === "all" || target === "tracks") && fields !== "picks"
        ? { bans: finalTracksBans }
        : {}),
    },
    ...(writeRallies
      ? {
          rallies: {
            ...(existing.rallies ?? { enabled: true, picks: [], bans: [] }),
            ...((target === "all" || target === "rallies") && fields !== "bans"
              ? { picks: finalRalliesPicks }
              : {}),
            ...((target === "all" || target === "rallies") && fields !== "picks"
              ? { bans: finalRalliesBans }
              : {}),
          },
        }
      : {}),
    items: {
      modes: {
        ...existingModes,
        ...((target === "all" || target === "itemModes") && fields !== "bans"
          ? { picks: finalModesPicks }
          : {}),
        ...((target === "all" || target === "itemModes") && fields !== "picks"
          ? { bans: finalModesBans }
          : {}),
      },
      literal: {
        ...existingLiteral,
        ...((target === "all" || target === "itemLiteral") && fields !== "bans"
          ? { picks: finalLiteralPicks }
          : {}),
        ...((target === "all" || target === "itemLiteral") && fields !== "picks"
          ? { bans: finalLiteralBans }
          : {}),
      },
    },
  };

  await updateModuleConfigForGame({
    sessionId: session.id,
    moduleId: "race_randomizer",
    gameSlug: round.game_slug,
    config: next,
    legacyGameSlug: round.game_slug,
  });

  // Mark round applied (only if currently closed — re-applying a
  // previously-applied round leaves the timestamp stable).
  if (round.status === "closed") {
    const admin = createServiceClient();
    await admin
      .from("session_picks_bans_rounds")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", roundId);
  }

  // Compute the diff for the audit event and the chat recap. Only
  // include pools that actually changed.
  const after = {
    tracks: {
      picks: getModulePicks(next, "tracks"),
      bans: getModuleBans(next, "tracks"),
    },
    itemModes: {
      picks: getModulePicks(next, "itemModes"),
      bans: getModuleBans(next, "itemModes"),
    },
    itemLiteral: {
      picks: getModulePicks(next, "itemLiteral"),
      bans: getModuleBans(next, "itemLiteral"),
    },
  };

  const appliedPickNames: string[] = [];
  const appliedBanNames: string[] = [];
  for (const id of after.tracks.picks) appliedPickNames.push(getTrackById(id)?.name ?? id);
  for (const id of after.tracks.bans) appliedBanNames.push(getTrackById(id)?.name ?? id);
  for (const id of after.itemModes.picks) appliedPickNames.push(getItemModeById(id)?.name ?? id);
  for (const id of after.itemModes.bans) appliedBanNames.push(getItemModeById(id)?.name ?? id);
  for (const id of after.itemLiteral.picks) appliedPickNames.push(getItemById(id)?.name ?? id);
  for (const id of after.itemLiteral.bans) appliedBanNames.push(getItemById(id)?.name ?? id);

  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.picks_bans_applied,
    actorType: "streamer",
    actorId: auth.userId,
    payload: {
      round_id: roundId,
      game_slug: round.game_slug,
      top_n: limit,
      target,
      fields,
      before,
      after,
      overrides_used:
        overrides.tracks ||
        overrides.itemModes ||
        overrides.itemLiteral
          ? true
          : false,
      auto_applied_on_close: !!input.autoAppliedOnClose,
    },
  });

  // Best-effort chat recap of what landed.
  try {
    const adapter = new TwitchAdapter({
      sessionId: session.id,
      ownerUserId: auth.userId,
    });
    const message = input.autoAppliedOnClose
      ? picksBansAutoAppliedMessage({
          gameName: getGameName(round.game_slug),
          appliedPicks: appliedPickNames,
          appliedBans: appliedBanNames,
        })
      : picksBansAppliedMessage({
          gameName: getGameName(round.game_slug),
          appliedPicks: appliedPickNames,
          appliedBans: appliedBanNames,
        });
    await adapter.postChatMessage(message);
  } catch (err) {
    console.error("[hub/picks-bans] apply chat post failed:", err);
  }

  revalidatePath(`/hub/sessions/${slug}`);
  return { ok: true };
}

function getModulePicks(
  config: RaceRandomizerConfig,
  pool: "tracks" | "itemModes" | "itemLiteral"
): string[] {
  if (pool === "tracks") return [...config.tracks.picks];
  if (pool === "itemModes") return [...getItemModesConfig(config.items).picks];
  return [...getLiteralItemsConfig(config.items).picks];
}

function getModuleBans(
  config: RaceRandomizerConfig,
  pool: "tracks" | "itemModes" | "itemLiteral"
): string[] {
  if (pool === "tracks") return [...config.tracks.bans];
  if (pool === "itemModes") return [...getItemModesConfig(config.items).bans];
  return [...getLiteralItemsConfig(config.items).bans];
}

/** Cancel an open round without applying anything. Used for category
 *  pivots that auto-close the round, or when the streamer just bails. */
export async function cancelPicksBansRoundAction(
  slug: string,
  roundId: string
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  const round = await getRoundById(roundId);
  if (!round) return { ok: false, error: "round_not_found" };
  if (round.session_id !== session.id) {
    return { ok: false, error: "round_not_for_session" };
  }
  if (round.status !== "open") {
    return { ok: false, error: "round_not_open" };
  }

  const admin = createServiceClient();
  await admin
    .from("session_picks_bans_rounds")
    .update({
      status: "cancelled",
      closed_at: new Date().toISOString(),
    })
    .eq("id", roundId);

  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.picks_bans_cancelled,
    actorType: "streamer",
    actorId: auth.userId,
    payload: {
      round_id: roundId,
      game_slug: round.game_slug,
      reason: "manual",
    },
  });

  // Best-effort chat post — viewers in the live view should know the
  // round was scrapped so they don't keep editing a phantom ballot.
  try {
    const adapter = new TwitchAdapter({
      sessionId: session.id,
      ownerUserId: auth.userId,
    });
    await adapter.postChatMessage(
      picksBansCancelledMessage({
        gameName: getGameName(round.game_slug),
        reason: "manual",
      })
    );
  } catch (err) {
    console.error("[hub/picks-bans] cancel chat post failed:", err);
  }

  revalidatePath(`/hub/sessions/${slug}`);
  return { ok: true };
}

/** Get the previous closed/applied round's locked ballots so they can
 *  be served as carry-over seed. Server action used by the live view. */
export async function getCarryoverBallotsAction(args: {
  sessionId: string;
  gameSlug: string;
}): Promise<{ ok: true; lastRoundId: string | null }> {
  const last = await getLastClosedRoundForGame({
    sessionId: args.sessionId,
    gameSlug: args.gameSlug,
  });
  return { ok: true, lastRoundId: last?.id ?? null };
}

// ---------- /Picks/bans rounds ----------------------------------------------

export async function restartSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const source = await loadSessionForOwner(slug, auth.userId);
  if (!source) return { ok: false, error: "not_found" };
  if (source.status !== "ended" && source.status !== "cancelled") {
    return { ok: false, error: "session_not_terminal" };
  }

  try {
    const newSession = await createSession({
      ownerUserId: auth.userId,
      name: `${source.name} (Restart)`,
      description: source.description,
      platforms: source.platforms,
      config: source.config,
    });
    revalidatePath("/hub");
    return { ok: true, redirectTo: `/hub/sessions/${newSession.slug}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "restart_failed",
    };
  }
}
