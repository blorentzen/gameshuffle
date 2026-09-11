/**
 * Unit checks for the Pro × Circuit plan-change resolver (Phase B).
 * Covers all 13 rows of the gs-circuit-pro-addendum transition table.
 *
 * Run: npx tsx scripts/test-plan-change.ts
 */

import {
  resolvePlanChange,
  resolveCircuitPaymentFailure,
  type AccountPlanState,
  type PlanChangeResult,
  type BillingAction,
} from "../src/lib/billing/planChange";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ ${name}`); }
}
const has = (r: PlanChangeResult, a: BillingAction) => r.ops.some((o) => o.action === a);
const noErrors = (r: PlanChangeResult) => !r.errors || r.errors.length === 0;

const FREE: AccountPlanState = { proStandalone: null, circuit: null };
const proSub = (interval: "monthly" | "annual" = "monthly"): AccountPlanState => ({ proStandalone: { status: "active", interval }, circuit: null });
const proTrial = (): AccountPlanState => ({ proStandalone: { status: "trial", interval: "monthly" }, circuit: null });
const c256 = (): AccountPlanState => ({ proStandalone: null, circuit: { tier: "circuit_256", interval: "monthly", proAddon: false } });
const c64 = (proAddon = false): AccountPlanState => ({ proStandalone: null, circuit: { tier: "circuit_64", interval: "monthly", proAddon } });

// Row 1: Free → Circuit 256
{
  const r = resolvePlanChange(FREE, { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" });
  check("row1: creates circuit sub", has(r, "create_circuit_subscription"));
  check("row1: pro via circuit_256", r.resulting.proSource === "circuit_256");
  check("row1: no errors", noErrors(r));
}

// Row 2: Pro trial → Circuit 256
{
  const r = resolvePlanChange(proTrial(), { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" });
  check("row2: cancels trial immediately, no charge", has(r, "cancel_pro_immediately"));
  check("row2: continuous pro", r.continuousPro);
  check("row2: pro via circuit_256", r.resulting.proSource === "circuit_256");
}

// Row 3: Standalone Pro → Circuit 256
{
  const r = resolvePlanChange(proSub(), { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" });
  check("row3: cancels pro with credit", has(r, "cancel_pro_with_credit"));
  check("row3: shows credit note", !!r.confirm?.creditNote);
  check("row3: continuous", r.continuousPro);
  check("row3: no overlapping paid sources", noErrors(r));
}

// Row 4: Standalone Pro → Circuit 64 (auto-convert to $5 add-on)
{
  const r = resolvePlanChange(proSub(), { kind: "subscribe_circuit", tier: "circuit_64", interval: "monthly" });
  check("row4: cancels pro with credit", has(r, "cancel_pro_with_credit"));
  check("row4: adds pro_addon item", has(r, "add_pro_addon_item"));
  check("row4: pro via pro_addon", r.resulting.proSource === "pro_addon");
  check("row4: credit note on confirm", !!r.confirm?.creditNote);
  check("row4: continuous", r.continuousPro);
  check("row4: no invariant errors", noErrors(r));
}

// Row 5: Pro trial → Circuit 64 (trial untouched; $5 offer at trial end)
{
  const r = resolvePlanChange(proTrial(), { kind: "subscribe_circuit", tier: "circuit_64", interval: "monthly" });
  check("row5: does NOT cancel the trial", !has(r, "cancel_pro_immediately") && !has(r, "cancel_pro_with_credit"));
  check("row5: pro unchanged (still trial)", r.resulting.proSource === "pro_trial");
  check("row5: offers $5 add-on at trial end", r.offer?.id === "trial_end_addon");
}

// Row 6: Circuit 64 + add-on → Circuit 256
{
  const r = resolvePlanChange(c64(true), { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" });
  check("row6: upgrades circuit", has(r, "upgrade_circuit"));
  check("row6: removes add-on with credit", has(r, "remove_pro_addon_item_with_credit"));
  check("row6: pro via circuit_256", r.resulting.proSource === "circuit_256");
  check("row6: no add-on remaining", r.resulting.proAddon === false);
  check("row6: no overlapping paid sources", noErrors(r));
}

// Row 7: Circuit 64 (no add-on) → Circuit 256
{
  const r = resolvePlanChange(c64(false), { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" });
  check("row7: upgrades circuit", has(r, "upgrade_circuit"));
  check("row7: pro starts via circuit_256", r.resulting.proSource === "circuit_256");
  check("row7: no add-on removal needed", !has(r, "remove_pro_addon_item_with_credit"));
}

// Row 8: Circuit 256 → Circuit 64 (downgrade at period end, keep-Pro offer)
{
  const r = resolvePlanChange(c256(), { kind: "downgrade_to_circuit_64" });
  check("row8: scheduled downgrade at period end", r.ops.some((o) => o.action === "schedule_circuit_downgrade" && o.timing === "period_end"));
  check("row8: keep-pro offer is opt-in", r.offer?.id === "keep_pro_addon");
  check("row8: access continuous through period", r.continuousPro);
}

// Row 9: Circuit 256 → Cancel
{
  const r = resolvePlanChange(c256(), { kind: "cancel_circuit" });
  check("row9: cancel scheduled at period end", r.ops.some((o) => o.action === "schedule_circuit_cancel" && o.timing === "period_end"));
  check("row9: offer standalone Pro $9", r.offer?.id === "keep_pro_standalone_9");
  check("row9: through period end", r.continuousPro);
}

// Row 10: Circuit 64 + add-on → Cancel Circuit
{
  const r = resolvePlanChange(c64(true), { kind: "cancel_circuit" });
  check("row10: cancel scheduled at period end", r.ops.some((o) => o.action === "schedule_circuit_cancel" && o.timing === "period_end"));
  check("row10: offer convert to standalone Pro", r.offer?.id === "convert_addon_to_standalone");
}

// Row 11: Circuit 64 + add-on → Remove add-on only
{
  const r = resolvePlanChange(c64(true), { kind: "remove_pro_addon" });
  check("row11: removes add-on at period end", r.ops.some((o) => o.action === "remove_pro_addon_item" && o.timing === "period_end"));
  check("row11: circuit stays 64", r.resulting.circuitTier === "circuit_64");
  check("row11: pro ends (no source)", r.resulting.proSource === null);
}

// Row 12: Circuit 256 payment failure (dunning)
{
  const r = resolveCircuitPaymentFailure(c256());
  check("row12: pro continues during retry", r.proContinuesDuringRetry);
  check("row12: notice mentions Pro", /GameShuffle Pro/.test(r.notice));
}

// Row 13: monthly ↔ annual switch (add-on follows)
{
  const r = resolvePlanChange(c64(true), { kind: "switch_interval", interval: "annual" });
  const circuitSwitch = r.ops.find((o) => o.action === "switch_interval" && o.target === "circuit");
  const addonSwitch = r.ops.find((o) => o.action === "switch_interval" && o.target === "pro_addon");
  check("row13: circuit switches interval", circuitSwitch?.interval === "annual");
  check("row13: add-on follows the interval", addonSwitch?.interval === "annual");
  check("row13: continuous", r.continuousPro);
}

// Invariant: pro_addon can't exist without Circuit 64
{
  const r = resolvePlanChange(FREE, { kind: "add_pro_addon" });
  check("invariant: add-on without Circuit 64 errors", !noErrors(r));
}

// Invariant: no path yields overlapping paid sources (spot-check rows 3,4,6)
{
  const rows = [
    resolvePlanChange(proSub(), { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" }),
    resolvePlanChange(proSub(), { kind: "subscribe_circuit", tier: "circuit_64", interval: "monthly" }),
    resolvePlanChange(c64(true), { kind: "subscribe_circuit", tier: "circuit_256", interval: "monthly" }),
  ];
  check("invariant: no overlapping paid sources on any convert path", rows.every(noErrors));
}

console.log(`\nPlan-change resolver: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
