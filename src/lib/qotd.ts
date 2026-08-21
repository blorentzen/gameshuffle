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

/** Timezone used when a streamer hasn't set one (matches the QOTD cron). */
export const QOTD_DEFAULT_TZ = "America/Los_Angeles";

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
  /** The local-day key this state was computed for (YYYY-MM-DD). */
  dayKey: string;
}

/** Local calendar date parts for `now` in `tz`. */
function localParts(now: number, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/**
 * The QOTD "day" key — `YYYY-MM-DD` for `now` in the streamer's timezone.
 * Rotation (and the preview/showcase) turns over at their LOCAL midnight, not
 * UTC's. Exported so the Discord dedup claim uses the same day.
 */
export function qotdDayKey(now: number, tz: string | null): string {
  const { y, m, d } = localParts(now, tz || QOTD_DEFAULT_TZ);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Integer day index for `now` in `tz` (stable per local calendar day). */
function localDayNumber(now: number, tz: string | null): number {
  const { y, m, d } = localParts(now, tz || QOTD_DEFAULT_TZ);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Deterministic pick for a given day index. Order stabilized by `id`. */
export function pickForDay<T extends { id: string }>(pool: T[], dayNumber: number): T {
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const n = sorted.length;
  return sorted[((dayNumber % n) + n) % n];
}

/**
 * Deterministic once-per-UTC-day pick. Kept for callers without a timezone;
 * the QOTD engine itself rotates on the streamer's LOCAL day (see qotdDayKey).
 */
export function pickDaily<T extends { id: string }>(
  pool: T[],
  now: number = Date.now(),
): T {
  return pickForDay(pool, Math.floor(now / 86_400_000));
}

interface QotdContext {
  cmdId: string;
  pool: { id: string; response: string }[];
  ownerUserId: string | null;
  timezone: string | null;
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
  let timezone: string | null = null;
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
        "timezone, discord_qotd_allow_repeats, discord_qotd_low_silenced, discord_qotd_low_notified_at",
      )
      .eq("id", ownerUserId)
      .maybeSingle();
    const uu = u as {
      timezone: string | null;
      discord_qotd_allow_repeats: boolean | null;
      discord_qotd_low_silenced: boolean | null;
      discord_qotd_low_notified_at: string | null;
    } | null;
    timezone = uu?.timezone ?? null;
    allowRepeats = !!uu?.discord_qotd_allow_repeats;
    lowSilenced = !!uu?.discord_qotd_low_silenced;
    lowNotifiedAt = uu?.discord_qotd_low_notified_at ?? null;
  }

  return { cmdId: cmd.id, pool, ownerUserId, timezone, allowRepeats, lowSilenced, lowNotifiedAt };
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
  const dayKey = qotdDayKey(now, ctx?.timezone ?? null);
  if (!ctx || ctx.pool.length === 0) {
    return {
      pick: null,
      total: 0,
      remaining: 0,
      exhausted: false,
      claimed: false,
      paused: false,
      ownerUserId: ctx?.ownerUserId ?? null,
      dayKey,
    };
  }

  const admin = createServiceClient();
  const dayNumber = localDayNumber(now, ctx.timezone);
  const { data: hist } = await admin
    .from("gs_qotd_history")
    .select("response_id, used_on")
    .eq("community_id", communityId);
  const rows = (hist as { response_id: string; used_on: string }[] | null) ?? [];
  const usedIds = new Set(rows.map((r) => r.response_id));
  const todayRow = rows.find((r) => r.used_on === dayKey) ?? null;

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
      dayKey,
    };
  }

  // Fresh question available.
  if (unused.length > 0) {
    const p = pickForDay(unused, dayNumber);
    return {
      pick: { id: p.id, question: p.response },
      total: ctx.pool.length,
      remaining,
      exhausted: false,
      claimed: false,
      paused: false,
      ownerUserId: ctx.ownerUserId,
      dayKey,
    };
  }

  // Exhausted: repeat (deterministic over the whole pool) or pause.
  if (ctx.allowRepeats) {
    const p = pickForDay(ctx.pool, dayNumber);
    return {
      pick: { id: p.id, question: p.response },
      total: ctx.pool.length,
      remaining: 0,
      exhausted: true,
      claimed: false,
      paused: false,
      ownerUserId: ctx.ownerUserId,
      dayKey,
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
    dayKey,
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
  const { error } = await admin
    .from("gs_qotd_history")
    .insert({ community_id: communityId, response_id: state.pick.id, used_on: state.dayKey });

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
