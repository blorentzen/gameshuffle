/**
 * v2 Resolve refactor — flat-list, standalone actions (the walker
 * was removed). Asserts:
 *   - APPLY_DAMAGE_WITH_KO_CHECK applies a damage delta and only
 *     KOs when the new damage meets/exceeds maxHp.
 *   - RESOLVE_BURN_COIN clears conditionB on heads, leaves it on
 *     tails, and logs to coin history.
 *   - RESOLVE_EXTRA_COIN clears the named extra condition on heads,
 *     leaves it on tails, and logs to coin history.
 *   - UPDATE_PIECE_META allows partial updates (name + maxHp +
 *     koValue independently) without resetting damage / conditions.
 *   - playerHasCheckup includes slots with any extra condition,
 *     not just conditionA/B.
 */

import assert from "node:assert/strict";
import {
  makeReducer,
  initialSessionState,
  findSlot,
  playerHasCheckup,
} from "@/lib/companion/state";
import { pokemonMode } from "@/lib/companion/modes/pokemon";

const reducer = makeReducer(pokemonMode);

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------

test("APPLY_DAMAGE_WITH_KO_CHECK applies damage when below maxHp", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Pikachu",
    maxHp: 100,
    koValue: 1,
  });
  s = reducer(s, {
    type: "APPLY_DAMAGE_WITH_KO_CHECK",
    player: "p1",
    position: "active",
    delta: 30,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.damage, 30);
  assert.equal(slot?.occupied, true);
});

test("APPLY_DAMAGE_WITH_KO_CHECK auto-KOs when damage meets maxHp", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Magikarp",
    maxHp: 30,
    koValue: 1,
  });
  // Apply 30 damage = maxHp → KO
  s = reducer(s, {
    type: "APPLY_DAMAGE_WITH_KO_CHECK",
    player: "p1",
    position: "active",
    delta: 30,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.occupied, false, "Magikarp KO'd");
  assert.equal(s.winCounters.p2, 5, "P2 took a prize");
});

test("APPLY_DAMAGE_WITH_KO_CHECK doesn't KO when no maxHp set", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Unknown",
    maxHp: null,
    koValue: 1,
  });
  s = reducer(s, {
    type: "APPLY_DAMAGE_WITH_KO_CHECK",
    player: "p1",
    position: "active",
    delta: 999,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.occupied, true, "no auto-KO without maxHp");
  assert.equal(slot?.damage, 999);
});

test("RESOLVE_BURN_COIN heads clears Burn + logs flip", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "X",
    maxHp: 100,
    koValue: 1,
  });
  s = reducer(s, {
    type: "TOGGLE_CONDITION",
    player: "p1",
    position: "active",
    which: "b",
    value: true,
  });
  // Side "a" = heads
  s = reducer(s, {
    type: "RESOLVE_BURN_COIN",
    player: "p1",
    position: "active",
    side: "a",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.conditionB, false, "Burn cleared on heads");
  assert.equal(s.coinHistory[0]?.side, "a", "flip logged to history");
});

test("RESOLVE_BURN_COIN tails leaves Burn on", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "X",
    maxHp: 100,
    koValue: 1,
  });
  s = reducer(s, {
    type: "TOGGLE_CONDITION",
    player: "p1",
    position: "active",
    which: "b",
    value: true,
  });
  s = reducer(s, {
    type: "RESOLVE_BURN_COIN",
    player: "p1",
    position: "active",
    side: "b",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.conditionB, true, "Burn persists on tails");
});

test("RESOLVE_EXTRA_COIN heads clears Asleep + logs flip", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "X",
    maxHp: 100,
    koValue: 1,
  });
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "asleep",
    value: true,
  });
  s = reducer(s, {
    type: "RESOLVE_EXTRA_COIN",
    player: "p1",
    position: "active",
    key: "asleep",
    side: "a",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.extraConditions.asleep, false, "Asleep cleared on heads");
  assert.equal(s.coinHistory[0]?.side, "a");
});

test("RESOLVE_EXTRA_COIN tails leaves the condition on", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "X",
    maxHp: 100,
    koValue: 1,
  });
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "asleep",
    value: true,
  });
  s = reducer(s, {
    type: "RESOLVE_EXTRA_COIN",
    player: "p1",
    position: "active",
    key: "asleep",
    side: "b",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.extraConditions.asleep, true);
});

test("UPDATE_PIECE_META allows partial updates", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Charmander",
    maxHp: 70,
    koValue: 1,
  });
  s = reducer(s, {
    type: "ADJUST_DAMAGE",
    player: "p1",
    position: "active",
    delta: 20,
  });
  // Evolve to Charmeleon — name + HP change, damage preserved.
  s = reducer(s, {
    type: "UPDATE_PIECE_META",
    player: "p1",
    position: "active",
    name: "Charmeleon",
    maxHp: 90,
  });
  let slot = findSlot(s, "p1", "active");
  assert.equal(slot?.name, "Charmeleon");
  assert.equal(slot?.maxHp, 90);
  assert.equal(slot?.koValue, 1, "koValue preserved when not specified");
  assert.equal(slot?.damage, 20, "damage preserved");

  // Evolve again to Charizard ex — name + HP + koValue change.
  s = reducer(s, {
    type: "UPDATE_PIECE_META",
    player: "p1",
    position: "active",
    name: "Charizard ex",
    maxHp: 170,
    koValue: 2,
  });
  slot = findSlot(s, "p1", "active");
  assert.equal(slot?.name, "Charizard ex");
  assert.equal(slot?.maxHp, 170);
  assert.equal(slot?.koValue, 2);
  assert.equal(slot?.damage, 20, "damage still preserved");
});

test("UPDATE_PIECE_META on empty slot is a no-op", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "UPDATE_PIECE_META",
    player: "p1",
    position: "bench_1",
    name: "ghost",
    maxHp: 100,
    koValue: 3,
  });
  const slot = findSlot(s, "p1", "bench_1");
  assert.equal(slot?.occupied, false);
  assert.equal(slot?.name, null);
});

test("playerHasCheckup includes slots with extra conditions only", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Sleeper",
    maxHp: 80,
    koValue: 1,
  });
  // No conditionA/B — but has Asleep.
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "asleep",
    value: true,
  });
  assert.equal(playerHasCheckup(s, "p1"), true, "Asleep alone counts");
  assert.equal(playerHasCheckup(s, "p2"), false);
});

test("LOAD_SAVED_STATE restores slots, names, counters, gameSettings + resets history", () => {
  let s = initialSessionState(pokemonMode);
  // Set up some history first so we can confirm it gets cleared on
  // load (history isn't persisted with the save).
  s = reducer(s, { type: "LOG_COIN_FLIP", side: "a" });
  s = reducer(s, { type: "LOG_DICE_ROLL", faces: 6, result: 3 });

  s = reducer(s, {
    type: "LOAD_SAVED_STATE",
    snapshot: {
      slots: s.slots.map((slot) =>
        slot.player === "p1" && slot.position === "active"
          ? {
              ...slot,
              occupied: true,
              name: "Restored Charizard",
              maxHp: 170,
              damage: 50,
              koValue: 2,
            }
          : slot,
      ),
      playerNames: { p1: "Restored P1", p2: "Restored P2" },
      winCounters: { p1: 3, p2: 5 },
      gameSettings: {
        format: "miniGame",
        prizeCount: 3,
        benchSize: 5,
        allowMega: true,
        evolutionClearsConditions: true,
        gameStarted: false, // Reducer should force this to true
      },
    },
  });

  assert.equal(s.playerNames.p1, "Restored P1");
  assert.equal(s.winCounters.p1, 3);
  assert.equal(s.gameSettings.format, "miniGame");
  assert.equal(s.gameSettings.gameStarted, true, "gameStarted forced true on load");
  assert.equal(s.coinHistory.length, 0, "coin history reset");
  assert.equal(s.diceHistory.length, 0, "dice history reset");
  assert.equal(s.nextHistoryId, 1);
  assert.equal(s.winner, null);

  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.name, "Restored Charizard");
  assert.equal(slot?.damage, 50);
  assert.equal(slot?.koValue, 2);
});

test("playerHasCheckup also counts Paralyzed / Confused (informational)", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Confused mon",
    maxHp: 80,
    koValue: 1,
  });
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "confused",
    value: true,
  });
  assert.equal(playerHasCheckup(s, "p1"), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
