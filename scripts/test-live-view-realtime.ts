/**
 * Pure-function tests for the live-view realtime layer.
 *
 * Per gs-live-view-realtime-spec-v2.md §12 — covers the helpers in
 * src/components/live/realtimeHelpers.ts (channel name builders,
 * backoff math, per-channel polling predicate, visibility throttle).
 *
 * Integration tests (Realtime + RLS interaction) stay manual per the
 * spec's runbook; mocking Supabase Realtime channels in node doesn't
 * provide signal we can trust.
 *
 * Run with:
 *   npx tsx scripts/test-live-view-realtime.ts
 */

import assert from "node:assert/strict";
import {
  buildChannelName,
  derivePollingNeeded,
  initialChannelHealth,
  resubscribeBackoffMs,
  visibilityAction,
  type LiveChannelName,
  type LiveChannelStatus,
} from "../src/components/live/realtimeHelpers";

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

// ---------- Channel name builders ----------

section("buildChannelName — stable across renders for the same (surface, sessionId)");

test("session channel for a sessionId", () => {
  assert.equal(
    buildChannelName("session", "abc-123"),
    "live-session-abc-123"
  );
});

test("participants channel for a sessionId", () => {
  assert.equal(
    buildChannelName("participants", "abc-123"),
    "live-participants-abc-123"
  );
});

test("events channel for a sessionId", () => {
  assert.equal(
    buildChannelName("events", "abc-123"),
    "live-events-abc-123"
  );
});

test("modules channel for a sessionId", () => {
  assert.equal(
    buildChannelName("modules", "abc-123"),
    "live-modules-abc-123"
  );
});

test("two calls for the same args return identical strings", () => {
  const a = buildChannelName("session", "xyz");
  const b = buildChannelName("session", "xyz");
  assert.equal(a, b);
});

// ---------- Per-channel polling predicate ----------

section("derivePollingNeeded — only unhealthy channels need polling");

test("all subscribed → empty list (no polling)", () => {
  const states: Record<LiveChannelName, LiveChannelStatus> = {
    session: "subscribed",
    participants: "subscribed",
    events: "subscribed",
    modules: "subscribed",
  };
  assert.deepEqual(derivePollingNeeded(states), []);
});

test("one channel failed → only that channel polls", () => {
  const states: Record<LiveChannelName, LiveChannelStatus> = {
    session: "subscribed",
    participants: "failed",
    events: "subscribed",
    modules: "subscribed",
  };
  assert.deepEqual(derivePollingNeeded(states), ["participants"]);
});

test("one channel closed → only that channel polls", () => {
  const states: Record<LiveChannelName, LiveChannelStatus> = {
    session: "subscribed",
    participants: "subscribed",
    events: "closed",
    modules: "subscribed",
  };
  assert.deepEqual(derivePollingNeeded(states), ["events"]);
});

test("pending also counts as needs-polling (handshake hasn't resolved)", () => {
  const states: Record<LiveChannelName, LiveChannelStatus> = {
    session: "pending",
    participants: "subscribed",
    events: "subscribed",
    modules: "subscribed",
  };
  assert.deepEqual(derivePollingNeeded(states), ["session"]);
});

test("multiple unhealthy channels → all listed in declaration order", () => {
  const states: Record<LiveChannelName, LiveChannelStatus> = {
    session: "failed",
    participants: "subscribed",
    events: "closed",
    modules: "pending",
  };
  // Object.keys order matches declaration order in initialChannelHealth.
  assert.deepEqual(derivePollingNeeded(states), [
    "session",
    "events",
    "modules",
  ]);
});

test("initialChannelHealth — every channel starts pending", () => {
  const initial = initialChannelHealth();
  assert.equal(initial.session, "pending");
  assert.equal(initial.participants, "pending");
  assert.equal(initial.events, "pending");
  assert.equal(initial.modules, "pending");
});

// ---------- Resubscribe backoff ----------

section("resubscribeBackoffMs — 1s → 2s → 4s → 8s → 16s → 30s (cap)");

test("attempt 0 → 1000ms", () => {
  assert.equal(resubscribeBackoffMs(0), 1000);
});

test("attempt 1 → 2000ms", () => {
  assert.equal(resubscribeBackoffMs(1), 2000);
});

test("attempt 2 → 4000ms", () => {
  assert.equal(resubscribeBackoffMs(2), 4000);
});

test("attempt 3 → 8000ms", () => {
  assert.equal(resubscribeBackoffMs(3), 8000);
});

test("attempt 4 → 16000ms", () => {
  assert.equal(resubscribeBackoffMs(4), 16000);
});

test("attempt 5 → 30000ms (capped — 32000 would exceed)", () => {
  assert.equal(resubscribeBackoffMs(5), 30000);
});

test("attempt 10 → still 30000ms (cap holds)", () => {
  assert.equal(resubscribeBackoffMs(10), 30000);
});

test("negative attempt → 1000ms (defensive floor)", () => {
  assert.equal(resubscribeBackoffMs(-1), 1000);
});

// ---------- Visibility throttle predicate ----------

section("visibilityAction — only unsubscribes after 60s+ hidden");

test("not hidden → noop", () => {
  assert.equal(
    visibilityAction({ isHidden: false, hiddenSinceMs: null, nowMs: 0 }),
    "noop"
  );
});

test("hidden but no hiddenSinceMs (just-hidden, hasn't been recorded yet) → noop", () => {
  assert.equal(
    visibilityAction({
      isHidden: true,
      hiddenSinceMs: null,
      nowMs: 1000,
    }),
    "noop"
  );
});

test("hidden 30s → noop", () => {
  assert.equal(
    visibilityAction({
      isHidden: true,
      hiddenSinceMs: 0,
      nowMs: 30_000,
    }),
    "noop"
  );
});

test("hidden exactly 60s → unsubscribe", () => {
  assert.equal(
    visibilityAction({
      isHidden: true,
      hiddenSinceMs: 0,
      nowMs: 60_000,
    }),
    "unsubscribe"
  );
});

test("hidden 5min → unsubscribe", () => {
  assert.equal(
    visibilityAction({
      isHidden: true,
      hiddenSinceMs: 0,
      nowMs: 300_000,
    }),
    "unsubscribe"
  );
});

test("custom threshold respected (10s)", () => {
  assert.equal(
    visibilityAction({
      isHidden: true,
      hiddenSinceMs: 0,
      nowMs: 5_000,
      thresholdMs: 10_000,
    }),
    "noop"
  );
  assert.equal(
    visibilityAction({
      isHidden: true,
      hiddenSinceMs: 0,
      nowMs: 10_000,
      thresholdMs: 10_000,
    }),
    "unsubscribe"
  );
});

// ---------- Summary ----------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
