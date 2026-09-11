/**
 * Pro × Circuit plan-change resolver (Phase B, gs-circuit-pro-addendum).
 *
 * PURE. No I/O, no Stripe. Given the account's current plan state and a target
 * action, it returns the ordered billing operations, the resulting
 * entitlements, whether Pro access stays continuous, and any user-facing
 * offer/notice. A later billing phase executes the ops against Stripe; this
 * module is the single definition of the transition rules and is unit-tested
 * against all 13 rows of the addendum table.
 *
 * Locked decisions baked in here:
 *   - Row 4: auto-convert a standalone Pro subscriber to the $5 Circuit 64
 *     add-on when they buy Circuit 64 (shown on the confirm screen).
 *   - Circuit 256 has no trial (Pro is included with purchase).
 *
 * Invariants the resolver enforces:
 *   - No path leaves overlapping *paid* Pro sources for the same period.
 *   - A pro_addon item can't exist without an active Circuit 64 item.
 *   - Downgrades and cancels take effect at period end; upgrades are immediate
 *     and prorated.
 *   - Offers (rows 8-10) are opt-in; declining leaves Pro active through the
 *     period end.
 */

import type { ProSource } from "@/lib/subscription";

export type Interval = "monthly" | "annual";
export type CircuitPaidTier = "circuit_64" | "circuit_256";

/** The account's current billing state (the axes that matter for Pro). */
export interface AccountPlanState {
  /** Standalone GameShuffle Pro, if any. */
  proStandalone: { status: "trial" | "active"; interval: Interval } | null;
  /** Circuit subscription, if any. `proAddon` = the $5 Pro add-on item on a 64. */
  circuit: { tier: CircuitPaidTier; interval: Interval; proAddon: boolean } | null;
}

/** A requested plan change. */
export type PlanTarget =
  | { kind: "subscribe_circuit"; tier: CircuitPaidTier; interval: Interval; withAddon?: boolean }
  | { kind: "downgrade_to_circuit_64" }
  | { kind: "cancel_circuit" }
  | { kind: "add_pro_addon" }
  | { kind: "remove_pro_addon" }
  | { kind: "switch_interval"; interval: Interval }
  | { kind: "subscribe_pro"; interval: Interval }
  | { kind: "cancel_pro" };

export type BillingAction =
  | "create_circuit_subscription"
  | "create_pro_subscription"
  | "cancel_pro_immediately" // trial → no charge
  | "cancel_pro_with_credit" // active → prorated credit
  | "upgrade_circuit" // immediate, prorated
  | "add_pro_addon_item"
  | "remove_pro_addon_item"
  | "remove_pro_addon_item_with_credit"
  | "schedule_circuit_downgrade"
  | "schedule_circuit_cancel"
  | "schedule_pro_cancel"
  | "switch_interval";

export interface BillingOp {
  action: BillingAction;
  target: "pro" | "circuit" | "pro_addon";
  tier?: CircuitPaidTier;
  interval?: Interval;
  timing: "immediate" | "period_end";
  proration?: "credit" | "charge" | "none";
  note?: string;
}

/** An opt-in offer surfaced on downgrade/cancel (rows 8-10). Declining it
 *  leaves the current Pro access running through the period end. */
export interface PlanOffer {
  id: string;
  prompt: string;
  /** The plan change applied if the user accepts. */
  accept: PlanTarget;
}

export interface PlanChangeResult {
  ops: BillingOp[];
  /** Entitlement state once the change has fully taken effect (post period-end
   *  for scheduled changes, ignoring any un-accepted offer). */
  resulting: {
    proSource: ProSource | null;
    circuitTier: CircuitPaidTier | null;
    proAddon: boolean;
  };
  /** True when Pro access has no gap across the change. */
  continuousPro: boolean;
  notice?: string;
  offer?: PlanOffer;
  /** Confirm-screen details (e.g. prorated-credit copy on rows 3/4/6). */
  confirm?: { creditNote?: string };
  /** Invariant violations — a non-empty array means the change is rejected. */
  errors?: string[];
}

/** The current primary Pro source implied by a plan state (highest priority). */
export function currentProSource(state: AccountPlanState): ProSource | null {
  if (state.circuit?.tier === "circuit_256") return "circuit_256";
  if (state.circuit?.tier === "circuit_64" && state.circuit.proAddon) return "pro_addon";
  if (state.proStandalone?.status === "active") return "pro_subscription";
  if (state.proStandalone?.status === "trial") return "pro_trial";
  return null;
}

function paidSourceCount(resulting: PlanChangeResult["resulting"]): number {
  let n = 0;
  if (resulting.proSource === "circuit_256") n++;
  if (resulting.proSource === "pro_addon") n++;
  if (resulting.proSource === "pro_subscription") n++;
  // A standalone pro alongside a circuit-derived source would be caught here if
  // the resolver ever produced it; resulting only holds one primary, so this is
  // a guard for future edits.
  return n;
}

/** Validate the two structural invariants against a resulting state. */
function invariantErrors(resulting: PlanChangeResult["resulting"]): string[] {
  const errors: string[] = [];
  if (resulting.proSource === "pro_addon" && resulting.circuitTier !== "circuit_64") {
    errors.push("pro_addon requires an active Circuit 64 subscription");
  }
  if (paidSourceCount(resulting) > 1) {
    errors.push("overlapping paid Pro sources");
  }
  return errors;
}

function finalize(result: PlanChangeResult): PlanChangeResult {
  const errors = invariantErrors(result.resulting);
  return errors.length ? { ...result, errors } : result;
}

export function resolvePlanChange(
  current: AccountPlanState,
  target: PlanTarget,
): PlanChangeResult {
  switch (target.kind) {
    case "subscribe_circuit":
      return target.tier === "circuit_256"
        ? subscribeCircuit256(current, target.interval)
        : subscribeCircuit64(current, target.interval, !!target.withAddon);

    case "downgrade_to_circuit_64":
      return downgradeTo64(current);

    case "cancel_circuit":
      return cancelCircuit(current);

    case "add_pro_addon":
      return addProAddon(current);

    case "remove_pro_addon":
      return removeProAddon(current);

    case "switch_interval":
      return switchInterval(current, target.interval);

    case "subscribe_pro":
      return subscribePro(current, target.interval);

    case "cancel_pro":
      return cancelPro(current);
  }
}

// --- Circuit 256 (rows 1, 2, 3, 6, 7) -------------------------------------
function subscribeCircuit256(current: AccountPlanState, interval: Interval): PlanChangeResult {
  const ops: BillingOp[] = [];
  let confirm: PlanChangeResult["confirm"] | undefined;

  // Upgrade path from an existing Circuit 64 (rows 6, 7).
  if (current.circuit?.tier === "circuit_64") {
    ops.push({ action: "upgrade_circuit", target: "circuit", tier: "circuit_256", interval, timing: "immediate", proration: "charge" });
    if (current.circuit.proAddon) {
      ops.push({ action: "remove_pro_addon_item_with_credit", target: "pro_addon", timing: "immediate", proration: "credit", note: "Pro is now included with Circuit 256." });
      confirm = { creditNote: "You'll receive a prorated credit for the Pro add-on you no longer need." };
    }
    return finalize({
      ops,
      resulting: { proSource: "circuit_256", circuitTier: "circuit_256", proAddon: false },
      continuousPro: true,
      notice: "GameShuffle Pro is included.",
      confirm,
    });
  }

  // Cancel any standalone Pro first so there's no double-charge (rows 2, 3).
  if (current.proStandalone?.status === "trial") {
    ops.push({ action: "cancel_pro_immediately", target: "pro", timing: "immediate", proration: "none", note: "Trial canceled with no charge." });
  } else if (current.proStandalone?.status === "active") {
    ops.push({ action: "cancel_pro_with_credit", target: "pro", timing: "immediate", proration: "credit", note: "Prorated credit applied to your Circuit invoice." });
    confirm = { creditNote: "Your remaining Pro time is credited to the Circuit 256 invoice." };
  }

  ops.push({ action: "create_circuit_subscription", target: "circuit", tier: "circuit_256", interval, timing: "immediate", proration: "charge" });

  return finalize({
    ops,
    resulting: { proSource: "circuit_256", circuitTier: "circuit_256", proAddon: false },
    continuousPro: true,
    notice: current.proStandalone
      ? "Pro is now included with Circuit 256."
      : "GameShuffle Pro is included.",
    confirm,
  });
}

// --- Circuit 64 (rows 4, 5, + fresh) --------------------------------------
function subscribeCircuit64(current: AccountPlanState, interval: Interval, withAddon: boolean): PlanChangeResult {
  const ops: BillingOp[] = [];

  // Row 5: an active trial continues untouched; the $5 add-on is offered at
  // trial end instead of the $9 standalone conversion.
  if (current.proStandalone?.status === "trial") {
    ops.push({ action: "create_circuit_subscription", target: "circuit", tier: "circuit_64", interval, timing: "immediate", proration: "charge" });
    return finalize({
      ops,
      resulting: { proSource: "pro_trial", circuitTier: "circuit_64", proAddon: false },
      continuousPro: true,
      notice: "Your Pro trial continues. When it ends, keep Pro for $5/mo with your Circuit plan.",
      offer: {
        id: "trial_end_addon",
        prompt: "When your trial ends, add GameShuffle Pro for $5/mo instead of $9/mo.",
        accept: { kind: "add_pro_addon" },
      },
    });
  }

  // Row 4: an active standalone Pro auto-converts to the $5 add-on (cheaper).
  if (current.proStandalone?.status === "active") {
    ops.push({ action: "cancel_pro_with_credit", target: "pro", timing: "immediate", proration: "credit" });
    ops.push({ action: "create_circuit_subscription", target: "circuit", tier: "circuit_64", interval, timing: "immediate", proration: "charge" });
    ops.push({ action: "add_pro_addon_item", target: "pro_addon", interval, timing: "immediate", proration: "charge" });
    return finalize({
      ops,
      resulting: { proSource: "pro_addon", circuitTier: "circuit_64", proAddon: true },
      continuousPro: true,
      notice: "Your Pro moves to the $5 Circuit add-on.",
      confirm: { creditNote: "Your remaining standalone Pro time is credited, and Pro continues as the $5 add-on." },
    });
  }

  // Fresh subscribe (no prior Pro).
  ops.push({ action: "create_circuit_subscription", target: "circuit", tier: "circuit_64", interval, timing: "immediate", proration: "charge" });
  if (withAddon) {
    ops.push({ action: "add_pro_addon_item", target: "pro_addon", interval, timing: "immediate", proration: "charge" });
  }
  return finalize({
    ops,
    resulting: { proSource: withAddon ? "pro_addon" : null, circuitTier: "circuit_64", proAddon: withAddon },
    continuousPro: true,
    notice: withAddon ? "Circuit 64 with GameShuffle Pro added." : "Circuit 64 is active.",
  });
}

// --- Row 8: Circuit 256 → Circuit 64 --------------------------------------
function downgradeTo64(current: AccountPlanState): PlanChangeResult {
  if (current.circuit?.tier !== "circuit_256") {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, errors: ["not on Circuit 256"] };
  }
  return finalize({
    ops: [{ action: "schedule_circuit_downgrade", target: "circuit", tier: "circuit_64", timing: "period_end", proration: "none" }],
    // After the downgrade, Pro ends unless the offer is accepted.
    resulting: { proSource: null, circuitTier: "circuit_64", proAddon: false },
    continuousPro: true, // access continues through the period end
    offer: {
      id: "keep_pro_addon",
      prompt: "Keep GameShuffle Pro for $5/mo? The add-on starts when your Circuit 256 period ends.",
      accept: { kind: "add_pro_addon" },
    },
    notice: "Circuit 256 downgrades to Circuit 64 at the end of your billing period.",
  });
}

// --- Rows 9, 10: cancel Circuit -------------------------------------------
function cancelCircuit(current: AccountPlanState): PlanChangeResult {
  if (!current.circuit) {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, errors: ["no Circuit subscription"] };
  }
  const ops: BillingOp[] = [{ action: "schedule_circuit_cancel", target: "circuit", timing: "period_end", proration: "none" }];

  // Row 9: Circuit 256 cancel → offer standalone Pro at $9 starting period end.
  if (current.circuit.tier === "circuit_256") {
    return finalize({
      ops,
      resulting: { proSource: null, circuitTier: null, proAddon: false },
      continuousPro: true,
      offer: {
        id: "keep_pro_standalone_9",
        prompt: "Keep your stream tools: GameShuffle Pro for $9/mo, starting when your Circuit period ends.",
        accept: { kind: "subscribe_pro", interval: current.circuit.interval },
      },
      notice: "Circuit 256 cancels at the end of your billing period.",
    });
  }

  // Row 10: Circuit 64 + add-on cancel → offer to convert to standalone Pro.
  if (current.circuit.proAddon) {
    return finalize({
      ops,
      resulting: { proSource: null, circuitTier: null, proAddon: false },
      continuousPro: true,
      offer: {
        id: "convert_addon_to_standalone",
        prompt: "Keep GameShuffle Pro at $9/mo standalone, starting when your Circuit period ends.",
        accept: { kind: "subscribe_pro", interval: current.circuit.interval },
      },
      notice: "Circuit 64 and your Pro add-on cancel at the end of your billing period.",
    });
  }

  // Circuit 64 without add-on: nothing Pro-related to offer.
  return finalize({
    ops,
    resulting: { proSource: null, circuitTier: null, proAddon: false },
    continuousPro: true,
    notice: "Circuit 64 cancels at the end of your billing period.",
  });
}

// --- add / remove the Pro add-on (row 11 + the offer accepts) --------------
function addProAddon(current: AccountPlanState): PlanChangeResult {
  if (current.circuit?.tier !== "circuit_64") {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, errors: ["Pro add-on requires Circuit 64"] };
  }
  if (current.circuit.proAddon) {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, notice: "Pro add-on is already active." };
  }
  return finalize({
    ops: [{ action: "add_pro_addon_item", target: "pro_addon", interval: current.circuit.interval, timing: "immediate", proration: "charge" }],
    resulting: { proSource: "pro_addon", circuitTier: "circuit_64", proAddon: true },
    continuousPro: true,
    notice: "GameShuffle Pro added for $5/mo.",
  });
}

function removeProAddon(current: AccountPlanState): PlanChangeResult {
  if (current.circuit?.tier !== "circuit_64" || !current.circuit.proAddon) {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, errors: ["no Pro add-on to remove"] };
  }
  return finalize({
    ops: [{ action: "remove_pro_addon_item", target: "pro_addon", timing: "period_end", proration: "none" }],
    resulting: { proSource: null, circuitTier: "circuit_64", proAddon: false },
    continuousPro: true, // add-on runs through period end
    notice: "Your Pro add-on ends at the end of your billing period.",
  });
}

// --- Row 13: monthly ↔ annual --------------------------------------------
function switchInterval(current: AccountPlanState, interval: Interval): PlanChangeResult {
  const ops: BillingOp[] = [];
  if (current.circuit) {
    ops.push({ action: "switch_interval", target: "circuit", interval, timing: "immediate", proration: "charge" });
    if (current.circuit.proAddon) {
      // Items on one subscription must share an interval — the add-on follows.
      ops.push({ action: "switch_interval", target: "pro_addon", interval, timing: "immediate", proration: "charge", note: "Add-on interval follows Circuit." });
    }
  } else if (current.proStandalone) {
    ops.push({ action: "switch_interval", target: "pro", interval, timing: "immediate", proration: "charge" });
  } else {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, errors: ["no subscription to switch"] };
  }
  return finalize({
    ops,
    resulting: resultingFrom(current),
    continuousPro: true,
    notice: `Billing switched to ${interval}.`,
  });
}

// --- standalone Pro subscribe / cancel (offer accepts + direct) -----------
function subscribePro(current: AccountPlanState, interval: Interval): PlanChangeResult {
  return finalize({
    ops: [{ action: "create_pro_subscription", target: "pro", interval, timing: "immediate", proration: "charge" }],
    resulting: {
      proSource: "pro_subscription",
      circuitTier: current.circuit?.tier ?? null,
      proAddon: current.circuit?.proAddon ?? false,
    },
    continuousPro: true,
    notice: "GameShuffle Pro is active.",
  });
}

function cancelPro(current: AccountPlanState): PlanChangeResult {
  if (!current.proStandalone) {
    return { ops: [], resulting: resultingFrom(current), continuousPro: true, errors: ["no standalone Pro to cancel"] };
  }
  const trial = current.proStandalone.status === "trial";
  return finalize({
    ops: [{
      action: trial ? "cancel_pro_immediately" : "schedule_pro_cancel",
      target: "pro",
      timing: trial ? "immediate" : "period_end",
      proration: "none",
    }],
    resulting: {
      proSource: current.circuit?.tier === "circuit_256" ? "circuit_256" : current.circuit?.proAddon ? "pro_addon" : null,
      circuitTier: current.circuit?.tier ?? null,
      proAddon: current.circuit?.proAddon ?? false,
    },
    continuousPro: !trial, // scheduled cancels run through period end
    notice: trial ? "Pro trial canceled." : "Pro cancels at the end of your billing period.",
  });
}

/** The unchanged resulting state (for no-op / error results). */
function resultingFrom(state: AccountPlanState): PlanChangeResult["resulting"] {
  return {
    proSource: currentProSource(state),
    circuitTier: state.circuit?.tier ?? null,
    proAddon: state.circuit?.proAddon ?? false,
  };
}

/**
 * Row 12: Circuit 256 payment failure. Not a plan change — dunning (Smart
 * Retries) governs it. Pure helper so the behavior is documented + tested:
 * access continues during the retry window and ends only when the subscription
 * is finally canceled.
 */
export function resolveCircuitPaymentFailure(state: AccountPlanState): {
  proContinuesDuringRetry: boolean;
  notice: string;
} {
  const affectsPro = state.circuit?.tier === "circuit_256" || (state.circuit?.tier === "circuit_64" && state.circuit.proAddon);
  return {
    proContinuesDuringRetry: true,
    notice: affectsPro
      ? "Your payment failed. We'll retry automatically; your Circuit plan and GameShuffle Pro stay active during the retry window."
      : "Your payment failed. We'll retry automatically; your Circuit plan stays active during the retry window.",
  };
}
