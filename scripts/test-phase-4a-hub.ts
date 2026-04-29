/**
 * Phase 4A foundational hub — pure-function verification.
 *
 * Run with:
 *   npx tsx scripts/test-phase-4a-hub.ts
 *
 * Phase 4A's biggest user-visible additions (capability gating, session list
 * page, server actions, realtime subscription) all hit the DB or
 * Next.js-runtime APIs and aren't suitable for in-process unit testing.
 * Those are exercised in docs/gs-pro-v1-phase-4a-runbook.md.
 *
 * What we *can* unit-test cleanly:
 *   - formatRelativeTime: every relative branch ("just now", "Xm ago",
 *     "in Yh", placeholder fallbacks)
 *   - formatDuration: under-minute, minute-only, hour rollover, hour+minute,
 *     placeholder fallback for negative/non-finite inputs
 *   - The Hub's hasCapability gate logic via the existing capability surface
 *     (smoke test that hub.access is wired correctly for each tier)
 */

import assert from "node:assert/strict";
import { formatRelativeTime, formatDuration } from "../src/lib/time/relative";
import { hasCapability, normalizeTier } from "../src/lib/subscription";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error("    ", err instanceof Error ? err.message : err);
    }
  };
  return run();
}

function section(label: string) {
  console.log(`\n${label}`);
}

async function main() {
  // ---------- formatRelativeTime — compact ---------------------------------

  section("formatRelativeTime — compact form");

  const NOW = new Date("2026-04-26T12:00:00Z");

  await test("null input → placeholder", () => {
    assert.equal(formatRelativeTime(null), "—");
  });
  await test("undefined input → placeholder", () => {
    assert.equal(formatRelativeTime(undefined), "—");
  });
  await test("invalid date string → placeholder", () => {
    assert.equal(formatRelativeTime("not-a-date"), "—");
  });

  await test("now → 'just now'", () => {
    assert.equal(formatRelativeTime(NOW, { now: NOW }), "just now");
  });

  await test("5 seconds ago → '5s ago'", () => {
    const t = new Date(NOW.getTime() - 5_000);
    assert.equal(formatRelativeTime(t, { now: NOW }), "5s ago");
  });

  await test("5 minutes ago → '5m ago'", () => {
    const t = new Date(NOW.getTime() - 5 * 60_000);
    assert.equal(formatRelativeTime(t, { now: NOW }), "5m ago");
  });

  await test("3 hours ago → '3h ago'", () => {
    const t = new Date(NOW.getTime() - 3 * 3600_000);
    assert.equal(formatRelativeTime(t, { now: NOW }), "3h ago");
  });

  await test("2 days ago → '2d ago'", () => {
    const t = new Date(NOW.getTime() - 2 * 86_400_000);
    assert.equal(formatRelativeTime(t, { now: NOW }), "2d ago");
  });

  await test("future 30 minutes → 'in 30m'", () => {
    const t = new Date(NOW.getTime() + 30 * 60_000);
    assert.equal(formatRelativeTime(t, { now: NOW }), "in 30m");
  });

  await test("future 4 hours → 'in 4h'", () => {
    const t = new Date(NOW.getTime() + 4 * 3600_000);
    assert.equal(formatRelativeTime(t, { now: NOW }), "in 4h");
  });

  // ---------- formatRelativeTime — verbose ---------------------------------

  section("formatRelativeTime — verbose form (Intl.RelativeTimeFormat)");

  await test("verbose: 5m ago → contains 'minute'", () => {
    const t = new Date(NOW.getTime() - 5 * 60_000);
    const out = formatRelativeTime(t, { now: NOW, verbose: true });
    assert.match(out, /minute/);
  });

  await test("verbose: future 3 hours → contains 'hour'", () => {
    const t = new Date(NOW.getTime() + 3 * 3600_000);
    const out = formatRelativeTime(t, { now: NOW, verbose: true });
    assert.match(out, /hour/);
  });

  // ---------- formatDuration ----------------------------------------------

  section("formatDuration");

  await test("0 seconds → '0s'", () => {
    assert.equal(formatDuration(0), "0s");
  });
  await test("47 seconds → '47s'", () => {
    assert.equal(formatDuration(47), "47s");
  });
  await test("60 seconds → '1m'", () => {
    assert.equal(formatDuration(60), "1m");
  });
  await test("47 minutes → '47m'", () => {
    assert.equal(formatDuration(47 * 60), "47m");
  });
  await test("3600 seconds → '1h'", () => {
    assert.equal(formatDuration(3600), "1h");
  });
  await test("2h 15m → '2h 15m'", () => {
    assert.equal(formatDuration(2 * 3600 + 15 * 60), "2h 15m");
  });
  await test("negative input → placeholder", () => {
    assert.equal(formatDuration(-1), "—");
  });
  await test("NaN input → placeholder", () => {
    assert.equal(formatDuration(Number.NaN), "—");
  });
  await test("Infinity input → placeholder", () => {
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), "—");
  });

  // ---------- hub.access capability gate ----------------------------------

  section("hub.access — capability gate by tier");

  await test("free tier → hub.access denied", () => {
    assert.equal(
      hasCapability({ tier: "free", role: null }, "hub.access"),
      false
    );
  });

  await test("pro tier → hub.access allowed", () => {
    assert.equal(
      hasCapability({ tier: "pro", role: null }, "hub.access"),
      true
    );
  });

  await test("legacy 'member' tier normalizes to pro → hub.access allowed", () => {
    assert.equal(
      hasCapability({ tier: normalizeTier("member"), role: null }, "hub.access"),
      true
    );
  });

  await test("legacy 'creator' tier normalizes to pro → hub.access allowed", () => {
    assert.equal(
      hasCapability({ tier: normalizeTier("creator"), role: null }, "hub.access"),
      true
    );
  });

  await test("staff role with free tier → hub.access allowed (HIGHEST_TIER override)", () => {
    assert.equal(
      hasCapability({ tier: "free", role: "staff" }, "hub.access"),
      true
    );
  });

  await test("admin role with free tier → hub.access allowed", () => {
    assert.equal(
      hasCapability({ tier: "free", role: "admin" }, "hub.access"),
      true
    );
  });

  await test("staff impersonating free → hub.access denied (override honored)", () => {
    assert.equal(
      hasCapability(
        { tier: "free", role: "staff", viewingAsTier: "free" },
        "hub.access"
      ),
      false
    );
  });

  await test("staff impersonating pro → hub.access allowed", () => {
    assert.equal(
      hasCapability(
        { tier: "free", role: "staff", viewingAsTier: "pro" },
        "hub.access"
      ),
      true
    );
  });

  // ---------- Summary -------------------------------------------------------

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("test runner crashed:", err);
  process.exit(1);
});
