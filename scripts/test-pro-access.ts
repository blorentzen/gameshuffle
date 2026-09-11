/**
 * Pure-unit checks for the Pro access resolver (Phase A, gs-circuit-pro-addendum).
 * No DB — exercises proAccessFromState / effectiveTier / circuitGrantsPro.
 *
 * Run: npx tsx scripts/test-pro-access.ts
 */

import {
  proAccessFromState,
  hasDuplicatePaidPro,
  effectiveTier,
  circuitGrantsPro,
  type ProAccessState,
} from "../src/lib/subscription";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const eq = <T>(name: string, a: T, b: T) => check(`${name} (got ${JSON.stringify(a)})`, a === b);

// --- No source ------------------------------------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "user" });
  eq("free user: no pro", a.hasPro, false);
  eq("free user: no source", a.source, null);
}

// --- Standalone Pro subscription -----------------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "pro", subscriptionStatus: "active", role: "user" });
  eq("active pro: hasPro", a.hasPro, true);
  eq("active pro: source", a.source, "pro_subscription");
}

// --- Pro trial ------------------------------------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "pro", subscriptionStatus: "trialing", role: "user" });
  eq("trialing: hasPro", a.hasPro, true);
  eq("trialing: source is pro_trial", a.source, "pro_trial");
}

// --- past_due keeps access -----------------------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "pro", subscriptionStatus: "past_due", role: "user" });
  eq("past_due: hasPro", a.hasPro, true);
  eq("past_due: source", a.source, "pro_subscription");
}

// --- canceled drops access -----------------------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: "canceled", role: "user" });
  eq("canceled: no pro", a.hasPro, false);
}

// --- Circuit 256 bundles Pro ---------------------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "user", circuitTier: "circuit_256", circuitStatus: "active" });
  eq("circuit_256: hasPro", a.hasPro, true);
  eq("circuit_256: source", a.source, "circuit_256");
}

// --- Circuit 64 alone does NOT grant Pro ---------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "user", circuitTier: "circuit_64", circuitStatus: "active" });
  eq("circuit_64 (no add-on): no pro", a.hasPro, false);
}

// --- Circuit 64 + Pro add-on grants Pro ----------------------------------
{
  const a = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "user", circuitTier: "circuit_64", circuitStatus: "active", hasProAddon: true });
  eq("circuit_64 + addon: hasPro", a.hasPro, true);
  eq("circuit_64 + addon: source", a.source, "pro_addon");
}

// --- Priority: circuit_256 beats pro_subscription ------------------------
{
  const a = proAccessFromState({ subscriptionTier: "pro", subscriptionStatus: "active", role: "user", circuitTier: "circuit_256", circuitStatus: "active" });
  eq("priority: circuit_256 wins", a.source, "circuit_256");
  check("priority: duplicate paid detected", hasDuplicatePaidPro(a));
}

// --- Staff / beta grants (no billing) ------------------------------------
{
  const staff = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "staff" });
  eq("staff: hasPro", staff.hasPro, true);
  eq("staff: source", staff.source, "staff");
  eq("staff: no billing sources", staff.sources.length, 0);
  check("staff: not a duplicate", !hasDuplicatePaidPro(staff));

  const beta = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "beta" });
  eq("beta: source", beta.source, "beta");
}

// --- Staff WITH a billing source reports the billing source --------------
{
  const a = proAccessFromState({ subscriptionTier: "pro", subscriptionStatus: "active", role: "admin" });
  eq("staff+billing: reports billing source", a.source, "pro_subscription");
}

// --- endsAt populated from the matching source ---------------------------
{
  const iso = "2026-12-31T00:00:00.000Z";
  const a = proAccessFromState({ subscriptionTier: "free", subscriptionStatus: null, role: "user", circuitTier: "circuit_256", circuitStatus: "active", circuitPeriodEnd: iso });
  eq("endsAt: circuit period end", a.endsAt?.toISOString(), iso);
}

// --- circuitGrantsPro predicate + effectiveTier agree --------------------
{
  check("circuitGrantsPro: 256 active", circuitGrantsPro("circuit_256", "active"));
  check("circuitGrantsPro: 256 canceled false", !circuitGrantsPro("circuit_256", "canceled"));
  check("circuitGrantsPro: 64 no addon false", !circuitGrantsPro("circuit_64", "active"));
  check("circuitGrantsPro: 64 + addon true", circuitGrantsPro("circuit_64", "active", true));

  eq("effectiveTier: circuit_256 → pro", effectiveTier({ tier: "free", role: "user", circuitTier: "circuit_256", circuitStatus: "active" }), "pro");
  eq("effectiveTier: plain free stays free", effectiveTier({ tier: "free", role: "user" }), "free");
  eq("effectiveTier: staff → pro", effectiveTier({ tier: "free", role: "staff" }), "pro");
}

// --- Behavior preservation: no circuit fields → unchanged ----------------
{
  const before: ProAccessState = { subscriptionTier: "pro", subscriptionStatus: "active", role: "user" };
  const a = proAccessFromState(before);
  eq("preservation: pro sub still pro", a.source, "pro_subscription");
}

console.log(`\nPro access resolver: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
