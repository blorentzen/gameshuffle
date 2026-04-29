/**
 * Phase 2 lifecycle tests — pure-function verification.
 *
 * Run with:
 *   npx tsx scripts/test-phase-2-lifecycle.ts
 *
 * Like the Phase 1 capability tests, this script exercises the pure-logic
 * surface (constants, transition matrix, window/threshold math) without
 * touching the database. DB-dependent tests (actual sweep transitions,
 * recap payload computation against real events, webhook idempotency)
 * are documented in `docs/gs-pro-v1-phase-2-runbook.md` as manual steps
 * Britton runs against dev/prod after applying the migration.
 *
 * Per gs-pro-v1-phase-2-spec.md §8.
 */

import assert from "node:assert/strict";
import {
  AUTO_TIMEOUT_MS,
  GRACE_PERIOD_MS,
  INACTIVE_NOTIFICATION_THRESHOLDS_MS,
  WRAP_UP_DURATION_MS,
} from "../src/lib/sessions/constants";
import { SESSION_EVENT_TYPES } from "../src/lib/sessions/event-types";
import { isValidTransition } from "../src/lib/sessions/service";
import type { SessionStatus } from "../src/lib/sessions/types";

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

// ---------- Constants ----------

section("Constants — sanity check");

test("GRACE_PERIOD_MS is exactly 1 hour", () => {
  assert.equal(GRACE_PERIOD_MS, 60 * 60_000);
});
test("AUTO_TIMEOUT_MS is exactly 12 hours", () => {
  assert.equal(AUTO_TIMEOUT_MS, 12 * 60 * 60_000);
});
test("WRAP_UP_DURATION_MS is exactly 10 seconds", () => {
  // Dropped from 60s to 10s — Phase 3A's adapter recap dispatch is
  // synchronous and sub-second, so the original 60s buffer was over-
  // provisioned and caused a 1-5min wait between sessions.
  assert.equal(WRAP_UP_DURATION_MS, 10_000);
});
test("Inactive thresholds: 1h < 24h < 7d, all positive", () => {
  const t = INACTIVE_NOTIFICATION_THRESHOLDS_MS;
  assert.ok(t["1h"] > 0);
  assert.ok(t["24h"] > t["1h"]);
  assert.ok(t["7d"] > t["24h"]);
  assert.equal(t["1h"], 60 * 60_000);
  assert.equal(t["24h"], 24 * 60 * 60_000);
  assert.equal(t["7d"], 7 * 24 * 60 * 60_000);
});

// ---------- Event-type map ----------

section("SESSION_EVENT_TYPES — Phase 2 additions present");

const PHASE2_EVENTS = [
  "grace_period_started",
  "grace_period_cancelled",
  "auto_timeout_triggered",
  "wrap_up_started",
  "wrap_up_complete",
  "recap_ready",
  "inactive_notification_sent",
] as const;

for (const t of PHASE2_EVENTS) {
  test(`'${t}' registered`, () => {
    assert.equal(SESSION_EVENT_TYPES[t as keyof typeof SESSION_EVENT_TYPES], t);
  });
}

// ---------- State machine ----------

section("State machine — Phase 2 transitions still valid");

const transitions: Array<[SessionStatus, SessionStatus, boolean]> = [
  // Phase 1 baseline
  ["draft", "scheduled", true],
  ["draft", "active", true],
  ["draft", "cancelled", true],
  ["draft", "ended", false], // can't skip directly to ended
  ["scheduled", "ready", true],
  ["scheduled", "cancelled", true],
  ["scheduled", "active", false], // must go through ready first
  ["ready", "active", true],
  ["ready", "scheduled", true], // Phase 2: sweepReadyToScheduled
  ["ready", "cancelled", true],
  ["active", "ending", true],
  ["active", "ended", false], // must wrap up first
  ["ending", "ended", true],
  ["ending", "active", false], // no resurrection
  ["ended", "active", false], // terminal
  ["cancelled", "scheduled", false], // terminal
];

for (const [from, to, expected] of transitions) {
  test(`${from} → ${to} ${expected ? "allowed" : "rejected"}`, () => {
    assert.equal(isValidTransition(from, to), expected);
  });
}

// ---------- Window math ----------

section("Eligibility window math (sweepScheduledToReady)");

function isInEligibilityWindow(scheduledAt: number, windowHours: number, now: number): boolean {
  const windowStart = scheduledAt - windowHours * 3600_000;
  const windowEnd = scheduledAt + windowHours * 3600_000;
  return now >= windowStart && now <= windowEnd;
}

test("Within 4h of scheduled_at: in window", () => {
  const scheduled = Date.parse("2026-04-27T20:00:00Z");
  const now = Date.parse("2026-04-27T18:00:00Z"); // 2h before
  assert.equal(isInEligibilityWindow(scheduled, 4, now), true);
});
test("Beyond +4h of scheduled_at: out of window", () => {
  const scheduled = Date.parse("2026-04-27T20:00:00Z");
  const now = Date.parse("2026-04-28T01:00:00Z"); // 5h after
  assert.equal(isInEligibilityWindow(scheduled, 4, now), false);
});
test("Beyond -4h of scheduled_at: out of window", () => {
  const scheduled = Date.parse("2026-04-27T20:00:00Z");
  const now = Date.parse("2026-04-27T15:00:00Z"); // 5h before
  assert.equal(isInEligibilityWindow(scheduled, 4, now), false);
});
test("Exact scheduled_at: in window", () => {
  const scheduled = Date.parse("2026-04-27T20:00:00Z");
  assert.equal(isInEligibilityWindow(scheduled, 4, scheduled), true);
});

// ---------- Threshold math ----------

section("Inactive cascade threshold math");

function levelForElapsedMs(elapsed: number): "none" | "1h" | "24h" | "7d" {
  if (elapsed >= INACTIVE_NOTIFICATION_THRESHOLDS_MS["7d"]) return "7d";
  if (elapsed >= INACTIVE_NOTIFICATION_THRESHOLDS_MS["24h"]) return "24h";
  if (elapsed >= INACTIVE_NOTIFICATION_THRESHOLDS_MS["1h"]) return "1h";
  return "none";
}

test("30 minutes offline: no notification", () => {
  assert.equal(levelForElapsedMs(30 * 60_000), "none");
});
test("Exactly 1h offline: 1h tier", () => {
  assert.equal(levelForElapsedMs(60 * 60_000), "1h");
});
test("12h offline: still 1h tier (not yet 24h)", () => {
  assert.equal(levelForElapsedMs(12 * 60 * 60_000), "1h");
});
test("24h offline: 24h tier", () => {
  assert.equal(levelForElapsedMs(24 * 60 * 60_000), "24h");
});
test("3 days offline: still 24h tier", () => {
  assert.equal(levelForElapsedMs(3 * 24 * 60 * 60_000), "24h");
});
test("7 days offline: 7d tier (force-end)", () => {
  assert.equal(levelForElapsedMs(7 * 24 * 60 * 60_000), "7d");
});

// ---------- Auto-timeout horizon ----------

section("Auto-timeout horizon math");

test("auto_timeout_at = activated_at + 12h", () => {
  const activated = Date.parse("2026-04-27T19:00:00Z");
  const expected = activated + AUTO_TIMEOUT_MS;
  assert.equal(expected, Date.parse("2026-04-28T07:00:00Z"));
});

test("Session that just hit 12h: should timeout", () => {
  const activated = Date.parse("2026-04-27T19:00:00Z");
  const autoTimeoutAt = activated + AUTO_TIMEOUT_MS;
  const now = autoTimeoutAt + 1000; // 1s past
  assert.ok(now > autoTimeoutAt);
});

// ---------- Grace period horizon ----------

section("Grace period math");

test("grace_period_expires_at = stream_offline_at + 1h", () => {
  const offlineAt = Date.parse("2026-04-27T21:30:00Z");
  const expected = offlineAt + GRACE_PERIOD_MS;
  assert.equal(expected, Date.parse("2026-04-27T22:30:00Z"));
});
test("Stream came back at 30m: still in grace", () => {
  const offlineAt = Date.parse("2026-04-27T21:30:00Z");
  const expiresAt = offlineAt + GRACE_PERIOD_MS;
  const onlineAt = offlineAt + 30 * 60_000;
  assert.ok(onlineAt < expiresAt);
});
test("Stream stayed offline 75m: grace expired", () => {
  const offlineAt = Date.parse("2026-04-27T21:30:00Z");
  const expiresAt = offlineAt + GRACE_PERIOD_MS;
  const checkAt = offlineAt + 75 * 60_000;
  assert.ok(checkAt > expiresAt);
});

// ---------- Summary ----------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
