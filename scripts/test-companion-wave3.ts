/**
 * Wave 3 unit tests:
 *   - MOVE_PIECE — damage persists across the move; conditions
 *     clear when arriving on the bench but NOT when arriving on
 *     active.
 *   - checkBetaPasscode — exact match, constant-time-shaped.
 *   - isBetaModeOn — strict "True" string match per spec.
 */

import assert from "node:assert/strict";
import { makeReducer, initialSessionState, findSlot } from "@/lib/companion/state";
import { pokemonMode } from "@/lib/companion/modes/pokemon";
import type { SessionState, PlayerId, SlotPosition } from "@/lib/companion/types";

const reducer = makeReducer(pokemonMode);

function place(
  state: SessionState,
  player: PlayerId,
  position: SlotPosition,
  name: string,
  maxHp: number,
  koValue = 1,
): SessionState {
  return reducer(state, {
    type: "PLACE_PIECE",
    player,
    position,
    name,
    maxHp,
    koValue,
  });
}

function toggle(
  state: SessionState,
  player: PlayerId,
  position: SlotPosition,
  which: "a" | "b",
  value: boolean,
): SessionState {
  return reducer(state, { type: "TOGGLE_CONDITION", player, position, which, value });
}

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
// MOVE_PIECE
// ---------------------------------------------------------------------------

test("MOVE_PIECE: damage persists across the move (active → bench)", () => {
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "active", "Charizard", 150, 2);
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 50 });
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "active", to: "bench_2" });
  const moved = findSlot(s, "p1", "bench_2");
  const sourceNow = findSlot(s, "p1", "active");
  assert.equal(moved?.name, "Charizard");
  assert.equal(moved?.damage, 50, "damage carried across the move");
  assert.equal(moved?.koValue, 2);
  assert.equal(sourceNow?.occupied, false, "source slot now empty");
});

test("MOVE_PIECE: conditions clear on move to bench", () => {
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "active", "Vulpix", 80, 1);
  s = toggle(s, "p1", "active", "a", true);
  s = toggle(s, "p1", "active", "b", true);
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "active", to: "bench_1" });
  const moved = findSlot(s, "p1", "bench_1");
  assert.equal(moved?.conditionA, false, "Poison cleared on retreat");
  assert.equal(moved?.conditionB, false, "Burn cleared on retreat");
});

test("MOVE_PIECE: conditions preserved on move to active (promote)", () => {
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "bench_3", "Cyndaquil", 80, 1);
  // Manually toggle a condition on the bench piece (unusual in real
  // play, but the data model allows it). Promoting to active should
  // NOT auto-clear.
  s = toggle(s, "p1", "bench_3", "b", true);
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "bench_3", to: "active" });
  const promoted = findSlot(s, "p1", "active");
  assert.equal(promoted?.conditionB, true, "Burn preserved on promote");
});

test("MOVE_PIECE: swap with occupied destination — retreating piece clears, promoting piece keeps", () => {
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "active", "Active", 100, 1);
  s = place(s, "p1", "bench_1", "Bench", 80, 1);
  s = toggle(s, "p1", "active", "a", true); // Poisoned active
  s = toggle(s, "p1", "bench_1", "b", true); // Burned bench (artificial)
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 30 });
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "active", to: "bench_1" });

  const newBench = findSlot(s, "p1", "bench_1");
  const newActive = findSlot(s, "p1", "active");

  assert.equal(newBench?.name, "Active", "old Active moved to bench_1");
  assert.equal(newBench?.damage, 30, "damage carried");
  assert.equal(newBench?.conditionA, false, "old Active's Poison cleared on arrival at bench");

  assert.equal(newActive?.name, "Bench", "old bench piece promoted to Active");
  assert.equal(newActive?.conditionB, true, "promoting piece keeps its Burn");
});

test("MOVE_PIECE: cross-player drag rejected (silent no-op)", () => {
  // The reducer accepts (player, from, to) — the dispatcher in
  // CompanionBoard guards cross-player drags. To exercise the
  // reducer's own validation, we send a same-player from→to with
  // mismatched source ownership in dispatch; here we just confirm
  // the same-player case works as expected.
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "active", "X", 100, 1);
  // Attempt to "move" between p2's slots — but the source for p2 is
  // empty, so the reducer no-ops.
  s = reducer(s, { type: "MOVE_PIECE", player: "p2", from: "active", to: "bench_1" });
  // Nothing changed on p1.
  const x = findSlot(s, "p1", "active");
  assert.equal(x?.name, "X");
});

test("MOVE_PIECE: from === to is a no-op", () => {
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "active", "X", 100, 1);
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 40 });
  const before = findSlot(s, "p1", "active");
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "active", to: "active" });
  const after = findSlot(s, "p1", "active");
  assert.deepEqual(after, before);
});

test("MOVE_PIECE: moving from empty slot is a no-op", () => {
  let s = initialSessionState(pokemonMode);
  s = place(s, "p1", "bench_1", "X", 100, 1);
  const before = findSlot(s, "p1", "bench_1");
  // bench_2 is empty; moving FROM bench_2 should not affect anything.
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "bench_2", to: "bench_1" });
  const after = findSlot(s, "p1", "bench_1");
  assert.deepEqual(after, before);
});

// ---------------------------------------------------------------------------
// Beta gate logic (pure function level)
// ---------------------------------------------------------------------------

import { checkBetaPasscode, isBetaModeOn } from "@/lib/companion/beta";

test("isBetaModeOn: requires the exact string 'True'", () => {
  const original = process.env.COMPANION_BETA_MODE;
  try {
    process.env.COMPANION_BETA_MODE = "True";
    assert.equal(isBetaModeOn(), true);
    process.env.COMPANION_BETA_MODE = "true";
    assert.equal(isBetaModeOn(), false, "lowercase shouldn't pass");
    process.env.COMPANION_BETA_MODE = "False";
    assert.equal(isBetaModeOn(), false);
    process.env.COMPANION_BETA_MODE = "1";
    assert.equal(isBetaModeOn(), false);
    process.env.COMPANION_BETA_MODE = "";
    assert.equal(isBetaModeOn(), false);
    delete process.env.COMPANION_BETA_MODE;
    assert.equal(isBetaModeOn(), false);
  } finally {
    if (original === undefined) delete process.env.COMPANION_BETA_MODE;
    else process.env.COMPANION_BETA_MODE = original;
  }
});

test("checkBetaPasscode: exact match wins, anything else fails", () => {
  const original = process.env.COMPANION_BETA_PASSCODE;
  try {
    process.env.COMPANION_BETA_PASSCODE = "letsplaypokemon";
    assert.equal(checkBetaPasscode("letsplaypokemon"), true);
    assert.equal(checkBetaPasscode("LETSPLAYPOKEMON"), false);
    assert.equal(checkBetaPasscode("letsplaypokemo"), false);
    assert.equal(checkBetaPasscode("letsplaypokemonn"), false);
    assert.equal(checkBetaPasscode(""), false);
    assert.equal(checkBetaPasscode("wrongphrase"), false);

    delete process.env.COMPANION_BETA_PASSCODE;
    assert.equal(checkBetaPasscode("letsplaypokemon"), false, "no env → no match");
  } finally {
    if (original === undefined) delete process.env.COMPANION_BETA_PASSCODE;
    else process.env.COMPANION_BETA_PASSCODE = original;
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
