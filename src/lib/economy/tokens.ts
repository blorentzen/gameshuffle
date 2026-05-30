/**
 * Token layer — Spec 01 §3.2–§3.8.
 *
 * Thin wrappers around the atomic PL/pgSQL helpers in the M1 migration.
 * Why server-side functions: the no-negative-balance invariant requires
 * balance-check + insert to happen inside one transaction under a
 * per-identity advisory lock. PostgREST cannot express that from JS;
 * the SQL functions can.
 *
 * Every wager / transfer MUST go through `spend` — it's the single
 * guarded path that decrements balance. Every grant / payout / earn
 * goes through `credit` (or `awardEarning` if the daily ceiling +
 * new-community bonus need to apply).
 *
 * ⚠️ CLOSED LOOP (Spec 07 §1, README rule 10). The credit path MUST
 * NOT be invoked from any code that accepts money (Stripe webhooks,
 * subscription handlers, etc.). Audited at the time of writing —
 * `src/app/api/stripe/*` routes do not import this module. Any
 * future code that creates a money→token bridge breaks the
 * closed-loop classification on which the economy's "entertainment,
 * not gambling" posture depends. Don't.
 *
 * `meta.source` convention for the leaderboard split:
 *   - `'market'`   — payouts from prediction markets
 *   - `'in-game'`  — payouts tied to gameplay outcomes (placement,
 *                    secret-mission completion, etc.)
 * The /live/[slug] leaderboard splits "Player" (in-game) vs "Crowd"
 * (market) tracks by filtering on this tag. The Event System (Spec
 * 04) will add `'event'` here for `event_delta` payouts.
 *
 * Per `specs/gs-token-economy/01-economy-identity-spine.md`.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source flavor for `token_events.meta` — drives the leaderboard
 *  Player / Crowd split. Tag at write time so the read paths can
 *  filter cheaply. */
export type EconomySource =
  | "market"
  | "in-game"
  | "transfer"
  | "grant"
  | "event"
  | "award";

export interface TokenContext {
  communityId?: string | null;
  streamId?: string | null;
  sessionId?: string | null;
  chapter?: number | null;
  /** Trace pointer — market_id, hand_id, transfer correlation, etc. */
  refId?: string | null;
  /** Arbitrary observability tags. `source` tag drives leaderboard
   *  filtering; `action_key` distinguishes earn types. */
  meta?: Record<string, unknown>;
}

/** Negative-side ledger types. `event_delta` lives on both sides:
 *  a negative event consequence uses `spend('event_delta', ...)`; a
 *  positive one uses `credit('event_delta', ...)`. */
export type SpendType = "bet" | "transfer_out" | "chaos_burn" | "event_delta";
export type CreditType =
  | "grant_start"
  | "grant_bust"
  | "earn_t1"
  | "earn_t2"
  | "earn_newcommunity"
  | "payout"
  | "transfer_in"
  | "refund"
  | "award_mint"
  | "event_delta";

interface SpendResult {
  ok: boolean;
  balance: number;
  eventId?: number;
  /** When `ok: false`. */
  reason?: "insufficient_balance" | "invalid_amount" | string;
}

interface CreditResult {
  ok: boolean;
  balance: number;
  eventId?: number;
  reason?: string;
}

interface TransferResult {
  ok: boolean;
  fromBalance?: number;
  toBalance?: number;
  refId?: string;
  reason?: "self_transfer" | "invalid_amount" | "insufficient_balance" | string;
}

interface AwardEarningResult {
  ok: boolean;
  tieredAwarded: number;
  newCommunityAwarded: number;
  balance: number;
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * Derive an identity's current balance from the ledger. Never cached
 * across the request — always reads fresh. Request-scoped caching
 * (memoizing within one handler) is fine; persistent caching is
 * NOT, per Spec 01 §3.2.
 */
export async function getBalance(identityId: string): Promise<number> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_balance", {
    p_identity_id: identityId,
  });
  if (error) {
    throw new Error(`gs_balance failed: ${error.message}`);
  }
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------------
// Spend — the guarded write
// ---------------------------------------------------------------------------

/**
 * The ONLY path that removes tokens from a balance. Returns
 * `{ ok: false, reason: 'insufficient_balance' }` when the spend
 * would push the balance below zero — callers translate that into
 * a user-facing rejection. Concurrent spends on the same identity
 * serialize at the DB layer via advisory lock.
 *
 * @param amount POSITIVE magnitude (will be inserted as negative
 *               into `token_events.amount`)
 */
export async function spend(args: {
  identityId: string;
  amount: number;
  type: SpendType;
  ctx?: TokenContext;
}): Promise<SpendResult> {
  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    return { ok: false, balance: 0, reason: "invalid_amount" };
  }
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_spend", {
    p_identity_id: args.identityId,
    p_amount: args.amount,
    p_type: args.type,
    p_community_id: args.ctx?.communityId ?? null,
    p_stream_id: args.ctx?.streamId ?? null,
    p_session_id: args.ctx?.sessionId ?? null,
    p_chapter: args.ctx?.chapter ?? null,
    p_ref_id: args.ctx?.refId ?? null,
    p_meta: args.ctx?.meta ?? null,
  });
  if (error) {
    throw new Error(`gs_spend failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    balance: number;
    event_id?: number;
    reason?: string;
  };
  return {
    ok: result.ok,
    balance: Number(result.balance ?? 0),
    eventId: result.event_id,
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// Credit — positive write (grants, payouts, refunds)
// ---------------------------------------------------------------------------

/**
 * Positive-side ledger write. Use for payouts, refunds, and the two
 * grant types. Earn paths that need the daily-ceiling enforcement
 * should call `awardEarning` instead.
 */
export async function credit(args: {
  identityId: string;
  amount: number;
  type: CreditType;
  ctx?: TokenContext;
}): Promise<CreditResult> {
  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    return { ok: false, balance: 0, reason: "invalid_amount" };
  }
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_credit", {
    p_identity_id: args.identityId,
    p_amount: args.amount,
    p_type: args.type,
    p_community_id: args.ctx?.communityId ?? null,
    p_stream_id: args.ctx?.streamId ?? null,
    p_session_id: args.ctx?.sessionId ?? null,
    p_chapter: args.ctx?.chapter ?? null,
    p_ref_id: args.ctx?.refId ?? null,
    p_meta: args.ctx?.meta ?? null,
  });
  if (error) {
    throw new Error(`gs_credit failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    balance: number;
    event_id?: number;
    reason?: string;
  };
  return {
    ok: result.ok,
    balance: Number(result.balance ?? 0),
    eventId: result.event_id,
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// Transfer — !give
// ---------------------------------------------------------------------------

/**
 * Zero-sum movement between two identities. Both legs run inside the
 * same DB transaction — if the sender doesn't have enough balance,
 * neither leg writes. Rejects self-transfers and non-positive amounts.
 */
export async function transfer(args: {
  fromIdentityId: string;
  toIdentityId: string;
  amount: number;
  ctx?: Pick<TokenContext, "communityId" | "meta">;
}): Promise<TransferResult> {
  if (!Number.isInteger(args.amount) || args.amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (args.fromIdentityId === args.toIdentityId) {
    return { ok: false, reason: "self_transfer" };
  }
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_transfer", {
    p_from_id: args.fromIdentityId,
    p_to_id: args.toIdentityId,
    p_amount: args.amount,
    p_community_id: args.ctx?.communityId ?? null,
    p_meta: { source: "transfer", ...(args.ctx?.meta ?? {}) },
  });
  if (error) {
    throw new Error(`gs_transfer failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    from_balance?: number;
    to_balance?: number;
    ref_id?: string;
    reason?: string;
    balance?: number; // when spend-leg rejection short-circuits
  };
  return {
    ok: result.ok,
    fromBalance: result.from_balance ?? result.balance,
    toBalance: result.to_balance,
    refId: result.ref_id,
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// awardEarning — the earning engine
// ---------------------------------------------------------------------------

/**
 * Tiered participation rewards with daily-ceiling + new-community
 * bonus enforcement. Tier semantics:
 *   - `'t1'` — outcome-gated reward (won a race, completed a mission,
 *              correctly predicted a market). Higher reward.
 *   - `'t2'` — participation reward (joined the lobby, placed a vote).
 *              Capped at the first N per session via config.
 *
 * The new-community bonus always fires on first interaction with a
 * community, even if the daily ceiling is already exhausted — it's
 * an exploration incentive, not a participation reward. Returns the
 * two awards separately so callers can render both.
 *
 * @param actionKey  Stable string identifier for the action — used
 *                   for per-action overrides via the
 *                   `earn_action_<key>` config and for observability.
 */
export async function awardEarning(args: {
  identityId: string;
  tier: "t1" | "t2";
  actionKey: string;
  communityId: string;
  streamId?: string | null;
  sessionId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<AwardEarningResult> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_award_earning", {
    p_identity_id: args.identityId,
    p_tier: args.tier,
    p_action_key: args.actionKey,
    p_community_id: args.communityId,
    p_stream_id: args.streamId ?? null,
    p_session_id: args.sessionId ?? null,
    p_meta: args.meta ?? null,
  });
  if (error) {
    throw new Error(`gs_award_earning failed: ${error.message}`);
  }
  const result = data as {
    ok: boolean;
    tiered_awarded: number;
    new_community_awarded: number;
    balance: number;
  };
  return {
    ok: result.ok,
    tieredAwarded: Number(result.tiered_awarded ?? 0),
    newCommunityAwarded: Number(result.new_community_awarded ?? 0),
    balance: Number(result.balance ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Bust recovery cron
// ---------------------------------------------------------------------------

/**
 * Daily faucet for identities below the bust floor. Idempotent per
 * UTC day — re-running on the same day grants zero. Returns the
 * count of identities granted so the cron run can log it. Driven by
 * a Vercel cron or Supabase scheduled function configured separately.
 */
export async function runBustRecovery(): Promise<{ granted: number }> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("gs_bust_recovery");
  if (error) {
    throw new Error(`gs_bust_recovery failed: ${error.message}`);
  }
  return { granted: Number(data ?? 0) };
}

// ---------------------------------------------------------------------------
// Amount parsing — shared across every command that takes an amount
// ---------------------------------------------------------------------------

/**
 * Per Spec 03 §1 universal arg parsing: amounts accept positive
 * integers, `N%` of caller balance, or `all`. Returns the resolved
 * integer amount, or null when the input doesn't parse.
 *
 * @param input    Raw amount token (`'100'`, `'50%'`, `'all'`).
 * @param balance  Caller's current balance — required to resolve
 *                 percentage and `all`.
 */
export function parseAmount(
  input: string,
  balance: number,
): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "all") {
    return balance > 0 ? balance : null;
  }
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(trimmed);
  if (pct) {
    const fraction = Number(pct[1]) / 100;
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return null;
    const resolved = Math.floor(balance * fraction);
    return resolved > 0 ? resolved : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }
  return null;
}
