/**
 * Question of the Day — shared resolution.
 *
 * `!qotd` (Twitch chat) and the daily Discord post must NEVER disagree
 * about "today's question", so both go through this module: the same pool
 * query (platform canon + this community's entries, enabled only) and the
 * same deterministic day-index pick.
 *
 * Rotation is by UTC day: every call within the same day returns the same
 * entry, it advances the next day, and it cycles through the whole pool.
 * Order is stabilized by `id` so the sequence is fixed across calls,
 * processes, and surfaces.
 */

import { createServiceClient } from "@/lib/supabase/admin";

/** The command trigger that owns the question pool. */
export const QOTD_TRIGGER = "qotd";

export interface QotdPick {
  /** The pool-entry id (stable across the day). */
  id: string;
  question: string;
}

/**
 * Deterministic once-per-UTC-day pick over a pool. Weight-agnostic — the
 * point is a stable rotation, not a random draw. Exported so the chat
 * fallback and the Discord cron share one implementation.
 */
export function pickDaily<T extends { id: string }>(
  pool: T[],
  now: number = Date.now(),
): T {
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const dayNumber = Math.floor(now / 86_400_000); // UTC day index
  return sorted[dayNumber % sorted.length];
}

/**
 * Today's question for a community, or null when the qotd command doesn't
 * exist / the pool is empty. The query mirrors the chat path's
 * `loadEnabledResponses` exactly — enabled entries, platform canon
 * (`community_id IS NULL`) blended with this community's own.
 */
export async function resolveQotdForCommunity(
  communityId: string,
  now: number = Date.now(),
): Promise<QotdPick | null> {
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
  if (pool.length === 0) return null;

  const picked = pickDaily(pool, now);
  return { id: picked.id, question: picked.response };
}
