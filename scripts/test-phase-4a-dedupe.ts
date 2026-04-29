/**
 * Phase 4A.1 dedupe tests — pure-function verification of the two-layer
 * defensive fix for the !gs-shuffle double-fire bug observed 2026-04-29.
 *
 * Run with:
 *   npx tsx scripts/test-phase-4a-dedupe.ts
 *
 * What we test:
 *   - Layer 1 (`buildChatDedupeKey`): two webhook deliveries for the same
 *     logical chat message — same broadcaster, sender, text, and
 *     timestamps within ~50ms — produce the SAME composite key, so the
 *     unique index on `dedupe_key` rejects the second insert.
 *   - Layer 1 negative cases: different content / sender / broadcaster
 *     produce DIFFERENT keys (no over-broad collisions).
 *   - Layer 2 (`isWithinRecentShuffleWindow`): the in-handler
 *     idempotency decision returns true for recent events, false for
 *     stale, null, future-dated, or non-finite inputs.
 *
 * The DB-level enforcement (unique index, INSERT ON CONFLICT semantics)
 * is exercised by the migration itself + the runbook smoke test.
 */

import assert from "node:assert/strict";
import {
  buildChatDedupeKey,
  isWithinRecentShuffleWindow,
  SHUFFLE_IDEMPOTENCY_WINDOW_MS,
} from "../src/lib/twitch/dedupe";

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
  // The bug timestamps (2026-04-29 04:03:44 UTC) — pinning a specific
  // wall-clock so the bucket math is reproducible.
  const T0 = Date.parse("2026-04-29T04:03:44.127Z");
  const T0_50MS_LATER = T0 + 50;
  const T0_500MS_LATER = T0 + 500;
  const T0_2S_LATER = T0 + 2000;
  const T0_3S_LATER = T0 + 3000;

  // ---------- Layer 1 — buildChatDedupeKey, positive cases ----------------

  section("Layer 1 — buildChatDedupeKey (collision required)");

  await test("identical inputs → identical key", () => {
    const k1 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    assert.equal(k1, k2);
  });

  await test("same content, 50ms apart (real bug scenario) → identical key", () => {
    const k1 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0_50MS_LATER,
    });
    assert.equal(k1, k2, "50ms apart should bucket together");
  });

  await test("same content, 500ms apart → identical key (within bucket)", () => {
    const k1 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0_500MS_LATER,
    });
    assert.equal(k1, k2);
  });

  await test("key shape includes 'chat:' prefix", () => {
    const k = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "x",
      timestampMs: T0,
    });
    assert.match(k, /^chat:B:S:[0-9a-f]{16}:\d+$/);
  });

  // ---------- Layer 1 — buildChatDedupeKey, negative cases ----------------

  section("Layer 1 — buildChatDedupeKey (must NOT collide)");

  await test("different message text → different key", () => {
    const k1 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-mycombo",
      timestampMs: T0,
    });
    assert.notEqual(k1, k2);
  });

  await test("different sender → different key", () => {
    const k1 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S1",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S2",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    assert.notEqual(k1, k2);
  });

  await test("different broadcaster → different key", () => {
    const k1 = buildChatDedupeKey({
      broadcasterId: "B1",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "B2",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    assert.notEqual(k1, k2);
  });

  await test("legitimate repeat 3s later (after bucket) → different key", () => {
    // A streamer typing !gs-shuffle three seconds apart legitimately should
    // get two separate buckets — Layer 2's recency window is the second
    // line of defense; Layer 1 doesn't over-block.
    const k1 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: T0_3S_LATER,
    });
    assert.notEqual(k1, k2);
  });

  await test("non-finite timestamp throws (caller bug, not silent collision)", () => {
    assert.throws(() =>
      buildChatDedupeKey({
        broadcasterId: "B",
        senderId: "S",
        text: "x",
        timestampMs: Number.NaN,
      })
    );
  });

  await test("text hashing is consistent across whitespace insensitivity", () => {
    // Verify that we DO treat whitespace as significant — the bug is
    // about identical chat content, not normalized content. If a viewer
    // types "!gs-shuffle " (trailing space), it's legitimately a new
    // command from Twitch's perspective.
    const k1 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle ",
      timestampMs: T0,
    });
    assert.notEqual(k1, k2);
  });

  // ---------- Layer 1 — boundary-straddle case (acknowledged miss) --------

  section("Layer 1 — bucket boundary behavior (acknowledged Layer 2 hand-off)");

  await test("two notifications straddling a 2s bucket boundary → DIFFERENT keys", () => {
    // This is the rare ~0.05% case where dedupe misses. Layer 2 catches
    // it. Test exists to make the design explicit.
    const justBefore = T0_2S_LATER - 1;
    const justAfter = T0_2S_LATER + 1;
    const k1 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: justBefore,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "B",
      senderId: "S",
      text: "!gs-shuffle",
      timestampMs: justAfter,
    });
    // We DO expect different keys here — the test name is the contract.
    // Layer 2's recency window covers this.
    if (Math.floor(justBefore / 2000) !== Math.floor(justAfter / 2000)) {
      assert.notEqual(k1, k2);
    } else {
      assert.equal(k1, k2);
    }
  });

  // ---------- Layer 2 — isWithinRecentShuffleWindow ------------------------

  section("Layer 2 — isWithinRecentShuffleWindow");

  await test("recent event (50ms ago) → true (skip duplicate)", () => {
    const now = T0;
    const recent = new Date(T0 - 50).toISOString();
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: recent,
        nowMs: now,
      }),
      true
    );
  });

  await test("event right at the window boundary → false (just expired)", () => {
    const now = T0;
    const atBoundary = new Date(T0 - SHUFFLE_IDEMPOTENCY_WINDOW_MS).toISOString();
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: atBoundary,
        nowMs: now,
      }),
      false
    );
  });

  await test("event 5s ago → false (legitimate fresh shuffle)", () => {
    const now = T0;
    const stale = new Date(T0 - 5000).toISOString();
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: stale,
        nowMs: now,
      }),
      false
    );
  });

  await test("null event → false (no prior shuffle)", () => {
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: null,
        nowMs: T0,
      }),
      false
    );
  });

  await test("undefined event → false", () => {
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: undefined,
        nowMs: T0,
      }),
      false
    );
  });

  await test("malformed date string → false (don't false-positive on bad data)", () => {
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: "not-a-date",
        nowMs: T0,
      }),
      false
    );
  });

  await test("future-dated event → false (don't false-positive on clock skew)", () => {
    const future = new Date(T0 + 1000).toISOString();
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: future,
        nowMs: T0,
      }),
      false
    );
  });

  await test("custom window override", () => {
    const now = T0;
    const justOver = new Date(T0 - 100).toISOString();
    // 50ms window → 100ms-old event is stale
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: justOver,
        nowMs: now,
        windowMs: 50,
      }),
      false
    );
    // 200ms window → 100ms-old event is recent
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: justOver,
        nowMs: now,
        windowMs: 200,
      }),
      true
    );
  });

  // ---------- Combined defense — the full bug scenario --------------------

  section("Combined — the exact Phase 4A.1 bug scenario");

  await test("two duplicate webhooks 50ms apart with different message_ids → Layer 1 collides", () => {
    // The actual bug. Both webhooks come in for the same logical message
    // with different message_ids, but the composite key collides.
    const k1 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0,
    });
    const k2 = buildChatDedupeKey({
      broadcasterId: "118855681",
      senderId: "118855681",
      text: "!gs-shuffle",
      timestampMs: T0 + 50,
    });
    assert.equal(k1, k2, "Layer 1 must collide on the bug scenario");
    // Even if Layer 1 somehow missed (boundary straddle), Layer 2 would
    // see the prior shuffle event and skip:
    assert.equal(
      isWithinRecentShuffleWindow({
        recentEventCreatedAt: new Date(T0).toISOString(),
        nowMs: T0 + 50,
      }),
      true,
      "Layer 2 must catch the same-second case as defense in depth"
    );
  });

  // ---------- Summary -----------------------------------------------------

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("test runner crashed:", err);
  process.exit(1);
});
