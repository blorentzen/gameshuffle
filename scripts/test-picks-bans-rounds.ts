/**
 * Picks/Bans rounds — pure-function verification.
 *
 * Run with:
 *   npx tsx scripts/test-picks-bans-rounds.ts
 *
 * Covers:
 *   - aggregate.ts ballot tallying (locked-only filter, top-N)
 *   - rate-limit bucket semantics (window roll-over, cap)
 *   - source-level contracts on schema migration + actions + chat handlers
 */

import assert from "node:assert/strict";
import {
  aggregateBallots,
  topN,
} from "../src/lib/picks-bans/aggregate";
import {
  checkAndConsumeRateLimit,
  _resetBucketsForTesting,
} from "../src/lib/picks-bans/rateLimit";
import type { PicksBansBallot } from "../src/lib/picks-bans/types";

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

function ballot(overrides: Partial<PicksBansBallot> = {}): PicksBansBallot {
  return {
    id: overrides.id ?? "ballot-id",
    round_id: overrides.round_id ?? "round-id",
    viewer_twitch_user_id: overrides.viewer_twitch_user_id ?? null,
    anon_session_id: overrides.anon_session_id ?? null,
    picks_tracks: overrides.picks_tracks ?? [],
    bans_tracks: overrides.bans_tracks ?? [],
    picks_item_modes: overrides.picks_item_modes ?? [],
    bans_item_modes: overrides.bans_item_modes ?? [],
    picks_item_literal: overrides.picks_item_literal ?? [],
    bans_item_literal: overrides.bans_item_literal ?? [],
    locked_at: overrides.locked_at ?? null,
    viewer_display_name: overrides.viewer_display_name ?? null,
    created_at: overrides.created_at ?? "2026-05-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-05-01T00:00:00Z",
  };
}

async function main() {
  // ---------- Aggregator ---------------------------------------------------

  section("Picks/Bans aggregator — track counts");

  await test("Single ballot — picks tally as 1 each", () => {
    const result = aggregateBallots([
      ballot({
        anon_session_id: "a1",
        picks_tracks: ["mushroom-mario-kart-stadium", "flower-mario-circuit"],
      }),
    ]);
    assert.equal(result.tracks.totals.picks, 2);
    assert.equal(result.tracks.totals.bans, 0);
    assert.equal(result.tracks.topPicks.length, 2);
    assert.deepEqual(
      result.tracks.topPicks.map((r) => r.id).sort(),
      ["flower-mario-circuit", "mushroom-mario-kart-stadium"]
    );
  });

  await test("Multiple ballots — counts add up across viewers", () => {
    const result = aggregateBallots([
      ballot({
        anon_session_id: "a1",
        picks_tracks: ["mushroom-mario-kart-stadium"],
      }),
      ballot({
        anon_session_id: "a2",
        picks_tracks: ["mushroom-mario-kart-stadium", "flower-mario-circuit"],
      }),
      ballot({
        viewer_twitch_user_id: "v1",
        bans_tracks: ["flower-mario-circuit"],
      }),
    ]);
    const top = result.tracks.topPicks[0];
    assert.equal(top.id, "mushroom-mario-kart-stadium");
    assert.equal(top.count, 2);
    assert.equal(result.tracks.topBans[0].id, "flower-mario-circuit");
    assert.equal(result.tracks.totals.picks, 3);
    assert.equal(result.tracks.totals.bans, 1);
  });

  await test("lockedOnly filters out in-progress ballots", () => {
    const all = [
      ballot({
        anon_session_id: "a1",
        picks_tracks: ["t1", "t2"],
        locked_at: "2026-05-01T01:00:00Z",
      }),
      ballot({
        anon_session_id: "a2",
        picks_tracks: ["t1", "t3"],
        locked_at: null,
      }),
    ];
    const open = aggregateBallots(all, { lockedOnly: false });
    const locked = aggregateBallots(all, { lockedOnly: true });
    assert.equal(open.tracks.totals.picks, 4);
    assert.equal(locked.tracks.totals.picks, 2);
  });

  await test("Item modes + literal items aggregate independently", () => {
    const result = aggregateBallots([
      ballot({
        anon_session_id: "a1",
        picks_item_modes: ["frantic-items"],
        bans_item_literal: ["blue-shell"],
      }),
      ballot({
        anon_session_id: "a2",
        picks_item_modes: ["frantic-items", "no-items"],
        picks_item_literal: ["mushroom"],
      }),
    ]);
    assert.equal(result.itemModes.totals.picks, 3);
    assert.equal(result.itemLiteral.totals.picks, 1);
    assert.equal(result.itemLiteral.totals.bans, 1);
    assert.equal(result.itemModes.topPicks[0].id, "frantic-items");
    assert.equal(result.itemModes.topPicks[0].count, 2);
  });

  await test("topN slices the rankings to N entries", () => {
    const result = aggregateBallots([
      ballot({
        anon_session_id: "a1",
        picks_tracks: ["t1", "t2", "t3", "t4", "t5"],
      }),
    ]);
    const top3 = topN(result.tracks, 3);
    assert.equal(top3.picks.length, 3);
  });

  await test("Sorting is stable (count desc, id asc on ties)", () => {
    const result = aggregateBallots([
      ballot({ anon_session_id: "a1", picks_tracks: ["bb", "cc", "aa"] }),
      ballot({ anon_session_id: "a2", picks_tracks: ["bb", "aa"] }),
    ]);
    assert.deepEqual(
      result.tracks.topPicks.slice(0, 3).map((r) => r.id),
      ["aa", "bb", "cc"]
    );
  });

  // ---------- Rate limiter -------------------------------------------------

  section("Picks/Bans rate limiter — token bucket");

  await test("First N writes within window pass", () => {
    _resetBucketsForTesting();
    for (let i = 0; i < 30; i++) {
      const r = checkAndConsumeRateLimit("ip:1.2.3.4");
      assert.equal(r.ok, true, `attempt ${i + 1} should pass`);
    }
  });

  await test("31st write within the same window blocks", () => {
    _resetBucketsForTesting();
    for (let i = 0; i < 30; i++) checkAndConsumeRateLimit("ip:1.2.3.4");
    const blocked = checkAndConsumeRateLimit("ip:1.2.3.4");
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterMs > 0);
  });

  await test("Different IPs have independent buckets", () => {
    _resetBucketsForTesting();
    for (let i = 0; i < 30; i++) checkAndConsumeRateLimit("ip:1.2.3.4");
    const otherIp = checkAndConsumeRateLimit("ip:5.6.7.8");
    assert.equal(otherIp.ok, true);
  });

  // ---------- Source-level contracts ---------------------------------------

  section("Source-level — schema migration + chat handlers");

  const fs = await import("node:fs/promises");
  const migration = await fs.readFile(
    new URL("../supabase/picks-bans-rounds.sql", import.meta.url),
    "utf8"
  );

  await test("Migration creates rounds + ballots tables", () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.session_picks_bans_rounds/);
    assert.match(
      migration,
      /CREATE TABLE IF NOT EXISTS public\.session_picks_bans_ballots/
    );
  });
  await test("Migration enforces one open round per (session, game)", () => {
    assert.match(
      migration,
      /idx_picks_bans_rounds_one_open_per_session_game/
    );
    assert.match(migration, /WHERE status = 'open'/);
  });
  await test("Migration enforces viewer identity XOR (twitch OR anon)", () => {
    assert.match(migration, /viewer_identity_xor/);
  });

  const dispatcher = await fs.readFile(
    new URL("../src/lib/twitch/commands/dispatch.ts", import.meta.url),
    "utf8"
  );

  await test("Dispatcher routes !gs-picks-open + !gs-picks-close", () => {
    assert.match(dispatcher, /case "picks-open":/);
    assert.match(dispatcher, /case "picks-close":/);
  });
  await test("Dispatcher no longer routes !gs-pick-track / !gs-ban-track / etc.", () => {
    assert.doesNotMatch(dispatcher, /case "pick-track":/);
    assert.doesNotMatch(dispatcher, /case "ban-track":/);
    assert.doesNotMatch(dispatcher, /case "clear-track-bans":/);
  });

  const registry = await fs.readFile(
    new URL("../src/lib/modules/registry.ts", import.meta.url),
    "utf8"
  );

  await test("race_randomizer registry lists picks-open + picks-close (drops legacy)", () => {
    assert.match(registry, /"picks-open"/);
    assert.match(registry, /"picks-close"/);
    assert.doesNotMatch(registry, /"pick-track"/);
    assert.doesNotMatch(registry, /"ban-item"/);
  });

  // ---------- Chat messages — centralized strings -------------------------

  section("Picks/Bans messages — centralized strings");

  const messages = await import("../src/lib/twitch/commands/messages");

  await test("picksBansOpenedMessage includes live-view URL + game name", () => {
    const msg = messages.picksBansOpenedMessage({
      streamerSlug: "blorentz",
      gameName: "Mario Kart 8 Deluxe",
    });
    assert.match(msg, /gameshuffle\.co\/live\/blorentz/);
    assert.match(msg, /Mario Kart 8 Deluxe/);
  });
  await test("picksBansClosedMessage handles 0/1/N ballot pluralization", () => {
    const zero = messages.picksBansClosedMessage({
      gameName: "MK8DX",
      ballotCount: 0,
    });
    const one = messages.picksBansClosedMessage({
      gameName: "MK8DX",
      ballotCount: 1,
    });
    const many = messages.picksBansClosedMessage({
      gameName: "MK8DX",
      ballotCount: 7,
    });
    assert.match(zero, /no ballots/i);
    assert.match(one, /1 ballot[^s]/);
    assert.match(many, /7 ballots/);
  });
  await test("picksBansCancelledMessage distinguishes manual vs category_pivot", () => {
    const manual = messages.picksBansCancelledMessage({
      gameName: "MK8DX",
      reason: "manual",
    });
    const pivot = messages.picksBansCancelledMessage({
      gameName: "MK8DX",
      reason: "category_pivot",
    });
    assert.match(manual, /cancelled/i);
    assert.match(pivot, /category changed/i);
  });
  await test("picksBansAppliedMessage lists applied picks + bans", () => {
    const msg = messages.picksBansAppliedMessage({
      gameName: "MK8DX",
      appliedPicks: ["Mario Circuit", "Rainbow Road"],
      appliedBans: ["Baby Park"],
    });
    assert.match(msg, /Mario Circuit/);
    assert.match(msg, /Baby Park/);
    assert.match(msg, /✓/);
    assert.match(msg, /✗/);
  });
  await test("picksBansAutoAppliedMessage signals close + apply combined", () => {
    const msg = messages.picksBansAutoAppliedMessage({
      gameName: "MK8DX",
      appliedPicks: ["Mario Circuit"],
      appliedBans: [],
    });
    assert.match(msg, /closed \+ auto-applied/i);
  });
  await test("picksBansAppliedMessage handles empty results gracefully", () => {
    const msg = messages.picksBansAppliedMessage({
      gameName: "MK8DX",
      appliedPicks: [],
      appliedBans: [],
    });
    assert.match(msg, /no changes|empty results/i);
  });
  await test("picksBansAppliedMessage caps at 5 names per pool", () => {
    const msg = messages.picksBansAppliedMessage({
      gameName: "MK8DX",
      appliedPicks: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
      appliedBans: [],
    });
    assert.match(msg, /P1, P2, P3, P4, P5/);
    assert.doesNotMatch(msg, /P6|P7/);
  });

  // ---------- Apply override + auto-apply contracts ------------------------

  section("Apply path — overrides + auto-apply contracts");

  const actionsSource = await fs.readFile(
    new URL("../src/app/hub/sessions/[slug]/actions.ts", import.meta.url),
    "utf8"
  );

  await test("applyPicksBansResultsAction accepts overrides per pool", () => {
    assert.match(actionsSource, /overrides\?:\s*\{/);
    assert.match(actionsSource, /tracks\?\:\s*\{\s*picks\?\:\s*string\[\]/);
  });
  await test("applyPicksBansResultsAction emits before/after diff in audit", () => {
    assert.match(actionsSource, /before,\s*\n\s*after,/);
  });
  await test("closePicksBansRoundAction triggers auto-apply when mode = 'auto_apply'", () => {
    assert.match(
      actionsSource,
      /round\.recommendation_mode === "auto_apply"/
    );
    assert.match(actionsSource, /autoAppliedOnClose: true/);
  });
  await test("Cancel action posts the cancelled chat message", () => {
    assert.match(actionsSource, /picksBansCancelledMessage/);
  });

  const messagingDoc = await fs.readFile(
    new URL("../docs/picks-bans-messaging-matrix.md", import.meta.url),
    "utf8"
  );
  await test("Messaging matrix doc exists + lists all 5 picks/bans event types", () => {
    assert.match(messagingDoc, /picks_bans_opened/);
    assert.match(messagingDoc, /picks_bans_closed/);
    assert.match(messagingDoc, /picks_bans_applied/);
    assert.match(messagingDoc, /picks_bans_cancelled/);
    assert.match(messagingDoc, /picks_bans_ballot_locked/);
  });

  // ---------- Command catalog --------------------------------------------

  section("Command catalog — per-game availability");

  const catalog = await import("../src/lib/twitch/commands/catalog");

  await test("MK8DX shows all race-randomizer commands", () => {
    const grouped = catalog.getCommandsForGame("mario-kart-8-deluxe");
    const names = grouped.broadcaster.map((c) => c.name);
    assert.ok(names.includes("!gs-track"));
    assert.ok(names.includes("!gs-items"));
    assert.ok(names.includes("!gs-race"));
    assert.ok(names.includes("!gs-picks-open"));
  });

  await test("MKWorld !gs-items no longer carries a 'not catalogued' caveat", () => {
    // MKWorld item modes shipped (14 modes) — the stale caveat was removed.
    // Keeping the test as a regression guard so we don't accidentally
    // reintroduce the warning.
    const grouped = catalog.getCommandsForGame("mario-kart-world");
    const items = grouped.broadcaster.find((c) => c.name === "!gs-items");
    assert.ok(items, "!gs-items should be listed for MKWorld");
    assert.equal(
      items!.caveatBySlug?.["mario-kart-world"],
      undefined,
      "MKWorld should NOT have a stale 'not catalogued yet' caveat"
    );
  });

  await test("GS Queue (gs_default) shows lobby + viewer commands but not race", () => {
    const grouped = catalog.getCommandsForGame("gs_default");
    const broadcasterNames = grouped.broadcaster.map((c) => c.name);
    assert.ok(!broadcasterNames.includes("!gs-track"));
    assert.ok(!broadcasterNames.includes("!gs-items"));
    assert.ok(!broadcasterNames.includes("!gs-race"));
    const viewerNames = grouped.viewer.map((c) => c.name);
    assert.ok(viewerNames.includes("!gs-join"));
    assert.ok(viewerNames.includes("!gs-leave"));
    assert.ok(viewerNames.includes("!gs-help"));
  });

  await test("GS Queue omits !gs-shuffle and !gs-mycombo entirely", () => {
    const grouped = catalog.getCommandsForGame("gs_default");
    const viewerNames = grouped.viewer.map((c) => c.name);
    assert.ok(!viewerNames.includes("!gs-shuffle"));
    assert.ok(!viewerNames.includes("!gs-mycombo"));
  });

  await test("Mod commands available in every category", () => {
    const slugs = ["mario-kart-8-deluxe", "mario-kart-world", "gs_default"];
    for (const slug of slugs) {
      const grouped = catalog.getCommandsForGame(slug);
      const modNames = grouped.mod.map((c) => c.name);
      assert.ok(modNames.includes("!gs-kick"), `!gs-kick missing for ${slug}`);
      assert.ok(modNames.includes("!gs-clear"), `!gs-clear missing for ${slug}`);
    }
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
