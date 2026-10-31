/**
 * Companion groundwork (2026-10-11): Undo history and manual damage Knock Outs.
 *   npx tsx scripts/test-companion-undo.ts
 */

import assert from "node:assert/strict";
import { UNDO_CAP, findSlot, initialSessionState, makeReducer, withHistory, type HistoryState } from "@/lib/companion/state";
import { pokemonMode } from "@/lib/companion/modes/pokemon";

const reducer = makeReducer(pokemonMode);
const history = withHistory(reducer);

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`ok  ${name}`); } catch (err) { failed++; console.error(`FAIL ${name}`); console.error(err); }
}

function started(): HistoryState {
  let h: HistoryState = { present: initialSessionState(pokemonMode), past: [] };
  h = history(h, { type: "APPLY_GAME_SETTINGS", settings: { ...h.present.gameSettings, prizeCount: 1, gameStarted: true } });
  return h;
}

test("manual damage reaching HP is a Knock Out, prizes and all", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Pikachu", maxHp: 60, koValue: 1 });
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 50 });
  assert.equal(findSlot(s, "p1", "active")?.occupied, true);
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 10 });
  assert.equal(findSlot(s, "p1", "active")?.occupied, false);
  assert.equal(s.winCounters.p2, 5);
});

test("taking damage off never knocks out; no HP set never knocks out", () => {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Mew", maxHp: null, koValue: 1 });
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 500 });
  assert.equal(findSlot(s, "p1", "active")?.occupied, true);
  s = reducer(s, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: -100 });
  assert.equal(findSlot(s, "p1", "active")?.damage, 400);
});

test("Undo after the game-ending Knock Out puts the Pokémon back and clears the winner", () => {
  let h = started();
  h = history(h, { type: "PLACE_PIECE", player: "p2", position: "active", name: "Gyarados ex", maxHp: 330, koValue: 2 });
  h = history(h, { type: "KNOCKOUT", player: "p2", position: "active" });
  assert.equal(h.present.winner, "p1");
  assert.equal(h.present.winCounters.p1, 0);
  h = history(h, { type: "UNDO" });
  assert.equal(h.present.winner, null);
  assert.equal(h.present.winCounters.p1, 1);
  assert.equal(findSlot(h.present, "p2", "active")?.name, "Gyarados ex");
  // A second Undo steps back the placement, never a prize change.
  h = history(h, { type: "UNDO" });
  assert.equal(findSlot(h.present, "p2", "active")?.occupied, false);
  assert.equal(h.present.winCounters.p1, 1);
});

test("coin and dice logs aren't moves: Undo skips them and keeps them", () => {
  let h = started();
  h = history(h, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Pikachu", maxHp: 60, koValue: 1 });
  h = history(h, { type: "LOG_COIN_FLIP", side: "a" });
  h = history(h, { type: "UNDO" });
  assert.equal(findSlot(h.present, "p1", "active")?.occupied, false);
  assert.equal(h.present.coinHistory.length, 1);
});

test("a new game, a loaded game or new settings leave nothing to undo", () => {
  let h = started();
  h = history(h, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Pikachu", maxHp: 60, koValue: 1 });
  assert.equal(h.past.length, 1);
  h = history(h, { type: "RESET_GAME", mode: pokemonMode });
  assert.equal(h.past.length, 0);
  assert.equal(history(h, { type: "UNDO" }), h);
});

test("Undo goes back at most UNDO_CAP steps", () => {
  let h = started();
  h = history(h, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Pikachu", maxHp: 999, koValue: 1 });
  for (let i = 0; i < UNDO_CAP + 20; i++) h = history(h, { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 10 });
  assert.equal(h.past.length, UNDO_CAP);
});

test("a change that changes nothing isn't recorded", () => {
  const h = started();
  const same = history(h, { type: "MOVE_PIECE", player: "p1", from: "active", to: "active" });
  assert.equal(same, h);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
