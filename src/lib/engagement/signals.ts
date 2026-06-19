/**
 * Engagement signal helpers — the read + write surface over
 * `gs_engagement_signals`.
 *
 * Phase 1 keeps this dead simple: append a row when something
 * happens, sum the weights for a window when asked for a score.
 * No decay model, no admin-tunable weights, no leaderboard cache.
 * Layer those on as the data starts flowing and product needs
 * sharpen.
 *
 * Default weights — tuned by hand for Phase 1; intentionally not
 * exposed as a config table yet. Bias toward:
 *   - actions cost effort → higher weight (events, social)
 *   - passive interactions → lower weight (commands)
 *   - token activity scales with magnitude (1 token = 1 point)
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type SignalType =
  | "command_fired"
  | "event_fired"
  | "social_action"
  | "token_earned"
  | "token_spent";

/** Hardcoded fallbacks used when the weights table is empty / the
 *  cache hasn't loaded yet. Should match the Phase 2 migration's
 *  seed so cache-miss behavior is identical to "no override set." */
export const DEFAULT_WEIGHTS: Record<SignalType, number> = {
  command_fired: 1,
  event_fired: 5,
  social_action: 3,
  token_earned: 1, // multiplied by amount at log time
  token_spent: 1, // multiplied by amount at log time
};

/** Module-level cache for admin-tunable weights. 5-min TTL — admin
 *  edits propagate on the next miss without further plumbing. */
const WEIGHT_CACHE_TTL_MS = 5 * 60 * 1000;
let weightCache: { values: Record<SignalType, number>; fetchedAt: number } | null =
  null;
let inflightWeightFetch: Promise<Record<SignalType, number>> | null = null;

async function loadWeights(): Promise<Record<SignalType, number>> {
  if (weightCache && Date.now() - weightCache.fetchedAt < WEIGHT_CACHE_TTL_MS) {
    return weightCache.values;
  }
  if (inflightWeightFetch) return inflightWeightFetch;
  inflightWeightFetch = (async () => {
    try {
      const admin = createServiceClient();
      const { data, error } = await admin
        .from("gs_engagement_weights")
        .select("signal_type, weight");
      if (error) {
        console.error("[engagement] weights load failed:", error.message);
        const fallback = { ...DEFAULT_WEIGHTS };
        weightCache = { values: fallback, fetchedAt: Date.now() };
        return fallback;
      }
      const merged: Record<SignalType, number> = { ...DEFAULT_WEIGHTS };
      for (const row of (data as { signal_type: SignalType; weight: number }[] | null) ?? []) {
        merged[row.signal_type] = row.weight;
      }
      weightCache = { values: merged, fetchedAt: Date.now() };
      return merged;
    } finally {
      inflightWeightFetch = null;
    }
  })();
  return inflightWeightFetch;
}

/** Force a refresh on the next access — used by the admin PUT
 *  endpoint after an update so staff see the new weight take effect
 *  immediately rather than after the TTL expires. */
export function invalidateWeightCache(): void {
  weightCache = null;
}

interface LogSignalArgs {
  identityId: string;
  communityId: string;
  signalType: SignalType;
  weight?: number;
  sessionId?: string | null;
  streamId?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Append a signal row. Best-effort — failure logs and silently
 * returns so signal logging never breaks the calling code path.
 * (A missed engagement point isn't worth taking down a chat
 * command on.)
 */
export async function logSignal(args: LogSignalArgs): Promise<void> {
  let weight: number;
  if (typeof args.weight === "number") {
    weight = args.weight;
  } else {
    // Cached DB lookup with fallback to constants — see loadWeights.
    const weights = await loadWeights();
    weight = weights[args.signalType] ?? DEFAULT_WEIGHTS[args.signalType] ?? 1;
  }
  // Clamp to positive — the table CHECK requires it, and "negative
  // engagement" doesn't have a clear meaning here.
  if (!Number.isInteger(weight) || weight < 1) return;
  const admin = createServiceClient();
  const { error } = await admin.from("gs_engagement_signals").insert({
    identity_id: args.identityId,
    community_id: args.communityId,
    signal_type: args.signalType,
    weight,
    session_id: args.sessionId ?? null,
    stream_id: args.streamId ?? null,
    meta: args.meta ?? {},
  });
  if (error) {
    console.error("[engagement] logSignal failed:", error.message);
  }
}

interface GetScoreArgs {
  identityId: string;
  communityId: string;
  /** Lookback window in milliseconds. Defaults to 1 hour — good
   *  proxy for "current stream activity" without needing a session
   *  context. Pass a larger value for "lifetime" rough cuts. */
  windowMs?: number;
  /** Optional session scope. When provided, only signals tagged
   *  with this session_id count — the natural "this stream"
   *  scope that the `!engagement` command uses by default. */
  sessionId?: string | null;
}

/**
 * Sum the engagement weights for one viewer in one community over
 * a window. Cheap query — single index scan on the score idx.
 *
 * Returns `0` when there are no rows in the window (clean default
 * for chat replies and partner-resolver bias).
 */
export async function getEngagementScore(
  args: GetScoreArgs,
): Promise<number> {
  const admin = createServiceClient();
  const sinceMs = args.windowMs ?? 60 * 60 * 1000;
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  let q = admin
    .from("gs_engagement_signals")
    .select("weight")
    .eq("community_id", args.communityId)
    .eq("identity_id", args.identityId)
    .gte("created_at", sinceIso);
  if (args.sessionId) {
    q = q.eq("session_id", args.sessionId);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[engagement] getEngagementScore failed:", error.message);
    return 0;
  }
  return ((data as { weight: number }[] | null) ?? []).reduce(
    (acc, r) => acc + r.weight,
    0,
  );
}

/**
 * Decompose a viewer's score by signal type — useful for chat
 * replies that explain *what* drove the number, not just the
 * total. Same window semantics as `getEngagementScore`.
 */
export async function getEngagementBreakdown(args: GetScoreArgs): Promise<{
  total: number;
  byType: Partial<Record<SignalType, number>>;
}> {
  const admin = createServiceClient();
  const sinceMs = args.windowMs ?? 60 * 60 * 1000;
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  let q = admin
    .from("gs_engagement_signals")
    .select("signal_type, weight")
    .eq("community_id", args.communityId)
    .eq("identity_id", args.identityId)
    .gte("created_at", sinceIso);
  if (args.sessionId) {
    q = q.eq("session_id", args.sessionId);
  }
  const { data, error } = await q;
  if (error) {
    console.error(
      "[engagement] getEngagementBreakdown failed:",
      error.message,
    );
    return { total: 0, byType: {} };
  }
  const rows =
    (data as { signal_type: SignalType; weight: number }[] | null) ?? [];
  const byType: Partial<Record<SignalType, number>> = {};
  let total = 0;
  for (const r of rows) {
    total += r.weight;
    byType[r.signal_type] = (byType[r.signal_type] ?? 0) + r.weight;
  }
  return { total, byType };
}
