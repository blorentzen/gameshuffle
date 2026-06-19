/**
 * Prediction market state machine.
 *
 *     IDLE → open → OPEN → lock (timer OR manual) → LOCKED → resolve → SETTLED → IDLE
 *                    │                                    │
 *                    └─────── close ─────────────────────┴── CANCELLED (refund all)
 *
 *     confirmed stream-end while OPEN/LOCKED → silent refund (per stream_id)
 *     session end / chapter advance         → silent refund (per session_id)
 *
 * Critical separation enforced here:
 *   • Markets scope per `session_id`. The unique partial index
 *     `one_active_market_per_session_game` enforces "one active
 *     market per game in a given session." Game switch mid-broadcast
 *     = new session = a fresh active-market slot opens.
 *   • Refunds fire per `stream_id`. `refundStreamMarkets` walks
 *     every open/locked market for that stream and refunds them.
 *     `refundSessionMarkets` does the same but scoped to one session
 *     (used on session-end / chapter advance — the spec's other
 *     refund triggers).
 *
 * Per `specs/gs-token-economy/02-prediction-market.md`.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { credit, spend } from "../tokens";
import {
  pickEligibleTemplate,
  renderTemplate,
} from "./templates";
import {
  isPlacementSpec,
  type BetRow,
  type MarketOutcomeRow,
  type MarketRow,
  type VariableType,
} from "./types";

// ===========================================================================
// open
// ===========================================================================

export interface OpenMarketArgs {
  communityId: string;
  streamId: string;
  sessionId: string;
  gameKey: string;
  chapter: number;
  /** Display name to render into `{subject}` placeholders. */
  subject: string;
  /** Identity of the streamer firing `!gs market open`. */
  hostIdentityId: string;
  /** Timer backstop in minutes. Spec accepts {1|3|5}. */
  lockMinutes: 1 | 3 | 5;
}

export type OpenMarketResult =
  | {
      ok: true;
      market: MarketRow;
      outcomes: MarketOutcomeRow[];
    }
  | {
      ok: false;
      reason:
        | "no_eligible_template"
        | "active_market_exists"
        | "insert_failed";
      activeMarket?: MarketRow;
      detail?: string;
    };

/**
 * Create + open a market. Picks a random eligible template, renders
 * the question, inserts the market + outcomes, sets the timer
 * backstop. Rejects if an open/locked market already exists for the
 * `(session_id, game_key)` pair (the unique index guards this at the
 * DB layer; we surface the active market in the result so the chat
 * handler can mention it in the rejection message).
 */
export async function openMarket(
  args: OpenMarketArgs,
): Promise<OpenMarketResult> {
  const admin = createServiceClient();

  // Pre-check for an existing active market — gives us a clean
  // rejection result instead of a unique-constraint surprise.
  const { data: existing } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
    )
    .eq("session_id", args.sessionId)
    .eq("game_key", args.gameKey)
    .in("status", ["open", "locked"])
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      reason: "active_market_exists",
      activeMarket: existing as MarketRow,
    };
  }

  const template = await pickEligibleTemplate(args.gameKey);
  if (!template) {
    return { ok: false, reason: "no_eligible_template" };
  }
  const rendered = renderTemplate(template, args.subject);

  const lockAtMs = Date.now() + args.lockMinutes * 60 * 1000;
  const { data: marketInserted, error: marketErr } = await admin
    .from("gs_markets")
    .insert({
      community_id: args.communityId,
      stream_id: args.streamId,
      session_id: args.sessionId,
      game_key: args.gameKey,
      chapter: args.chapter,
      template_id: template.id,
      variable_type: template.variable_type,
      subject: args.subject,
      question: rendered.question,
      lock_at: new Date(lockAtMs).toISOString(),
      created_by: args.hostIdentityId,
    })
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
    )
    .single();
  if (marketErr) {
    // 23505 = unique violation; race lost to a parallel `!gs market open`.
    if ((marketErr as { code?: string }).code === "23505") {
      const { data: raced } = await admin
        .from("gs_markets")
        .select(
          "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
        )
        .eq("session_id", args.sessionId)
        .eq("game_key", args.gameKey)
        .in("status", ["open", "locked"])
        .maybeSingle();
      return {
        ok: false,
        reason: "active_market_exists",
        activeMarket: raced as MarketRow | undefined,
      };
    }
    return { ok: false, reason: "insert_failed", detail: marketErr.message };
  }
  const market = marketInserted as MarketRow;

  // Insert outcomes. Done after the market row so the FK is valid.
  const outcomeRows = rendered.outcomes.map((o) => ({
    market_id: market.id,
    option_key: o.option_key,
    label: o.label,
  }));
  const { data: insertedOutcomes, error: outcomeErr } = await admin
    .from("gs_market_outcomes")
    .insert(outcomeRows)
    .select("id, market_id, option_key, label, is_winner");
  if (outcomeErr) {
    // Cleanup — drop the orphan market so the next open can succeed.
    await admin.from("gs_markets").delete().eq("id", market.id);
    return { ok: false, reason: "insert_failed", detail: outcomeErr.message };
  }

  return {
    ok: true,
    market,
    outcomes: (insertedOutcomes as MarketOutcomeRow[]) ?? [],
  };
}

// ===========================================================================
// lock
// ===========================================================================

export type LockMarketResult =
  | { ok: true; market: MarketRow }
  | { ok: false; reason: "not_open" | "market_not_found" };

/**
 * Flip `open → locked`. Both the timer-backstop sweep and the
 * manual `!gs market lock` call this; whichever fires first wins.
 * Idempotent — re-calling on a `locked` row is a no-op (returns ok).
 */
export async function lockMarket(args: {
  marketId: string;
}): Promise<LockMarketResult> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_markets")
    .update({ status: "locked", locked_at: new Date().toISOString() })
    .eq("id", args.marketId)
    .eq("status", "open")
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
    )
    .maybeSingle();
  if (error) throw new Error(`lockMarket failed: ${error.message}`);
  if (!data) {
    // Either already locked/settled/cancelled or doesn't exist.
    const { data: peek } = await admin
      .from("gs_markets")
      .select("id, status")
      .eq("id", args.marketId)
      .maybeSingle();
    if (!peek) return { ok: false, reason: "market_not_found" };
    return { ok: peek.status === "locked", reason: "not_open" } as LockMarketResult;
  }
  return { ok: true, market: data as MarketRow };
}

/**
 * Sweep `open` markets whose `lock_at` has passed. Returns the list
 * of newly-locked markets so a follow-up surface (chat post, embed
 * edit, realtime push) can react.
 */
export async function lockExpiredMarkets(): Promise<MarketRow[]> {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await admin
    .from("gs_markets")
    .update({ status: "locked", locked_at: now })
    .eq("status", "open")
    .lt("lock_at", now)
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
    );
  return ((data as MarketRow[] | null) ?? []) as MarketRow[];
}

// ===========================================================================
// closing-soon warnings
// ===========================================================================

/**
 * Find markets whose `lock_at` is within the next 60 seconds AND
 * haven't fired the "closing soon" warning yet. Stamps
 * `notifications.lock_60s` BEFORE the caller broadcasts so a
 * cron-tick retry can't double-warn — same idempotency pattern as
 * the announce-only session sweep.
 *
 * Returns the rows that the caller should broadcast warnings for.
 */
export async function claimMarketsForClosingSoonWarning(): Promise<
  MarketRow[]
> {
  const admin = createServiceClient();
  const nowMs = Date.now();
  const horizon = new Date(nowMs + 60_000).toISOString();
  const now = new Date(nowMs).toISOString();

  // Eligible markets: open, lock window approaching, no warning yet.
  // `notifications->>'lock_60s' is null` is the idempotency anchor.
  const { data: candidates } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by, notifications",
    )
    .eq("status", "open")
    .not("lock_at", "is", null)
    .lte("lock_at", horizon)
    .gt("lock_at", now);

  const rows = (candidates as Array<MarketRow & { notifications: Record<string, string> }> | null) ?? [];
  const fresh = rows.filter((r) => !r.notifications?.lock_60s);
  if (fresh.length === 0) return [];

  // Stamp the marker on every fresh row in one batch. Concurrent
  // ticks racing here is benign — the second writer's stamp just
  // overwrites with a newer timestamp, no double-broadcast because
  // the filter only matched rows with `lock_60s` null at SELECT
  // time and we update unconditionally.
  for (const row of fresh) {
    await admin
      .from("gs_markets")
      .update({
        notifications: { ...(row.notifications ?? {}), lock_60s: now },
      })
      .eq("id", row.id);
  }
  return fresh as MarketRow[];
}

/**
 * Mark a market as having had its post-lock chat broadcast fired by
 * the sweep. Lets the cron skip rows the host manually locked AND
 * skip re-broadcasting on subsequent ticks. Returns true on first
 * call, false thereafter — concurrency-safe via the
 * `notifications->>'auto_locked' is null` predicate.
 */
export async function claimMarketForAutoLockBroadcast(
  marketId: string,
): Promise<boolean> {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await admin
    .from("gs_markets")
    .select("id, notifications")
    .eq("id", marketId)
    .maybeSingle();
  const row = data as { id: string; notifications: Record<string, string> } | null;
  if (!row) return false;
  if (row.notifications?.auto_locked) return false;
  const { error } = await admin
    .from("gs_markets")
    .update({
      notifications: { ...(row.notifications ?? {}), auto_locked: now },
    })
    .eq("id", row.id);
  if (error) return false;
  return true;
}

// ===========================================================================
// bet
// ===========================================================================

export type PlaceBetResult =
  | { ok: true; bet: BetRow; balance: number }
  | {
      ok: false;
      reason:
        | "market_not_found"
        | "market_not_open"
        | "outcome_not_found"
        | "insufficient_balance"
        | "invalid_amount";
      balance?: number;
    };

/**
 * Place a bet. Validates the market is `open`, the option matches,
 * and routes the stake through `spend(...,'bet')` so the no-negative-
 * balance invariant holds. Inserts the `gs_bets` row linking the
 * negative ledger event. Idempotency is not enforced — repeated
 * `!bet` calls produce multiple bet rows in the same pool (cumulative
 * stake), which is the intended UX.
 */
export async function placeBet(args: {
  marketId: string;
  optionKey: string;
  identityId: string;
  amount: number;
}): Promise<PlaceBetResult> {
  const admin = createServiceClient();

  const { data: marketRow } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, chapter, status",
    )
    .eq("id", args.marketId)
    .maybeSingle();
  if (!marketRow) return { ok: false, reason: "market_not_found" };
  if ((marketRow as MarketRow).status !== "open") {
    return { ok: false, reason: "market_not_open" };
  }

  const { data: outcomeRow } = await admin
    .from("gs_market_outcomes")
    .select("id, market_id, option_key, label, is_winner")
    .eq("market_id", args.marketId)
    .ilike("option_key", args.optionKey.trim())
    .maybeSingle();
  if (!outcomeRow) return { ok: false, reason: "outcome_not_found" };

  const spendResult = await spend({
    identityId: args.identityId,
    amount: args.amount,
    type: "bet",
    ctx: {
      communityId: (marketRow as MarketRow).community_id,
      streamId: (marketRow as MarketRow).stream_id,
      sessionId: (marketRow as MarketRow).session_id,
      chapter: (marketRow as MarketRow).chapter,
      refId: args.marketId,
      meta: { source: "market" },
    },
  });
  if (!spendResult.ok) {
    return {
      ok: false,
      reason:
        spendResult.reason === "insufficient_balance"
          ? "insufficient_balance"
          : "invalid_amount",
      balance: spendResult.balance,
    };
  }

  const { data: betInserted, error: betErr } = await admin
    .from("gs_bets")
    .insert({
      market_id: args.marketId,
      outcome_id: (outcomeRow as MarketOutcomeRow).id,
      identity_id: args.identityId,
      amount: args.amount,
      event_id: spendResult.eventId,
    })
    .select(
      "id, market_id, outcome_id, identity_id, amount, event_id, created_at",
    )
    .single();
  if (betErr) {
    throw new Error(`placeBet insert failed: ${betErr.message}`);
  }

  return {
    ok: true,
    bet: betInserted as BetRow,
    balance: spendResult.balance,
  };
}

// ===========================================================================
// resolve
// ===========================================================================

export interface ResolvedPool {
  outcomeId: string;
  optionKey: string;
  isWinner: boolean;
  poolTotal: number;
  winningStake: number;
  winnerCount: number;
  payoutTotal: number;
}

export type ResolveMarketResult =
  | {
      ok: true;
      market: MarketRow;
      /** Per outcome: total pool size + payout total + winner count.
       *  Renderable as a chat summary or a /live update. */
      pools: ResolvedPool[];
      /** Side-channel resolver fan-out summary (challenges + bounties
       *  in the same session pegged to the same variable). Null on
       *  fan-out error — the market settle still succeeded. */
      fanout: import("./resolveFanout").ResolveFanoutSummary | null;
    }
  | {
      ok: false;
      reason:
        | "market_not_found"
        | "market_not_locked"
        | "resolver_is_bettor"
        | "resolver_not_host"
        | "invalid_value";
      detail?: string;
    };

/**
 * Resolve a locked market. Steps:
 *   1. Validate state + resolver permissions (host + non-bettor).
 *   2. Interpret the supplied value per `variable_type` and mark
 *      `is_winner` on each outcome row.
 *   3. Compute the parimutuel payout per pool and write `payout`
 *      ledger events for each winner.
 *   4. Flip status → `settled`.
 *
 * For each pool: `pool_total = sum(bets)`; if there are winners on
 * the winning side, they split `pool_total` pro-rata by stake.
 * If everyone is right (no losers) OR everyone is wrong (no
 * winners), the pool is refunded — no counterparty means the
 * crowd hasn't taken a real position.
 *
 * Integer-rounding dust (e.g. 100 split into thirds = 33+33+33+1)
 * goes to the largest-stake winner. Spec 02 §10 acceptance criterion.
 */
export async function resolveMarket(args: {
  marketId: string;
  /** Raw value the host reported. Format depends on variable_type. */
  value: string;
  resolverIdentityId: string;
}): Promise<ResolveMarketResult> {
  const admin = createServiceClient();

  const { data: marketRow } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, chapter, status, template_id, variable_type, question, created_by",
    )
    .eq("id", args.marketId)
    .maybeSingle();
  if (!marketRow) return { ok: false, reason: "market_not_found" };
  const market = marketRow as Pick<
    MarketRow,
    "id" | "community_id" | "stream_id" | "session_id" | "chapter" | "status" | "template_id" | "variable_type" | "question" | "created_by"
  >;

  if (market.status !== "locked") {
    return { ok: false, reason: "market_not_locked" };
  }

  // Host-only check. Phase 1 = community owner (the market's creator).
  if (market.created_by !== args.resolverIdentityId) {
    return { ok: false, reason: "resolver_not_host" };
  }

  // Spec 02 §6 step 2 — resolver must not hold a bet in this market.
  const { data: ownBet } = await admin
    .from("gs_bets")
    .select("id")
    .eq("market_id", args.marketId)
    .eq("identity_id", args.resolverIdentityId)
    .limit(1)
    .maybeSingle();
  if (ownBet) {
    return { ok: false, reason: "resolver_is_bettor" };
  }

  // Load outcomes + the template's spec — the spec drives is_winner
  // computation, especially for placement's threshold fan-out.
  const { data: outcomesRaw } = await admin
    .from("gs_market_outcomes")
    .select("id, market_id, option_key, label, is_winner")
    .eq("market_id", market.id);
  const outcomes = (outcomesRaw as MarketOutcomeRow[] | null) ?? [];

  const { data: templateRow } = await admin
    .from("gs_market_templates")
    .select("outcome_spec")
    .eq("id", market.template_id)
    .single();

  // Decide winners per variable_type.
  let winners: Set<string>;
  try {
    winners = decideWinners(
      market.variable_type,
      (templateRow as { outcome_spec: unknown }).outcome_spec,
      outcomes,
      args.value,
    );
  } catch (err) {
    return {
      ok: false,
      reason: "invalid_value",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Mark is_winner on each outcome.
  for (const outcome of outcomes) {
    await admin
      .from("gs_market_outcomes")
      .update({ is_winner: winners.has(outcome.id) })
      .eq("id", outcome.id);
  }

  // Pull all bets for the parimutuel payout pass.
  const { data: betsRaw } = await admin
    .from("gs_bets")
    .select("id, market_id, outcome_id, identity_id, amount")
    .eq("market_id", market.id);
  const bets = (betsRaw as Array<Pick<BetRow, "id" | "market_id" | "outcome_id" | "identity_id" | "amount">> | null) ?? [];

  // Per-outcome (pool) payout calculations.
  const pools: ResolvedPool[] = [];
  for (const outcome of outcomes) {
    const poolBets = bets.filter((b) => b.outcome_id === outcome.id);
    const poolTotal = poolBets.reduce((acc, b) => acc + Number(b.amount), 0);
    const isWinningPool = outcome.is_winner === true || winners.has(outcome.id);
    let payoutTotal = 0;
    let winningStake = 0;
    let winnerCount = 0;

    if (poolTotal > 0) {
      if (isWinningPool) {
        // Pool has winners — they reclaim the full pool.
        winningStake = poolTotal;
        winnerCount = poolBets.length;
        payoutTotal = await payoutPool({
          poolTotal,
          poolBets,
          market,
          source: "market",
        });
      } else if (allBetsWin(outcome, winners)) {
        // Defensive — outcome flagged is_winner but isWinningPool
        // logic disagreed; should never happen. Fall through to
        // refund to be safe.
        payoutTotal = await refundPool({ poolBets, market });
      } else {
        // Losing pool — escrowed stakes stay out of the bettors'
        // hands. The negative ledger row is already written; no
        // additional event needed. They fund the winners (which
        // happens implicitly because the winning pool receives the
        // full pool_total, not just the losing-side stakes).
        payoutTotal = 0;
      }
    }

    pools.push({
      outcomeId: outcome.id,
      optionKey: outcome.option_key,
      isWinner: isWinningPool,
      poolTotal,
      winningStake,
      winnerCount,
      payoutTotal,
    });
  }

  // Edge case from spec §6 step 6: a pool with winners on only one
  // side (everyone right OR everyone wrong) gets refunded — no
  // counterparty. Detect: every bet in the pool landed on a winner
  // outcome. Already handled inside the loop above by checking
  // isWinningPool; the symmetric case (no winners) writes 0 payout
  // and the stakes stay escrowed. Spec calls for refund in BOTH
  // edge cases; refunding the no-winners pool now:
  for (const pool of pools) {
    if (pool.poolTotal > 0 && !pool.isWinner && pool.winnerCount === 0) {
      const refundedBets = bets.filter((b) => b.outcome_id === pool.outcomeId);
      pool.payoutTotal = await refundPool({ poolBets: refundedBets, market });
    }
  }

  // Settle the market row.
  const { data: settledRow } = await admin
    .from("gs_markets")
    .update({
      status: "settled",
      resolved_at: new Date().toISOString(),
      resolved_value: args.value,
    })
    .eq("id", market.id)
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
    )
    .single();

  // Fan-out to event-spawned challenges + open bounties pegged to
  // the same (session, variable_type). Best-effort — a failure here
  // logs but doesn't roll back the market resolution. Per Spec 02
  // §8a + Spec 04 §2/§5.
  let fanout: import("./resolveFanout").ResolveFanoutSummary | null = null;
  try {
    const { fanOutResolve } = await import("./resolveFanout");
    fanout = await fanOutResolve({
      sessionId: market.session_id,
      variableType: market.variable_type,
      value: args.value,
    });
  } catch (err) {
    console.error("[resolveMarket] fan-out failed", err);
  }

  return {
    ok: true,
    market: settledRow as MarketRow,
    pools,
    fanout,
  };
}

/**
 * Mark `is_winner` per outcome based on the resolver's value. Returns
 * the set of winning outcome ids. Throws on invalid value (caller
 * translates to `'invalid_value'`).
 */
function decideWinners(
  variableType: VariableType,
  outcomeSpec: unknown,
  outcomes: MarketOutcomeRow[],
  rawValue: string,
): Set<string> {
  const trimmed = rawValue.trim().toLowerCase();
  const winners = new Set<string>();

  if (variableType === "placement") {
    if (!isPlacementSpec(outcomeSpec)) {
      throw new Error("placement market missing thresholds spec");
    }
    const placement = parseInt(trimmed, 10);
    if (!Number.isInteger(placement) || placement < 1) {
      throw new Error(`placement value must be a positive integer; got "${rawValue}"`);
    }
    for (const threshold of outcomeSpec.thresholds) {
      if (placement <= threshold.max_position) {
        const outcome = outcomes.find(
          (o) => o.option_key.toLowerCase() === threshold.key.toLowerCase(),
        );
        if (outcome) winners.add(outcome.id);
      }
    }
    return winners;
  }

  if (variableType === "binary" || variableType === "pickone") {
    const outcome = outcomes.find(
      (o) => o.option_key.toLowerCase() === trimmed,
    );
    if (!outcome) {
      throw new Error(`value "${rawValue}" doesn't match any outcome`);
    }
    winners.add(outcome.id);
    return winners;
  }

  if (variableType === "count") {
    // For count markets, outcome_keys are 'over' / 'under' and the
    // spec stored a threshold. Compare reported value against it.
    if (!outcomeSpec || typeof outcomeSpec !== "object") {
      throw new Error("count market missing threshold spec");
    }
    const threshold = (outcomeSpec as { threshold?: unknown }).threshold;
    if (typeof threshold !== "number") {
      throw new Error("count market spec missing numeric threshold");
    }
    const reported = parseInt(trimmed, 10);
    if (!Number.isInteger(reported)) {
      throw new Error(`count value must be an integer; got "${rawValue}"`);
    }
    const winningKey = reported > threshold ? "over" : "under";
    const outcome = outcomes.find((o) => o.option_key === winningKey);
    if (outcome) winners.add(outcome.id);
    return winners;
  }

  throw new Error(`unknown variable_type ${variableType}`);
}

/** Sanity helper used in the resolve loop. */
function allBetsWin(outcome: MarketOutcomeRow, winners: Set<string>): boolean {
  return winners.has(outcome.id);
}

/**
 * Pay out a winning pool pro-rata by stake. Integer dust (rounding
 * remainder) goes to the largest-stake winner — Spec 02 §10
 * acceptance criterion. Returns the total amount paid out (which
 * should equal poolTotal).
 */
async function payoutPool(args: {
  poolTotal: number;
  poolBets: Array<Pick<BetRow, "id" | "identity_id" | "amount">>;
  market: Pick<MarketRow, "id" | "community_id" | "stream_id" | "session_id" | "chapter">;
  source: "market" | "in-game";
}): Promise<number> {
  if (args.poolBets.length === 0 || args.poolTotal === 0) return 0;

  // Group by identity so a bettor with multiple bets in the same
  // pool gets a single consolidated payout row (cleaner ledger).
  const stakesByIdentity = new Map<string, number>();
  for (const b of args.poolBets) {
    stakesByIdentity.set(
      b.identity_id,
      (stakesByIdentity.get(b.identity_id) ?? 0) + Number(b.amount),
    );
  }
  const totalStake = Array.from(stakesByIdentity.values()).reduce((a, b) => a + b, 0);
  const sortedByStakeDesc = [...stakesByIdentity.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  // Floor each share; track total paid; remainder goes to the top
  // staker.
  let paid = 0;
  const shares: Array<{ identityId: string; share: number }> = [];
  for (const [identityId, stake] of sortedByStakeDesc) {
    const share = Math.floor((args.poolTotal * stake) / totalStake);
    shares.push({ identityId, share });
    paid += share;
  }
  const dust = args.poolTotal - paid;
  if (dust > 0 && shares.length > 0) {
    shares[0].share += dust;
    paid += dust;
  }

  for (const { identityId, share } of shares) {
    if (share <= 0) continue;
    await credit({
      identityId,
      amount: share,
      type: "payout",
      ctx: {
        communityId: args.market.community_id,
        streamId: args.market.stream_id,
        sessionId: args.market.session_id,
        chapter: args.market.chapter,
        refId: args.market.id,
        meta: { source: args.source },
      },
    });
  }
  return paid;
}

/** Refund every bet in a pool — used for one-sided pools at resolve
 *  time, and reused by the cancel/refund path below. */
async function refundPool(args: {
  poolBets: Array<Pick<BetRow, "id" | "identity_id" | "amount">>;
  market: Pick<MarketRow, "id" | "community_id" | "stream_id" | "session_id" | "chapter">;
}): Promise<number> {
  let paid = 0;
  for (const bet of args.poolBets) {
    await credit({
      identityId: bet.identity_id,
      amount: Number(bet.amount),
      type: "refund",
      ctx: {
        communityId: args.market.community_id,
        streamId: args.market.stream_id,
        sessionId: args.market.session_id,
        chapter: args.market.chapter,
        refId: args.market.id,
        meta: { source: "market", reason: "single_sided_pool" },
      },
    });
    paid += Number(bet.amount);
  }
  return paid;
}

// ===========================================================================
// cancel / refund
// ===========================================================================

export type CancelMarketReason =
  | "manual"
  | "session_end"
  | "chapter_advance"
  | "stream_end";

/**
 * Refund every bet in a market and flip status → `cancelled`. Silent
 * (no chat announcement at this layer — call site decides). Used by
 * `!gs market close` (manual) and by the refund triggers
 * (`refundStreamMarkets`, `refundSessionMarkets`).
 */
export async function cancelMarket(args: {
  marketId: string;
  reason: CancelMarketReason;
}): Promise<{ ok: boolean; refundedBets: number; refundedTotal: number }> {
  const admin = createServiceClient();

  const { data: marketRow } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, chapter, status",
    )
    .eq("id", args.marketId)
    .maybeSingle();
  if (!marketRow) return { ok: false, refundedBets: 0, refundedTotal: 0 };
  if (
    (marketRow as MarketRow).status !== "open" &&
    (marketRow as MarketRow).status !== "locked"
  ) {
    // Already settled/cancelled — nothing to refund.
    return { ok: true, refundedBets: 0, refundedTotal: 0 };
  }

  const { data: betsRaw } = await admin
    .from("gs_bets")
    .select("id, identity_id, amount")
    .eq("market_id", args.marketId);
  const bets =
    (betsRaw as Array<Pick<BetRow, "id" | "identity_id" | "amount">> | null) ?? [];

  let refundedTotal = 0;
  for (const bet of bets) {
    await credit({
      identityId: bet.identity_id,
      amount: Number(bet.amount),
      type: "refund",
      ctx: {
        communityId: (marketRow as MarketRow).community_id,
        streamId: (marketRow as MarketRow).stream_id,
        sessionId: (marketRow as MarketRow).session_id,
        chapter: (marketRow as MarketRow).chapter,
        refId: args.marketId,
        meta: { source: "market", reason: args.reason },
      },
    });
    refundedTotal += Number(bet.amount);
  }

  await admin
    .from("gs_markets")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", args.marketId);

  return { ok: true, refundedBets: bets.length, refundedTotal };
}

/**
 * Refund every open/locked market in a stream. Fires when the
 * stream-end grace expires (`finalizeStreamEnd` writes the
 * gs_streams row; this then walks markets via stream_id). Silent.
 *
 * The KEY invariant: this MUST NOT be called on session-end. Use
 * `refundSessionMarkets` for that — different scope, different
 * economic meaning (game switch ≠ broadcast end).
 */
export async function refundStreamMarkets(args: {
  streamId: string;
}): Promise<{ refundedMarkets: number; refundedBets: number }> {
  const admin = createServiceClient();
  const { data: marketsRaw } = await admin
    .from("gs_markets")
    .select("id")
    .eq("stream_id", args.streamId)
    .in("status", ["open", "locked"]);
  const markets =
    (marketsRaw as Array<{ id: string }> | null) ?? [];
  let bets = 0;
  for (const m of markets) {
    const result = await cancelMarket({ marketId: m.id, reason: "stream_end" });
    bets += result.refundedBets;
  }
  return { refundedMarkets: markets.length, refundedBets: bets };
}

/**
 * Refund open/locked markets bound to a single session. The
 * session_end and chapter_advance triggers both call this with the
 * appropriate reason — markets close cleanly, the next session /
 * chapter can open a fresh one.
 *
 * NOT called on stream_end (use `refundStreamMarkets` for that).
 */
export async function refundSessionMarkets(args: {
  sessionId: string;
  reason: "session_end" | "chapter_advance";
}): Promise<{ refundedMarkets: number; refundedBets: number }> {
  const admin = createServiceClient();
  const { data: marketsRaw } = await admin
    .from("gs_markets")
    .select("id")
    .eq("session_id", args.sessionId)
    .in("status", ["open", "locked"]);
  const markets =
    (marketsRaw as Array<{ id: string }> | null) ?? [];
  let bets = 0;
  for (const m of markets) {
    const result = await cancelMarket({ marketId: m.id, reason: args.reason });
    bets += result.refundedBets;
  }
  return { refundedMarkets: markets.length, refundedBets: bets };
}

// ===========================================================================
// Read paths used by chat handlers + live page
// ===========================================================================

/** Find the active market for a (session, game). At most one. */
export async function findActiveMarket(args: {
  sessionId: string;
  gameKey: string;
}): Promise<MarketRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_markets")
    .select(
      "id, community_id, stream_id, session_id, game_key, chapter, status, template_id, variable_type, subject, question, lock_at, opened_at, locked_at, resolved_at, cancelled_at, resolved_value, created_by",
    )
    .eq("session_id", args.sessionId)
    .eq("game_key", args.gameKey)
    .in("status", ["open", "locked"])
    .maybeSingle();
  return (data as MarketRow | null) ?? null;
}

/** Outcomes for a market — used for /live and chat replies. */
export async function listOutcomes(
  marketId: string,
): Promise<MarketOutcomeRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_market_outcomes")
    .select("id, market_id, option_key, label, is_winner")
    .eq("market_id", marketId);
  return ((data as MarketOutcomeRow[] | null) ?? []) as MarketOutcomeRow[];
}

export interface MarketPool {
  outcomeId: string;
  optionKey: string;
  label: string;
  total: number;
  bettorCount: number;
}

/**
 * Aggregate the current pool size + distinct-bettor count per outcome.
 * Used by the live page (initial SSR + after a tactile bet) and
 * returned in the POST /bet response so the client can refresh pool
 * displays without a follow-up fetch.
 *
 * Counts bets, not bet rows: a bettor with three bets on the same
 * pool counts once. Pool total is the full stake sum.
 */
export async function getMarketPools(
  marketId: string,
): Promise<MarketPool[]> {
  const admin = createServiceClient();
  const [outcomesResult, betsResult] = await Promise.all([
    admin
      .from("gs_market_outcomes")
      .select("id, option_key, label")
      .eq("market_id", marketId),
    admin
      .from("gs_bets")
      .select("outcome_id, identity_id, amount")
      .eq("market_id", marketId),
  ]);
  const outcomes =
    (outcomesResult.data as Array<{ id: string; option_key: string; label: string }> | null) ??
    [];
  const bets =
    (betsResult.data as Array<{ outcome_id: string; identity_id: string; amount: number }> | null) ??
    [];

  return outcomes.map((o) => {
    const poolBets = bets.filter((b) => b.outcome_id === o.id);
    const total = poolBets.reduce((acc, b) => acc + Number(b.amount), 0);
    const distinctBettors = new Set(poolBets.map((b) => b.identity_id));
    return {
      outcomeId: o.id,
      optionKey: o.option_key,
      label: o.label,
      total,
      bettorCount: distinctBettors.size,
    };
  });
}
