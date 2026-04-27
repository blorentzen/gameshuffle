/**
 * Phase 1 capability resolution tests — runnable verification.
 *
 * Run with:
 *   npx tsx scripts/test-phase-1-capabilities.ts
 *
 * Tests are plain `assert`-based — the project does not have a test runner
 * configured and adding one is out of scope for Phase 1. These cover the
 * capability + staff impersonation matrix per gs-pro-v1-phase-1-spec.md §6.1.
 *
 * Tests that need a live database (RLS verification, session service
 * round-trips) are documented in the migration runbook as manual steps to
 * execute against dev after applying the migration.
 */

import assert from "node:assert/strict";
import {
  HIGHEST_TIER,
  canBindDiscordToSession,
  canCreateSession,
  canUseFeatureModule,
  effectiveTier,
  hasCapability,
  isStaffRole,
  normalizeTier,
} from "../src/lib/subscription";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error("    ", err instanceof Error ? err.message : err);
  }
}

function section(label: string) {
  console.log(`\n${label}`);
}

// ---------- normalizeTier ----------

section("normalizeTier()");

test("'pro' → 'pro'", () => {
  assert.equal(normalizeTier("pro"), "pro");
});
test("legacy 'member' collapses to 'pro'", () => {
  assert.equal(normalizeTier("member"), "pro");
});
test("legacy 'creator' collapses to 'pro'", () => {
  assert.equal(normalizeTier("creator"), "pro");
});
test("'free' → 'free'", () => {
  assert.equal(normalizeTier("free"), "free");
});
test("null → 'free'", () => {
  assert.equal(normalizeTier(null), "free");
});
test("unrecognized values → 'free'", () => {
  assert.equal(normalizeTier("enterprise" as unknown as string), "free");
});

// ---------- isStaffRole ----------

section("isStaffRole()");

test("'staff' is staff", () => {
  assert.equal(isStaffRole("staff"), true);
});
test("'admin' is staff", () => {
  assert.equal(isStaffRole("admin"), true);
});
test("'user' is not staff", () => {
  assert.equal(isStaffRole("user"), false);
});
test("null is not staff", () => {
  assert.equal(isStaffRole(null), false);
});

// ---------- effectiveTier ----------

section("effectiveTier()");

test("free user resolves to 'free'", () => {
  assert.equal(effectiveTier({ tier: "free", role: "user" }), "free");
});
test("pro user resolves to 'pro'", () => {
  assert.equal(effectiveTier({ tier: "pro", role: "user" }), "pro");
});
test("staff with no impersonation resolves to HIGHEST_TIER", () => {
  assert.equal(effectiveTier({ tier: "free", role: "staff" }), HIGHEST_TIER);
});
test("admin with no impersonation resolves to HIGHEST_TIER", () => {
  assert.equal(effectiveTier({ tier: "free", role: "admin" }), HIGHEST_TIER);
});
test("staff with viewing_as_tier='free' resolves to 'free'", () => {
  assert.equal(effectiveTier({ tier: "pro", role: "staff", viewingAsTier: "free" }), "free");
});
test("staff with viewing_as_tier='pro' resolves to 'pro'", () => {
  assert.equal(effectiveTier({ tier: "free", role: "staff", viewingAsTier: "pro" }), "pro");
});
test("non-staff with viewing_as_tier set is IGNORED (cookies have no effect)", () => {
  assert.equal(effectiveTier({ tier: "free", role: "user", viewingAsTier: "pro" }), "free");
});
test("non-staff with role=null and viewing_as_tier set is IGNORED", () => {
  assert.equal(effectiveTier({ tier: "free", role: null, viewingAsTier: "pro" }), "free");
});

// ---------- hasCapability ----------

section("hasCapability() — tier matrix");

test("free has 'randomizer.standalone'", () => {
  assert.equal(hasCapability({ tier: "free", role: null }, "randomizer.standalone"), true);
});
test("free does NOT have 'session.create'", () => {
  assert.equal(hasCapability({ tier: "free", role: null }, "session.create"), false);
});
test("free does NOT have 'hub.access'", () => {
  assert.equal(hasCapability({ tier: "free", role: null }, "hub.access"), false);
});
test("pro has 'session.create'", () => {
  assert.equal(hasCapability({ tier: "pro", role: null }, "session.create"), true);
});
test("pro has 'hub.access'", () => {
  assert.equal(hasCapability({ tier: "pro", role: null }, "hub.access"), true);
});
test("pro has 'randomizer.standalone' (free caps inherited)", () => {
  assert.equal(hasCapability({ tier: "pro", role: null }, "randomizer.standalone"), true);
});

section("hasCapability() — staff impersonation");

test("staff with no impersonation has 'session.create' (HIGHEST_TIER)", () => {
  assert.equal(hasCapability({ tier: "free", role: "staff" }, "session.create"), true);
});
test("staff impersonating free does NOT have 'session.create'", () => {
  assert.equal(
    hasCapability(
      { tier: "free", role: "staff", viewingAsTier: "free" },
      "session.create"
    ),
    false
  );
});
test("staff impersonating free still has 'randomizer.standalone'", () => {
  assert.equal(
    hasCapability(
      { tier: "free", role: "staff", viewingAsTier: "free" },
      "randomizer.standalone"
    ),
    true
  );
});
test("non-staff with viewing_as_tier='pro' is gated as their real tier", () => {
  assert.equal(
    hasCapability(
      { tier: "free", role: "user", viewingAsTier: "pro" },
      "session.create"
    ),
    false
  );
});

// ---------- session-layer wrappers ----------

section("Session-layer wrappers");

test("canCreateSession: free=false, pro=true, staff=true, staff-impersonating-free=false", () => {
  assert.equal(canCreateSession({ tier: "free", role: null }), false);
  assert.equal(canCreateSession({ tier: "pro", role: null }), true);
  assert.equal(canCreateSession({ tier: "free", role: "staff" }), true);
  assert.equal(
    canCreateSession({ tier: "free", role: "staff", viewingAsTier: "free" }),
    false
  );
});
test("canBindDiscordToSession routes through session.discord_integration", () => {
  assert.equal(canBindDiscordToSession({ tier: "free", role: null }), false);
  assert.equal(canBindDiscordToSession({ tier: "pro", role: null }), true);
});
test("canUseFeatureModule('picks_bans') routes through session.modules.picks_bans", () => {
  assert.equal(canUseFeatureModule({ tier: "free", role: null }, "picks_bans"), false);
  assert.equal(canUseFeatureModule({ tier: "pro", role: null }, "picks_bans"), true);
});
test("canUseFeatureModule defaults to deny for unknown modules", () => {
  assert.equal(
    canUseFeatureModule({ tier: "pro", role: null }, "unknown_future_module"),
    false
  );
});

// ---------- summary ----------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
