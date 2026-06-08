/**
 * v2 UX add — informational status conditions (Asleep, Paralyzed,
 * Confused). Asserts:
 *   - Fresh slots have an empty extraConditions map.
 *   - TOGGLE_EXTRA_CONDITION on/off works.
 *   - Mutual exclusion within an exclusiveGroup (only one of
 *     Asleep/Paralyzed/Confused at a time).
 *   - Token conditions (Poison/Burn) stay stackable with status.
 *   - MOVE_PIECE clears extraConditions on retreat to bench,
 *     preserves on promote to active.
 *   - REMOVE_PIECE + KNOCKOUT clear extraConditions.
 */

import assert from "node:assert/strict";
import { makeReducer, initialSessionState, findSlot } from "@/lib/companion/state";
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

test("Pokémon Mode ships Asleep / Paralyzed / Confused as exclusive 'status' group", () => {
  const keys = pokemonMode.extraConditions.map((c) => c.key);
  assert.deepEqual(keys, ["asleep", "paralyzed", "confused"]);
  for (const c of pokemonMode.extraConditions) {
    assert.equal(c.exclusiveGroup, "status");
  }
});

test("Fresh slots have empty extraConditions", () => {
  const s = initialSessionState(pokemonMode);
  const slot = findSlot(s, "p1", "active");
  assert.deepEqual(slot?.extraConditions, {});
});

test("TOGGLE_EXTRA_CONDITION turns a condition on, then off", () => {
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
  assert.equal(findSlot(s, "p1", "active")?.extraConditions.asleep, true);
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "asleep",
    value: false,
  });
  assert.equal(findSlot(s, "p1", "active")?.extraConditions.asleep, false);
});

test("Mutual exclusion: turning on Paralyzed clears Asleep", () => {
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
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "paralyzed",
    value: true,
  });
  const ec = findSlot(s, "p1", "active")?.extraConditions;
  assert.equal(ec?.asleep, false, "Asleep cleared when Paralyzed toggled on");
  assert.equal(ec?.paralyzed, true, "Paralyzed is on");
});

test("Turning off a status doesn't affect the others in the group", () => {
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
    key: "confused",
    value: true,
  });
  // Turning off Confused shouldn't enable Asleep/Paralyzed.
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "confused",
    value: false,
  });
  // Siblings get set to `false` when Confused was first turned on
  // (mutual exclusion); they stay `false` through the off-toggle.
  // false/undefined are equivalent for "off" so both are valid here.
  const ec = findSlot(s, "p1", "active")?.extraConditions;
  assert.ok(!ec?.confused, "Confused is off");
  assert.ok(!ec?.asleep, "Asleep is off");
  assert.ok(!ec?.paralyzed, "Paralyzed is off");
});

test("Poison + Burn + Asleep can coexist (Asleep is not in token group)", () => {
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
    which: "a",
    value: true,
  });
  s = reducer(s, {
    type: "TOGGLE_CONDITION",
    player: "p1",
    position: "active",
    which: "b",
    value: true,
  });
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "asleep",
    value: true,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.conditionA, true);
  assert.equal(slot?.conditionB, true);
  assert.equal(slot?.extraConditions.asleep, true);
});

test("MOVE_PIECE: active → bench clears extraConditions (retreat rule)", () => {
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
    key: "paralyzed",
    value: true,
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "active",
    to: "bench_1",
  });
  const moved = findSlot(s, "p1", "bench_1");
  assert.deepEqual(moved?.extraConditions, {}, "Paralyzed cleared on retreat");
});

test("MOVE_PIECE: bench → active preserves extraConditions (promote)", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "bench_1",
    name: "X",
    maxHp: 100,
    koValue: 1,
  });
  // Edge case: bench piece somehow has a status condition. Promoting
  // to active should NOT auto-clear (matches conditionA/B behavior).
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "bench_1",
    key: "confused",
    value: true,
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "bench_1",
    to: "active",
  });
  const promoted = findSlot(s, "p1", "active");
  assert.equal(promoted?.extraConditions.confused, true, "Confused preserved on promote");
});

test("REMOVE_PIECE clears extraConditions", () => {
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
  s = reducer(s, { type: "REMOVE_PIECE", player: "p1", position: "active" });
  const slot = findSlot(s, "p1", "active");
  assert.deepEqual(slot?.extraConditions, {});
});

test("KNOCKOUT clears extraConditions", () => {
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
    key: "paralyzed",
    value: true,
  });
  s = reducer(s, { type: "KNOCKOUT", player: "p1", position: "active" });
  const slot = findSlot(s, "p1", "active");
  assert.deepEqual(slot?.extraConditions, {});
});

test("Toggling an unknown condition key is a no-op", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "X",
    maxHp: 100,
    koValue: 1,
  });
  const before = findSlot(s, "p1", "active");
  s = reducer(s, {
    type: "TOGGLE_EXTRA_CONDITION",
    player: "p1",
    position: "active",
    key: "nonexistent",
    value: true,
  });
  const after = findSlot(s, "p1", "active");
  assert.deepEqual(before, after);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
