/**
 * Question of the Day — shared resolution engine.
 *
 * `!qotd` (Twitch chat) and the daily Discord post must NEVER disagree about
 * "today's question", so both go through this module: one pool query (platform
 * canon + this community's entries, enabled only) and one rotation.
 *
 * Rotation is **no-repeat by UTC day**: each day claims a question that hasn't
 * been used yet (recorded in `gs_qotd_history`), stable within the day across
 * calls/processes/surfaces. When every question has been used the engine
 * **pauses** (posts nothing) — unless the streamer opted into repeats, in which
 * case it falls back to a deterministic daily pick over the whole pool. As the
 * unused pool runs low it drops a one-time "running low" notification to the
 * streamer (silenceable), re-armed once they top the pool back up.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";

/** The command trigger that owns the question pool. */
export const QOTD_TRIGGER = "qotd";

/** Warn the streamer once the unused pool drops to this many (or fewer). */
export const QOTD_LOW_THRESHOLD = 3;

export interface QotdPick {
  /** The pool-entry id (stable across the day). */
  id: string;
  question: string;
}

export interface QotdState {
  /** Today's question, or null when nothing should post (empty/paused). */
  pick: QotdPick | null;
  /** Total pool size (GameShuffle defaults + this community's own). */
  total: number;
  /** Questions never used yet (excludes today's claim once made). */
  remaining: number;
  /** Every question has been used at least once. */
  exhausted: boolean;
  /** Today's question is already locked in. */
  claimed: boolean;
  /** Exhausted AND repeats not allowed → nothing posts today. */
  paused: boolean;
  ownerUserId: string | null;
}

/**
 * Deterministic once-per-UTC-day pick over a pool. Weight-agnostic — the point
 * is a stable rotation, not a random draw. Order is stabilized by `id`.
 */
export function pickDaily<T extends { id: string }>(
  pool: T[],
  now: number = Date.now(),
): T {
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const dayNumber = Math.floor(now / 86_400_000); // UTC day index
  return sorted[dayNumber % sorted.length];
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

interface QotdContext {
  cmdId: string;
  pool: { id: string; response: string }[];
  ownerUserId: string | null;
  allowRepeats: boolean;
  lowSilenced: boolean;
  lowNotifiedAt: string | null;
}

/**
 * Load the pool + the owner's engine settings for a community. Mirrors the
 * chat path's query exactly (enabled entries, platform canon blended with the
 * community's own), then reverse-walks community → owner user for settings.
 */
async function loadContext(communityId: string): Promise<QotdContext | null> {
  const admin = createServiceClient();

  const { data: cmdRow } = await admin
    .from("gs_default_commands")
    .select("id, enabled")
    .eq("trigger", QOTD_TRIGGER)
    .maybeSingle();
  const cmd = cmdRow as { id: string; enabled: boolean } | null;
  // Respect the platform kill-switch — a disabled command posts nothing.
  if (!cmd || !cmd.enabled) return null;

  const { data, error } = await admin
    .from("gs_default_command_responses")
    .select("id, response")
    .eq("command_id", cmd.id)
    .eq("enabled", true)
    .or(`community_id.is.null,community_id.eq.${communityId}`);
  if (error) {
    console.error("[qotd] pool load failed:", error.message);
    return null;
  }
  const pool = (data as { id: string; response: string }[] | null) ?? [];

  // Reverse-walk community → owner identity → owner user, then read settings.
  let ownerUserId: string | null = null;
  let allowRepeats = false;
  let lowSilenced = false;
  let lowNotifiedAt: string | null = null;

  const { data: comm } = await admin
    .from("gs_communities")
    .select("owner_identity_id")
    .eq("id", communityId)
    .maybeSingle();
  const ownerIdentityId =
    (comm as { owner_identity_id: string | null } | null)?.owner_identity_id ??
    null;
  if (ownerIdentityId) {
    const { data: ident } = await admin
      .from("gs_identities")
      .select("gs_account_id")
      .eq("id", ownerIdentityId)
      .maybeSingle();
    ownerUserId =
      (ident as { gs_account_id: string | null } | null)?.gs_account_id ?? null;
  }
  if (ownerUserId) {
    const { data: u } = await admin
      .from("users")
      .select(
        "discord_qotd_allow_repeats, discord_qotd_low_silenced, discord_qotd_low_notified_at",
      )
      .eq("id", ownerUserId)
      .maybeSingle();
    const uu = u as {
      discord_qotd_allow_repeats: boolean | null;
      discord_qotd_low_silenced: boolean | null;
      discord_qotd_low_notified_at: string | null;
    } | null;
    allowRepeats = !!uu?.discord_qotd_allow_repeats;
    lowSilenced = !!uu?.discord_qotd_low_silenced;
    lowNotifiedAt = uu?.discord_qotd_low_notified_at ?? null;
  }

  return { cmdId: cmd.id, pool, ownerUserId, allowRepeats, lowSilenced, lowNotifiedAt };
}

/**
 * Read-only: today's question + counts, WITHOUT claiming. Safe for previews /
 * settings UIs (previewing must never consume a question).
 */
export async function computeQotdState(
  communityId: string,
  now: number = Date.now(),
): Promise<QotdState> {
  const ctx = await loadContext(communityId);
  if (!ctx || ctx.pool.length === 0) {
    return {
      pick: null,
      total: 0,
      remaining: 0,
      exhausted: false,
      claimed: false,
      paused: false,
      ownerUserId: ctx?.ownerUserId ?? null,
    };
  }

  const admin = createServiceClient();
  const today = utcDay(now);
  const { data: hist } = await admin
    .from("gs_qotd_history")
    .select("response_id, used_on")
    .eq("community_id", communityId);
  const rows = (hist as { response_id: string; used_on: string }[] | null) ?? [];
  const usedIds = new Set(rows.map((r) => r.response_id));
  const todayRow = rows.find((r) => r.used_on === today) ?? null;

  const unused = ctx.pool.filter((p) => !usedIds.has(p.id));
  const remaining = unused.length;

  // Already locked in for today.
  if (todayRow) {
    const found = ctx.pool.find((p) => p.id === todayRow.response_id) ?? null;
    return {
      pick: found ? { id: found.id, question: found.response } : null,
      total: ctx.pool.length,
      remaining,
      exhausted: remaining === 0,
      claimed: true,
      paused: false,
      ownerUserId: ctx.ownerUserId,
    };
  }

  // Fresh question available.
  if (unused.length > 0) {
    const p = pickDaily(unused, now);
    return {
      pick: { id: p.id, question: p.response },
      total: ctx.pool.length,
      remaining,
      exhausted: false,
      claimed: false,
      paused: false,
      ownerUserId: ctx.ownerUserId,
    };
  }

  // Exhausted: repeat (deterministic over the whole pool) or pause.
  if (ctx.allowRepeats) {
    const p = pickDaily(ctx.pool, now);
    return {
      pick: { id: p.id, question: p.response },
      total: ctx.pool.length,
      remaining: 0,
      exhausted: true,
      claimed: false,
      paused: false,
      ownerUserId: ctx.ownerUserId,
    };
  }
  return {
    pick: null,
    total: ctx.pool.length,
    remaining: 0,
    exhausted: true,
    claimed: false,
    paused: true,
    ownerUserId: ctx.ownerUserId,
  };
}

/**
 * Today's question for a community — claims it (records history so it won't
 * repeat) and fires the low-stock alert as the unused pool drains. Returns null
 * when nothing should post (empty pool, or exhausted with repeats off).
 *
 * Same signature as before, so every caller (Twitch !qotd, the Discord cron,
 * the manual "post now") shares one behavior.
 */
export async function resolveQotdForCommunity(
  communityId: string,
  now: number = Date.now(),
): Promise<QotdPick | null> {
  const state = await computeQotdState(communityId, now);
  if (!state.pick) return null;
  if (state.claimed) return state.pick;

  const admin = createServiceClient();
  const today = utcDay(now);
  const { error } = await admin
    .from("gs_qotd_history")
    .insert({ community_id: communityId, response_id: state.pick.id, used_on: today });

  if (error) {
    // Someone claimed today first (unique on community+day). Re-read + return.
    if ((error as { code?: string }).code === "23505") {
      if (state.exhausted) return state.pick; // repeat mode: no per-day row varies
      const fresh = await computeQotdState(communityId, now);
      return fresh.pick ?? state.pick;
    }
    console.error("[qotd] claim failed:", (error as { message?: string }).message);
    return state.pick; // best-effort: still surface the question
  }

  // Only a genuinely fresh question consumes stock — repeats don't drain it.
  if (!state.exhausted) {
    await maintainLowAlert(state.ownerUserId, state.remaining - 1, now);
  }
  return state.pick;
}

/**
 * One-time "running low" notification as the unused pool crosses the threshold,
 * re-armed once the streamer tops it back up. Silenceable per streamer.
 */
async function maintainLowAlert(
  ownerUserId: string | null,
  unusedAfter: number,
  now: number,
): Promise<void> {
  if (!ownerUserId) return;
  const admin = createServiceClient();
  const { data: u } = await admin
    .from("users")
    .select("discord_qotd_low_silenced, discord_qotd_low_notified_at")
    .eq("id", ownerUserId)
    .maybeSingle();
  const uu = u as {
    discord_qotd_low_silenced: boolean | null;
    discord_qotd_low_notified_at: string | null;
  } | null;
  const silenced = !!uu?.discord_qotd_low_silenced;
  const alreadyNotified = !!uu?.discord_qotd_low_notified_at;

  if (unusedAfter <= QOTD_LOW_THRESHOLD) {
    if (silenced || alreadyNotified) return;
    await createNotification({
      userId: ownerUserId,
      type: "qotd_low",
      title: "Running low on Question of the Day questions",
      message:
        unusedAfter <= 0
          ? "You've used every question. Add more (or allow repeats) so QOTD keeps posting."
          : `Only ${unusedAfter} unused question${unusedAfter === 1 ? "" : "s"} left. Add a few more in your Discord Bot settings.`,
      link: "/account?tab=discord-bot",
    });
    await admin
      .from("users")
      .update({ discord_qotd_low_notified_at: new Date(now).toISOString() })
      .eq("id", ownerUserId);
  } else if (alreadyNotified) {
    // Topped back up — re-arm the alert for next time.
    await admin
      .from("users")
      .update({ discord_qotd_low_notified_at: null })
      .eq("id", ownerUserId);
  }
}
