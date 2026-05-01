/**
 * Phase A race randomizer — pure-function verification.
 *
 * Run with:
 *   npx tsx scripts/test-race-randomizer.ts
 *
 * DB-coupled flows (chat-command authorization, idempotency under
 * duplicate webhook delivery, recap event emission) are exercised in
 * docs/gs-track-item-randomization-runbook.md as manual smoke tests.
 *
 * What we cover here without a database:
 *   - Module registration + iterator safety (race_randomizer in registry)
 *   - Track + item-preset registry shape (96 + 32 + 3 entries; no
 *     duplicate IDs anywhere)
 *   - applyPicksBansToPool: every branch (no picks no bans / picks only /
 *     bans only / both / pool-becomes-empty)
 *   - randomizeTrack / randomizeItems: respects enabled flag, returns
 *     null when pool is empty, respects picks/bans
 *   - parseCommand: hyphenated command names parse cleanly
 *   - Authorization branch in dispatcher (broadcaster-only) is verified
 *     structurally — the dispatcher source must check ctx.isBroadcaster
 *     before invoking race handlers
 */

import assert from "node:assert/strict";
import {
  ALL_MODULE_IDS,
  MODULE_REGISTRY,
  moduleForChatCommand,
} from "../src/lib/modules/registry";
import {
  applyPicksBansToPool,
  getItemPresetById,
  getTrackById,
  listItemPresetsForGame,
  listTracksForGame,
  randomizeItems,
  randomizeTrack,
} from "../src/lib/randomizers/race";
import { MK8DX_TRACKS } from "../src/lib/randomizers/race/tracks/mk8dx";
import { MKWORLD_TRACKS } from "../src/lib/randomizers/race/tracks/mkworld";
import { MK8DX_ITEM_PRESETS } from "../src/lib/randomizers/race/items/mk8dx";
import { parseCommand } from "../src/lib/twitch/commands/parse";
import { parseSeriesLength } from "../src/lib/randomizers/race/series";

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
  // ---------- Module registration -----------------------------------------

  section("Module registration");

  await test("race_randomizer is in ALL_MODULE_IDS", () => {
    assert.ok(ALL_MODULE_IDS.includes("race_randomizer"));
  });

  await test("race_randomizer has a registry entry", () => {
    const def = MODULE_REGISTRY["race_randomizer"];
    assert.ok(def);
    assert.equal(def.id, "race_randomizer");
    assert.equal(def.requiredTier, "pro");
  });

  await test("race_randomizer chat commands cover the spec", () => {
    const def = MODULE_REGISTRY["race_randomizer"];
    const expected = [
      "track",
      "items",
      "race",
      "pick-track",
      "ban-track",
      "pick-item",
      "ban-item",
      "clear-track-bans",
      "clear-item-bans",
    ];
    for (const cmd of expected) {
      assert.ok(
        def.chatCommands?.includes(cmd),
        `missing chat command '${cmd}' in registry`
      );
    }
  });

  await test("moduleForChatCommand resolves race commands", () => {
    assert.equal(moduleForChatCommand("track"), "race_randomizer");
    assert.equal(moduleForChatCommand("pick-track"), "race_randomizer");
    assert.equal(moduleForChatCommand("clear-item-bans"), "race_randomizer");
  });

  await test("moduleForChatCommand still resolves existing commands", () => {
    assert.equal(moduleForChatCommand("shuffle"), "kart_randomizer");
    assert.equal(moduleForChatCommand("pick"), "picks");
    assert.equal(moduleForChatCommand("ban"), "bans");
  });

  // ---------- Track + item registries -------------------------------------

  section("Track + item registries");

  await test("MK8DX has exactly 96 tracks", () => {
    assert.equal(MK8DX_TRACKS.length, 96);
  });

  await test("MKWorld has exactly 32 tracks", () => {
    assert.equal(MKWORLD_TRACKS.length, 32);
  });

  await test("All MK8DX track IDs are unique", () => {
    const ids = new Set(MK8DX_TRACKS.map((t) => t.id));
    assert.equal(ids.size, MK8DX_TRACKS.length);
  });

  await test("All MKWorld track IDs are unique", () => {
    const ids = new Set(MKWORLD_TRACKS.map((t) => t.id));
    assert.equal(ids.size, MKWORLD_TRACKS.length);
  });

  await test("MK8DX item presets ship as 3 entries (per approved scope)", () => {
    assert.equal(MK8DX_ITEM_PRESETS.length, 3);
    const ids = MK8DX_ITEM_PRESETS.map((p) => p.id).sort();
    assert.deepEqual(ids, ["frantic-items", "no-items", "normal-items"]);
  });

  await test("listTracksForGame returns matching length", () => {
    assert.equal(listTracksForGame("mk8dx").length, 96);
    assert.equal(listTracksForGame("mkworld").length, 32);
  });

  await test("listItemPresetsForGame returns 3 for MK8DX, 0 for MKWorld", () => {
    assert.equal(listItemPresetsForGame("mk8dx").length, 3);
    assert.equal(listItemPresetsForGame("mkworld").length, 0);
  });

  await test("getTrackById finds entries by their cup-prefixed slug", () => {
    const t = getTrackById("propeller-sky-high-sundae");
    assert.ok(t);
    assert.equal(t!.name, "Sky-High Sundae");
    assert.equal(t!.cup, "Propeller");
  });

  await test("getTrackById disambiguates Rainbow Road across cups", () => {
    const a = getTrackById("special-rainbow-road");
    const b = getTrackById("lightning-rainbow-road");
    const c = getTrackById("spiny-rainbow-road");
    assert.ok(a && b && c);
    assert.notEqual(a!.id, b!.id);
    assert.notEqual(b!.id, c!.id);
  });

  await test("getItemPresetById resolves the 3 MK8DX presets", () => {
    assert.ok(getItemPresetById("normal-items"));
    assert.ok(getItemPresetById("frantic-items"));
    assert.ok(getItemPresetById("no-items"));
  });

  // ---------- applyPicksBansToPool ----------------------------------------

  section("applyPicksBansToPool");

  const samplePool = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
  ];

  await test("no picks + no bans → full pool", () => {
    const result = applyPicksBansToPool(samplePool, {
      enabled: true,
      picks: [],
      bans: [],
    });
    assert.equal(result.length, 4);
  });

  await test("picks only → pool restricted to picks", () => {
    const result = applyPicksBansToPool(samplePool, {
      enabled: true,
      picks: ["a", "c"],
      bans: [],
    });
    assert.deepEqual(
      result.map((x) => x.id),
      ["a", "c"]
    );
  });

  await test("bans only → pool excludes bans", () => {
    const result = applyPicksBansToPool(samplePool, {
      enabled: true,
      picks: [],
      bans: ["b"],
    });
    assert.deepEqual(
      result.map((x) => x.id),
      ["a", "c", "d"]
    );
  });

  await test("picks + bans → picks define pool then bans subtract", () => {
    const result = applyPicksBansToPool(samplePool, {
      enabled: true,
      picks: ["a", "b", "c"],
      bans: ["b"],
    });
    assert.deepEqual(
      result.map((x) => x.id),
      ["a", "c"]
    );
  });

  await test("everything banned → pool empty", () => {
    const result = applyPicksBansToPool(samplePool, {
      enabled: true,
      picks: [],
      bans: ["a", "b", "c", "d"],
    });
    assert.equal(result.length, 0);
  });

  // ---------- randomizeTrack / randomizeItems -----------------------------

  section("randomizeTrack / randomizeItems");

  await test("randomizeTrack respects enabled=false", () => {
    const t = randomizeTrack("mk8dx", { enabled: false, picks: [], bans: [] });
    assert.equal(t, null);
  });

  await test("randomizeTrack returns a valid track from MK8DX pool", () => {
    const t = randomizeTrack("mk8dx", { enabled: true, picks: [], bans: [] });
    assert.ok(t);
    assert.equal(t!.game, "mk8dx");
  });

  await test("randomizeTrack respects picks (returns only picked id)", () => {
    const t = randomizeTrack("mk8dx", {
      enabled: true,
      picks: ["propeller-sky-high-sundae"],
      bans: [],
    });
    assert.ok(t);
    assert.equal(t!.id, "propeller-sky-high-sundae");
  });

  await test("randomizeTrack respects bans (never returns banned id)", () => {
    const allButOne = MK8DX_TRACKS.map((t) => t.id).filter(
      (id) => id !== "propeller-sky-high-sundae"
    );
    const t = randomizeTrack("mk8dx", {
      enabled: true,
      picks: [],
      bans: allButOne,
    });
    assert.ok(t);
    assert.equal(t!.id, "propeller-sky-high-sundae");
  });

  await test("randomizeTrack returns null when pool is empty", () => {
    const allIds = MK8DX_TRACKS.map((t) => t.id);
    const t = randomizeTrack("mk8dx", {
      enabled: true,
      picks: [],
      bans: allIds,
    });
    assert.equal(t, null);
  });

  await test("randomizeItems works for MK8DX (3 presets)", () => {
    const p = randomizeItems("mk8dx", { enabled: true, picks: [], bans: [] });
    assert.ok(p);
    assert.equal(p!.game, "mk8dx");
  });

  await test("randomizeItems returns null for MKWorld (out-of-scope per Phase A)", () => {
    const p = randomizeItems("mkworld", { enabled: true, picks: [], bans: [] });
    assert.equal(p, null);
  });

  // ---------- Chat parser hyphen support ----------------------------------

  section("parseCommand — hyphenated commands");

  await test("parses !gs-track", () => {
    const c = parseCommand("!gs-track");
    assert.ok(c);
    assert.equal(c!.name, "track");
    assert.equal(c!.args, "");
  });

  await test("parses !gs-pick-track <id>", () => {
    const c = parseCommand("!gs-pick-track propeller-sky-high-sundae");
    assert.ok(c);
    assert.equal(c!.name, "pick-track");
    assert.equal(c!.args, "propeller-sky-high-sundae");
  });

  await test("parses !gs-clear-track-bans", () => {
    const c = parseCommand("!gs-clear-track-bans");
    assert.ok(c);
    assert.equal(c!.name, "clear-track-bans");
  });

  await test("still parses single-word commands (regression)", () => {
    const c = parseCommand("!gs-shuffle");
    assert.ok(c);
    assert.equal(c!.name, "shuffle");
  });

  await test("bare !gs still resolves correctly", () => {
    const c = parseCommand("!gs");
    assert.ok(c);
    assert.equal(c!.name, "");
  });

  // ---------- Series length parser ----------------------------------------

  section("parseSeriesLength — !gs-race [N]");

  await test("no arg → 1 (single race, preserves legacy behavior)", () => {
    assert.equal(parseSeriesLength(""), 1);
    assert.equal(parseSeriesLength("   "), 1);
  });

  await test("'4' → 4", () => {
    assert.equal(parseSeriesLength("4"), 4);
  });

  await test("'8' → 8", () => {
    assert.equal(parseSeriesLength("8"), 8);
  });

  await test("'16' → 16 (cap)", () => {
    assert.equal(parseSeriesLength("16"), 16);
  });

  await test("'9999' clamps to 16", () => {
    assert.equal(parseSeriesLength("9999"), 16);
  });

  await test("'0' clamps to 1", () => {
    assert.equal(parseSeriesLength("0"), 1);
  });

  await test("negative '-3' clamps to 1", () => {
    assert.equal(parseSeriesLength("-3"), 1);
  });

  await test("garbage 'four' falls back to 1", () => {
    assert.equal(parseSeriesLength("four"), 1);
  });

  await test("trailing args ignored: '4 extra junk' → 4", () => {
    assert.equal(parseSeriesLength("4 extra junk"), 4);
  });

  // ---------- Authorization (structural check) ----------------------------

  section("Race commands are broadcaster-only (structural check)");

  const fs = await import("node:fs/promises");
  const dispatcherSource = await fs.readFile(
    new URL("../src/lib/twitch/commands/dispatch.ts", import.meta.url),
    "utf8"
  );

  await test("race_randomizer dispatch path checks ctx.isBroadcaster", () => {
    // The dispatcher's race_randomizer branch must gate on isBroadcaster
    // before invoking any handler — viewers and mods get silently
    // ignored per spec §5.1.
    assert.match(
      dispatcherSource,
      /race_randomizer[\s\S]{0,200}?if \(!ctx\.isBroadcaster\) return;/
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
