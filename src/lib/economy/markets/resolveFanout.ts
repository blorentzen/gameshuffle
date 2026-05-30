/**
 * Resolve fan-out — Spec 02 §8a + Spec 04 §2.
 *
 * One `!gs resolve <value>` settles three families pegged to the
 * same variable_type:
 *
 *   1. Prediction markets (gs_markets) — already handled by
 *      `resolveMarket` directly; the parimutuel payout machinery
 *      stays in lifecycle.ts.
 *
 *   2. Event-spawned challenges (gs_event_challenges) — open
 *      challenges in this (session, chapter) whose variable_type
 *      matches the market's get their condition evaluated and their
 *      status flipped. Challenges with a `target_identity_id` get
 *      auto-credited (`event_delta`) on success or debited on
 *      failure; open-target challenges mark resolved without auto-
 *      payout (the host names the winner via a future surface).
 *
 *   3. Bounties (gs_bounties) — open bounties for this session get
 *      their `resolved_value` stamped. v1 still requires the
 *      streamer to `!gs bounty award @user` manually since
 *      satisfier identification isn't wired (Phase 2 scope-out).
 *      Storing the resolved_value at least carries ground truth.
 *
 * Called from `resolveMarket` AFTER the parimutuel payout completes.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { credit, spend } from "@/lib/economy/tokens";
import { isPlacementSpec } from "./types";

export interface ResolveFanoutSummary {
  challengesResolved: number;
  challengeRewards: number;
  challengePenalties: number;
  bountiesStamped: number;
}

interface ChallengeRow {
  id: string;
  community_id: string;
  stream_id: string | null;
  session_id: string | null;
  chapter: number | null;
  variable_type: "binary" | "placement" | "pickone" | "count";
  condition: Record<string, unknown>;
  reward: number | null;
  penalty: number | null;
  target_identity_id: string | null;
  status: string;
}

interface BountyRow {
  id: string;
  session_id: string | null;
  status: string;
}

/**
 * Run the fan-out. Pass the same `(sessionId, variableType, value)`
 * the market resolver received. The caller's responsibility:
 *   - Pass only AFTER the market's own payout has been written —
 *     this function does NOT settle markets, only the side-channels.
 *   - The fan-out is best-effort. A failure here logs but does not
 *     roll back the market resolution.
 */
export async function fanOutResolve(args: {
  sessionId: string;
  variableType: "binary" | "placement" | "pickone" | "count";
  value: string;
}): Promise<ResolveFanoutSummary> {
  const summary: ResolveFanoutSummary = {
    challengesResolved: 0,
    challengeRewards: 0,
    challengePenalties: 0,
    bountiesStamped: 0,
  };

  const admin = createServiceClient();

  // ---- Challenges ------------------------------------------------------
  const { data: challengesData } = await admin
    .from("gs_event_challenges")
    .select(
      "id, community_id, stream_id, session_id, chapter, variable_type, condition, reward, penalty, target_identity_id, status",
    )
    .eq("session_id", args.sessionId)
    .eq("status", "open")
    .eq("variable_type", args.variableType);
  const challenges = ((challengesData as ChallengeRow[] | null) ?? []) as ChallengeRow[];

  for (const ch of challenges) {
    const satisfied = evaluateCondition(
      args.variableType,
      ch.condition,
      args.value,
    );
    const outcome = satisfied ? "success" : "failure";

    // Auto-credit / debit ONLY when target_identity_id is set.
    // Open-target challenges resolve but skip payout — Spec 04 §5
    // (the host names the winner via a follow-up surface).
    let payoutEventId: number | null = null;
    if (ch.target_identity_id) {
      if (satisfied && ch.reward && ch.reward > 0) {
        const result = await credit({
          identityId: ch.target_identity_id,
          amount: ch.reward,
          type: "event_delta",
          ctx: {
            communityId: ch.community_id,
            streamId: ch.stream_id,
            sessionId: ch.session_id,
            chapter: ch.chapter,
            refId: ch.id,
            meta: { source: "event", trigger: "resolve", challenge_id: ch.id },
          },
        });
        if (result.ok) {
          summary.challengeRewards += ch.reward;
          payoutEventId = result.eventId ?? null;
        }
      } else if (!satisfied && ch.penalty && ch.penalty > 0) {
        const result = await spend({
          identityId: ch.target_identity_id,
          amount: ch.penalty,
          type: "event_delta",
          ctx: {
            communityId: ch.community_id,
            streamId: ch.stream_id,
            sessionId: ch.session_id,
            chapter: ch.chapter,
            refId: ch.id,
            meta: { source: "event", trigger: "resolve", challenge_id: ch.id },
          },
        });
        if (result.ok) {
          summary.challengePenalties += ch.penalty;
          payoutEventId = result.eventId ?? null;
        }
      }
    }

    await admin
      .from("gs_event_challenges")
      .update({
        status: "resolved",
        resolved_outcome: outcome,
        resolved_value: args.value,
        resolved_to: satisfied ? ch.target_identity_id : null,
        payout_event: payoutEventId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", ch.id);
    summary.challengesResolved += 1;
  }

  // ---- Bounties --------------------------------------------------------
  // Stamp resolved_value on every open bounty bound to this session.
  // We do NOT mint here — the streamer still names the winner via
  // `!gs bounty award @user`. Phase 2 satisfier-id auto-resolution
  // is deferred.
  const { data: bountyData } = await admin
    .from("gs_bounties")
    .select("id, session_id, status")
    .eq("session_id", args.sessionId)
    .eq("status", "open");
  const bounties = ((bountyData as BountyRow[] | null) ?? []) as BountyRow[];
  for (const b of bounties) {
    await admin
      .from("gs_bounties")
      .update({ resolved_value: args.value })
      .eq("id", b.id);
    summary.bountiesStamped += 1;
  }

  return summary;
}

/**
 * Evaluate a challenge condition against the resolver's reported
 * value. Mirrors `decideWinners` semantics in markets/lifecycle.ts.
 */
function evaluateCondition(
  variableType: "binary" | "placement" | "pickone" | "count",
  condition: Record<string, unknown>,
  rawValue: string,
): boolean {
  const trimmed = rawValue.trim().toLowerCase();

  if (variableType === "binary" || variableType === "pickone") {
    // condition: { value: 'red' } or { key: 'win' }
    const expected =
      ((condition.value as string | undefined) ?? "") ||
      ((condition.key as string | undefined) ?? "");
    return expected.toLowerCase() === trimmed;
  }

  if (variableType === "placement") {
    const placement = parseInt(trimmed, 10);
    if (!Number.isInteger(placement) || placement < 1) return false;
    // Accept placement-spec shape (`{ thresholds: [...] }`) or
    // simpler `{ max_position: N }`.
    if (isPlacementSpec(condition)) {
      const matched = condition.thresholds.some(
        (t) => placement <= t.max_position,
      );
      return matched;
    }
    const maxPos =
      typeof condition.max_position === "number"
        ? condition.max_position
        : null;
    if (maxPos !== null) return placement <= maxPos;
    return false;
  }

  if (variableType === "count") {
    const reported = parseInt(trimmed, 10);
    if (!Number.isInteger(reported)) return false;
    const over =
      typeof condition.over === "number" ? condition.over : null;
    const under =
      typeof condition.under === "number" ? condition.under : null;
    if (over !== null) return reported > over;
    if (under !== null) return reported < under;
    return false;
  }

  return false;
}
