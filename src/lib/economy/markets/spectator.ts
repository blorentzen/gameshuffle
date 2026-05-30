/**
 * Spectator picks — Spec 07 §4.
 *
 * Restricted-region viewers participate in markets without staking
 * tokens. The viewer picks an outcome (badge / visual / social
 * presence) but no escrow happens and the resolver's parimutuel
 * split ignores them.
 *
 * Implementation: a parallel `gs_market_predictions` table holds
 * the spectator picks. `gs_bets` continues to hold the real
 * stakes. The resolver (Spec 02 §6) reads `gs_bets` only — payouts
 * are computed over real escrow, spectators are display-only.
 *
 * Per spec: spectators "cannot change their pick after submitting"
 * — enforced by the (market_id, identity_id) unique index, which
 * surfaces as a `unique_violation` on a re-pick attempt.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { MarketOutcomeRow, MarketRow } from "./types";

export type PlaceSpectatorResult =
  | {
      ok: true;
      prediction: {
        id: string;
        marketId: string;
        outcomeId: string;
        optionKey: string;
      };
    }
  | {
      ok: false;
      reason:
        | "market_not_found"
        | "market_not_open"
        | "outcome_not_found"
        | "already_picked";
    };

export async function placeSpectatorPick(args: {
  marketId: string;
  optionKey: string;
  identityId: string;
}): Promise<PlaceSpectatorResult> {
  const admin = createServiceClient();

  const { data: marketRow } = await admin
    .from("gs_markets")
    .select("id, status")
    .eq("id", args.marketId)
    .maybeSingle();
  if (!marketRow) return { ok: false, reason: "market_not_found" };
  if ((marketRow as Pick<MarketRow, "status">).status !== "open") {
    return { ok: false, reason: "market_not_open" };
  }

  const { data: outcomeRow } = await admin
    .from("gs_market_outcomes")
    .select("id, option_key")
    .eq("market_id", args.marketId)
    .ilike("option_key", args.optionKey.trim())
    .maybeSingle();
  if (!outcomeRow) return { ok: false, reason: "outcome_not_found" };
  const outcome = outcomeRow as Pick<MarketOutcomeRow, "id" | "option_key">;

  const { data: inserted, error } = await admin
    .from("gs_market_predictions")
    .insert({
      market_id: args.marketId,
      outcome_id: outcome.id,
      identity_id: args.identityId,
    })
    .select("id, market_id, outcome_id, identity_id")
    .maybeSingle();
  if (error) {
    // 23505 — unique (market_id, identity_id). Per Spec 07 §4
    // ("cannot change their pick after submitting").
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, reason: "already_picked" };
    }
    throw new Error(`placeSpectatorPick failed: ${error.message}`);
  }
  return {
    ok: true,
    prediction: {
      id: (inserted as { id: string }).id,
      marketId: args.marketId,
      outcomeId: outcome.id,
      optionKey: outcome.option_key,
    },
  };
}

/**
 * Spectator pick lookup for the /live page UI — same shape as
 * `getMarketPools` but counting spectator predictions instead of
 * staked bets.
 */
export interface SpectatorTally {
  outcomeId: string;
  optionKey: string;
  label: string;
  pickerCount: number;
}

export async function getSpectatorTally(
  marketId: string,
): Promise<SpectatorTally[]> {
  const admin = createServiceClient();
  const [outcomesResult, predictionsResult] = await Promise.all([
    admin
      .from("gs_market_outcomes")
      .select("id, option_key, label")
      .eq("market_id", marketId),
    admin
      .from("gs_market_predictions")
      .select("outcome_id, identity_id")
      .eq("market_id", marketId),
  ]);
  const outcomes =
    (outcomesResult.data as Array<{ id: string; option_key: string; label: string }> | null) ??
    [];
  const predictions =
    (predictionsResult.data as Array<{ outcome_id: string; identity_id: string }> | null) ??
    [];

  return outcomes.map((o) => {
    const distinct = new Set(
      predictions.filter((p) => p.outcome_id === o.id).map((p) => p.identity_id),
    );
    return {
      outcomeId: o.id,
      optionKey: o.option_key,
      label: o.label,
      pickerCount: distinct.size,
    };
  });
}
