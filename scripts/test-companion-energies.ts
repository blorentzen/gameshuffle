/**
 * Energy attachment behavior — verifies the new ADJUST_ENERGY +
 * CLEAR_ENERGIES actions and confirms energies travel with the
 * piece through MOVE_PIECE (TCG-accurate — energies don't auto-
 * discard on retreat; the user pays retreat cost manually).
 */

import assert from "node:assert/strict";
import {
  makeReducer,
  initialSessionState,
  findSlot,
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

test("Pokémon Mode exposes the expected 10 energy types", () => {
  const keys = pokemonMode.energyTypes.map((d) => d.key);
  assert.deepEqual(keys, [
    "grass",
    "fire",
    "water",
    "lightning",
    "psychic",
    "fighting",
    "darkness",
    "metal",
    "colorless",
    "special",
  ]);
});

test("Special Energy uses sparkles-2 icon (distinct from Psychic's sparkles)", () => {
  const psychic = pokemonMode.energyTypes.find((d) => d.key === "psychic");
  const special = pokemonMode.energyTypes.find((d) => d.key === "special");
  assert.equal(psychic?.icon, "sparkles");
  assert.equal(special?.icon, "sparkles-2");
});

test("Empty slot starts with no energies attached", () => {
  const s = initialSessionState(pokemonMode);
  const slot = findSlot(s, "p1", "active");
  assert.deepEqual(slot?.energies, {});
});

test("ADJUST_ENERGY: positive delta attaches energy", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Charizard",
    maxHp: 170,
    koValue: 2,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "fire",
    delta: 1,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "fire",
    delta: 1,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.energies.fire, 2);
});

test("ADJUST_ENERGY: negative delta detaches but clamps at 0", () => {
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
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "water",
    delta: 3,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "water",
    delta: -1,
  });
  let slot = findSlot(s, "p1", "active");
  assert.equal(slot?.energies.water, 2);
  // Drain past zero — should clamp.
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "water",
    delta: -10,
  });
  slot = findSlot(s, "p1", "active");
  assert.equal(slot?.energies.water, 0);
});

test("ADJUST_ENERGY: different types tracked independently", () => {
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
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "fire",
    delta: 2,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "lightning",
    delta: 1,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "special",
    delta: 1,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.energies.fire, 2);
  assert.equal(slot?.energies.lightning, 1);
  assert.equal(slot?.energies.special, 1);
});

test("ADJUST_ENERGY on empty slot is a no-op", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "bench_1",
    energyKey: "grass",
    delta: 5,
  });
  const slot = findSlot(s, "p1", "bench_1");
  assert.deepEqual(slot?.energies, {});
});

test("CLEAR_ENERGIES wipes everything in one shot", () => {
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
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "fire",
    delta: 2,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "water",
    delta: 1,
  });
  s = reducer(s, {
    type: "CLEAR_ENERGIES",
    player: "p1",
    position: "active",
  });
  const slot = findSlot(s, "p1", "active");
  assert.deepEqual(slot?.energies, {});
});

test("MOVE_PIECE Active→Bench (retreat) carries energies with the piece", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Charizard",
    maxHp: 170,
    koValue: 2,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "fire",
    delta: 3,
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "active",
    to: "bench_1",
  });
  const activeSlot = findSlot(s, "p1", "active");
  const benchSlot = findSlot(s, "p1", "bench_1");
  assert.equal(activeSlot?.occupied, false, "active is now empty");
  assert.equal(benchSlot?.name, "Charizard");
  assert.equal(
    benchSlot?.energies.fire,
    3,
    "all 3 fire energies traveled with the retreat",
  );
});

test("MOVE_PIECE Bench→Active (promote) carries energies with the piece", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "bench_2",
    name: "Pikachu",
    maxHp: 70,
    koValue: 1,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "bench_2",
    energyKey: "lightning",
    delta: 2,
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "bench_2",
    to: "active",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.name, "Pikachu");
  assert.equal(slot?.energies.lightning, 2);
});

test("MOVE_PIECE swap (Active <-> Bench) carries energies on BOTH pieces", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Active mon",
    maxHp: 100,
    koValue: 1,
  });
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "bench_1",
    name: "Bench mon",
    maxHp: 80,
    koValue: 1,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "active",
    energyKey: "fire",
    delta: 2,
  });
  s = reducer(s, {
    type: "ADJUST_ENERGY",
    player: "p1",
    position: "bench_1",
    energyKey: "water",
    delta: 1,
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "active",
    to: "bench_1",
  });
  const newActive = findSlot(s, "p1", "active");
  const newBench = findSlot(s, "p1", "bench_1");
  assert.equal(newActive?.name, "Bench mon");
  assert.equal(newActive?.energies.water, 1, "water energy promoted with bench mon");
  assert.equal(newBench?.name, "Active mon");
  assert.equal(newBench?.energies.fire, 2, "fire energy retreated with active mon");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
