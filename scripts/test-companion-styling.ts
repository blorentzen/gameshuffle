/**
 * Scope §11 (revised) — slot personalization, theme-driven.
 *
 * Asserts:
 *   - Fresh slots default to slotTheme = "none" (unstyled).
 *   - PLACE_PIECE accepts slotTheme (and defaults when omitted).
 *   - STYLE_SLOT updates slotTheme without touching anything else.
 *   - MOVE_PIECE carries slotTheme with the piece (move + swap).
 *   - REMOVE_PIECE + KNOCKOUT reset slotTheme to "none".
 *   - Pokémon Mode ships all 10 expected energy-type themes.
 */

import assert from "node:assert/strict";
import { makeReducer, initialSessionState, findSlot } from "@/lib/companion/state";
import { pokemonMode } from "@/lib/companion/modes/pokemon";
import { DEFAULT_SLOT_THEME, NO_THEME_KEY } from "@/lib/companion/styling";

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

test("Fresh slots default to slotTheme='none'", () => {
  const s = initialSessionState(pokemonMode);
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.slotTheme, NO_THEME_KEY);
});

test("PLACE_PIECE without slotTheme keeps default", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Default",
    maxHp: 100,
    koValue: 1,
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.slotTheme, DEFAULT_SLOT_THEME);
});

test("PLACE_PIECE with slotTheme applies it", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Charizard",
    maxHp: 150,
    koValue: 2,
    slotTheme: "fire",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.slotTheme, "fire");
});

test("STYLE_SLOT updates slotTheme only", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Foo",
    maxHp: 90,
    koValue: 2,
  });
  s = reducer(s, {
    type: "ADJUST_DAMAGE",
    player: "p1",
    position: "active",
    delta: 30,
  });
  s = reducer(s, {
    type: "STYLE_SLOT",
    player: "p1",
    position: "active",
    slotTheme: "water",
  });
  const slot = findSlot(s, "p1", "active");
  assert.equal(slot?.slotTheme, "water");
  // Everything else preserved.
  assert.equal(slot?.name, "Foo");
  assert.equal(slot?.maxHp, 90);
  assert.equal(slot?.koValue, 2);
  assert.equal(slot?.damage, 30);
});

test("MOVE_PIECE carries slotTheme with the piece (active → bench)", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Carrier",
    maxHp: 100,
    koValue: 1,
    slotTheme: "psychic",
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "active",
    to: "bench_3",
  });
  const moved = findSlot(s, "p1", "bench_3");
  const source = findSlot(s, "p1", "active");
  assert.equal(moved?.slotTheme, "psychic");
  // Source slot is empty — theme snaps back to default.
  assert.equal(source?.slotTheme, DEFAULT_SLOT_THEME);
});

test("MOVE_PIECE swap: each piece keeps its own slotTheme", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Active",
    maxHp: 100,
    koValue: 1,
    slotTheme: "fire",
  });
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "bench_1",
    name: "Bench",
    maxHp: 80,
    koValue: 1,
    slotTheme: "grass",
  });
  s = reducer(s, {
    type: "MOVE_PIECE",
    player: "p1",
    from: "active",
    to: "bench_1",
  });
  const newBench = findSlot(s, "p1", "bench_1");
  const newActive = findSlot(s, "p1", "active");
  assert.equal(newBench?.name, "Active");
  assert.equal(newBench?.slotTheme, "fire");
  assert.equal(newActive?.name, "Bench");
  assert.equal(newActive?.slotTheme, "grass");
});

test("REMOVE_PIECE clears slotTheme", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p2",
    position: "bench_2",
    name: "Discarded",
    maxHp: 60,
    koValue: 1,
    slotTheme: "darkness",
  });
  s = reducer(s, { type: "REMOVE_PIECE", player: "p2", position: "bench_2" });
  const slot = findSlot(s, "p2", "bench_2");
  assert.equal(slot?.slotTheme, DEFAULT_SLOT_THEME);
});

test("KNOCKOUT clears slotTheme", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, {
    type: "PLACE_PIECE",
    player: "p2",
    position: "bench_4",
    name: "KO'd",
    maxHp: 60,
    koValue: 1,
    slotTheme: "dragon",
  });
  s = reducer(s, { type: "KNOCKOUT", player: "p2", position: "bench_4" });
  const slot = findSlot(s, "p2", "bench_4");
  assert.equal(slot?.slotTheme, DEFAULT_SLOT_THEME);
});

test("Pokémon Mode ships all 10 expected energy-type themes", () => {
  const expected = [
    "grass",
    "fire",
    "water",
    "lightning",
    "psychic",
    "fighting",
    "darkness",
    "metal",
    "dragon",
    "colorless",
  ];
  const keys = pokemonMode.slotThemes.map((t) => t.key);
  assert.deepEqual(keys, expected);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
