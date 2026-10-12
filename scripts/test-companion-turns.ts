/**
 * Companion turns on the board (2026-10-11): who's up, the once-a-turn ticks
 * the board makes by itself, attacks, and turn state surviving a save.
 *   npx tsx scripts/test-companion-turns.ts
 */

import assert from "node:assert/strict";
import { findSlot, initialSessionState, makeReducer, withHistory, type HistoryState } from "@/lib/companion/state";
import { pokemonMode } from "@/lib/companion/modes/pokemon";
import { parseCardRules } from "@/lib/companion/pokemonRules";
import type { SessionState } from "@/lib/companion/types";
import { remindFor, selfDamage } from "@/lib/companion/reminders";

const reducer = makeReducer(pokemonMode);
const history = withHistory(reducer);

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`ok  ${name}`); } catch (err) { failed++; console.error(`FAIL ${name}`); console.error(err); }
}

const pikachuRules = parseCardRules({ types: ["Lightning"], subtypes: ["Basic", "ex"], hp: "190", attacks: [{ name: "Thunderbolt", cost: ["Lightning"], damage: "140" }], retreat_cost: ["Colorless"] });

function board(): SessionState {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, { type: "APPLY_GAME_SETTINGS", settings: { ...s.gameSettings, gameStarted: true } });
  s = reducer(s, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Pikachu ex", maxHp: 190, koValue: 2, rules: pikachuRules });
  s = reducer(s, { type: "PLACE_PIECE", player: "p1", position: "bench_1", name: "Raichu", maxHp: 120, koValue: 1 });
  s = reducer(s, { type: "PLACE_PIECE", player: "p2", position: "active", name: "Gyarados", maxHp: 130, koValue: 1 });
  return s;
}

test("no turn tracking until the flip; pieces placed before it have no turn", () => {
  const s = board();
  assert.equal(s.turn ?? null, null);
  assert.equal(findSlot(s, "p1", "active")?.enteredTurn, null);
  assert.equal(findSlot(s, "p1", "active")?.rules?.attacks[0].name, "Thunderbolt");
});

test("turns alternate, count up, and start each turn fresh", () => {
  let s = reducer(board(), { type: "START_TURNS", first: "p2" });
  assert.deepEqual([s.turn?.number, s.turn?.player, s.turn?.first], [1, "p2", "p2"]);
  s = reducer(s, { type: "MARK_USED", key: "supporter", value: true });
  assert.equal(s.turn?.used.supporter, true);
  s = reducer(s, { type: "END_TURN" });
  assert.deepEqual([s.turn?.number, s.turn?.player, s.turn?.used.supporter], [2, "p1", false]);
  s = reducer(s, { type: "END_TURN" });
  assert.deepEqual([s.turn?.number, s.turn?.player], [3, "p2"]);
});

test("the board ticks Energy and retreat for the player whose turn it is, and only them", () => {
  let s = reducer(board(), { type: "START_TURNS", first: "p1" });
  // The other player's Pokémon getting Energy (a card effect) isn't your attachment.
  s = reducer(s, { type: "ADJUST_ENERGY", player: "p2", position: "active", energyKey: "water", delta: 1 });
  assert.equal(s.turn?.used.energy, false);
  // Taking Energy off isn't an attachment either.
  s = reducer(s, { type: "ADJUST_ENERGY", player: "p1", position: "active", energyKey: "lightning", delta: -1 });
  assert.equal(s.turn?.used.energy, false);
  s = reducer(s, { type: "ADJUST_ENERGY", player: "p1", position: "active", energyKey: "lightning", delta: 1 });
  assert.equal(s.turn?.used.energy, true);
  // Swapping the Active with the Bench is the retreat; the piece keeps its rules.
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "active", to: "bench_2" });
  assert.equal(s.turn?.used.retreat, true);
  assert.equal(findSlot(s, "p1", "bench_2")?.rules?.hp, 190);
});

test("promoting into an empty Active after a Knock Out isn't a retreat", () => {
  let s = reducer(board(), { type: "START_TURNS", first: "p1" });
  s = reducer(s, { type: "KNOCKOUT", player: "p1", position: "active" });
  s = reducer(s, { type: "MOVE_PIECE", player: "p1", from: "bench_1", to: "active" });
  assert.equal(s.turn?.used.retreat, false);
});

test("placing and evolving stamp the turn, for the can't-evolve-yet reminder", () => {
  let s = reducer(board(), { type: "START_TURNS", first: "p1" });
  s = reducer(s, { type: "END_TURN" });
  s = reducer(s, { type: "END_TURN" });
  s = reducer(s, { type: "PLACE_PIECE", player: "p1", position: "bench_2", name: "Pichu", maxHp: 30, koValue: 1 });
  assert.equal(findSlot(s, "p1", "bench_2")?.enteredTurn, 3);
  s = reducer(s, { type: "END_TURN" });
  s = reducer(s, { type: "END_TURN" });
  s = reducer(s, { type: "UPDATE_PIECE_META", player: "p1", position: "bench_1", name: "Raichu ex", evolved: true, rules: pikachuRules });
  assert.equal(findSlot(s, "p1", "bench_1")?.enteredTurn, 5);
  // A name fix isn't an evolution.
  s = reducer(s, { type: "UPDATE_PIECE_META", player: "p1", position: "bench_2", name: "Pichu!" });
  assert.equal(findSlot(s, "p1", "bench_2")?.enteredTurn, 3);
});

test("an attack adds damage, ticks the attack, and knocks out at HP", () => {
  let s = reducer(board(), { type: "START_TURNS", first: "p1" });
  s = reducer(s, { type: "ATTACK", target: { player: "p2", position: "active" }, damage: 100 });
  assert.equal(findSlot(s, "p2", "active")?.damage, 100);
  assert.equal(s.turn?.used.attacked, true);
  s = reducer(s, { type: "ATTACK", target: { player: "p2", position: "active" }, damage: 30 });
  assert.equal(findSlot(s, "p2", "active")?.occupied, false);
  assert.equal(s.winCounters.p1, 5);
});

test("an attack's damage to itself lands in the same step, Knock Outs and all", () => {
  let h: HistoryState = { present: reducer(board(), { type: "START_TURNS", first: "p1" }), past: [] };
  h = history(h, { type: "ATTACK", target: { player: "p2", position: "active" }, damage: 220, self: { player: "p1", position: "active", damage: 30 } });
  assert.equal(findSlot(h.present, "p2", "active")?.occupied, false);
  assert.equal(findSlot(h.present, "p1", "active")?.damage, 30);
  h = history(h, { type: "UNDO" });
  assert.equal(findSlot(h.present, "p2", "active")?.damage, 0);
  assert.equal(findSlot(h.present, "p1", "active")?.damage, 0);
  // Knocking itself out gives the other player their prizes too.
  const s = reducer(h.present, { type: "ATTACK", target: { player: "p2", position: "active" }, damage: 10, self: { player: "p1", position: "active", damage: 190 } });
  assert.equal(findSlot(s, "p1", "active")?.occupied, false);
  assert.equal(s.winCounters.p2, 4);
});

test("Paralysis wears off at the end of its owner's turn, not the attacker's", () => {
  let s = reducer(board(), { type: "START_TURNS", first: "p1" });
  s = reducer(s, { type: "TOGGLE_EXTRA_CONDITION", player: "p2", position: "active", key: "paralyzed", value: true });
  s = reducer(s, { type: "END_TURN" }); // p1's turn ends: still Paralyzed for p2's turn
  assert.equal(findSlot(s, "p2", "active")?.extraConditions.paralyzed, true);
  s = reducer(s, { type: "END_TURN" }); // p2's turn ends: it wears off
  assert.equal(findSlot(s, "p2", "active")?.extraConditions.paralyzed, false);
});

test("Undo steps back an ended turn; a new game or new settings clear turns; a loaded game keeps them", () => {
  let h: HistoryState = { present: board(), past: [] };
  h = history(h, { type: "START_TURNS", first: "p1" });
  h = history(h, { type: "MARK_USED", key: "supporter", value: true });
  h = history(h, { type: "END_TURN" });
  h = history(h, { type: "UNDO" });
  assert.deepEqual([h.present.turn?.player, h.present.turn?.used.supporter], ["p1", true]);
  // Ticking something already ticked changes nothing, so it isn't an Undo step.
  assert.equal(history(h, { type: "MARK_USED", key: "supporter", value: true }), h);

  const saved = h.present;
  const loaded = reducer(initialSessionState(pokemonMode), { type: "LOAD_SAVED_STATE", snapshot: { slots: saved.slots, playerNames: saved.playerNames, winCounters: saved.winCounters, gameSettings: saved.gameSettings, turn: saved.turn } });
  assert.deepEqual(loaded.turn, saved.turn);
  const older = reducer(initialSessionState(pokemonMode), { type: "LOAD_SAVED_STATE", snapshot: { slots: saved.slots, playerNames: saved.playerNames, winCounters: saved.winCounters, gameSettings: saved.gameSettings } });
  assert.equal(older.turn, null);
  assert.equal(reducer(saved, { type: "APPLY_GAME_SETTINGS", settings: saved.gameSettings }).turn, null);
  assert.equal(reducer(saved, { type: "RESET_GAME", mode: pokemonMode }).turn ?? null, null);
});


test("reminders: nothing without turns, nothing for the other player's pieces", () => {
  const s = board();
  assert.equal(remindFor(s, { type: "MARK_USED", key: "supporter", value: true }, pokemonMode), null);
  let t = reducer(s, { type: "START_TURNS", first: "p1" });
  t = reducer(t, { type: "END_TURN" }); // Riley's turn 2
  t = reducer(t, { type: "END_TURN" }); // Sam's turn 3
  t = reducer(t, { type: "ADJUST_ENERGY", player: "p1", position: "active", energyKey: "lightning", delta: 1 });
  // A card effect giving Riley's Pokémon Energy on Sam's turn isn't Sam's attachment.
  assert.equal(remindFor(t, { type: "ADJUST_ENERGY", player: "p2", position: "active", energyKey: "water", delta: 1 }, pokemonMode), null);
  assert.match(remindFor(t, { type: "ADJUST_ENERGY", player: "p1", position: "bench_1", energyKey: "lightning", delta: 1 }, pokemonMode)!, /already attached/);
  // Taking Energy off is never a reminder.
  assert.equal(remindFor(t, { type: "ADJUST_ENERGY", player: "p1", position: "active", energyKey: "lightning", delta: -1 }, pokemonMode), null);
});

test("reminders: first turn, second Supporter, retreat while Asleep, evolving too soon", () => {
  let t = reducer(board(), { type: "START_TURNS", first: "p1" });
  assert.match(remindFor(t, { type: "MARK_USED", key: "supporter", value: true }, pokemonMode)!, /went first/);
  assert.equal(remindFor(t, { type: "MARK_USED", key: "stadium", value: true }, pokemonMode), null);
  assert.match(remindFor(t, { type: "UPDATE_PIECE_META", player: "p1", position: "bench_1", name: "Raichu ex", evolved: true }, pokemonMode)!, /first turn/);
  t = reducer(t, { type: "END_TURN" });
  t = reducer(t, { type: "END_TURN" });
  t = reducer(t, { type: "MARK_USED", key: "supporter", value: true });
  assert.match(remindFor(t, { type: "MARK_USED", key: "supporter", value: true }, pokemonMode)!, /already played a Supporter/);
  t = reducer(t, { type: "TOGGLE_EXTRA_CONDITION", player: "p1", position: "active", key: "asleep", value: true });
  assert.match(remindFor(t, { type: "MOVE_PIECE", player: "p1", from: "active", to: "bench_2" }, pokemonMode)!, /Asleep: it can't retreat/);
  // Swapping two Benched Pokémon isn't a retreat.
  assert.equal(remindFor(t, { type: "MOVE_PIECE", player: "p1", from: "bench_1", to: "bench_2" }, pokemonMode), null);
  t = reducer(t, { type: "PLACE_PIECE", player: "p1", position: "bench_2", name: "Pichu", maxHp: 30, koValue: 1 });
  assert.match(remindFor(t, { type: "UPDATE_PIECE_META", player: "p1", position: "bench_2", name: "Pikachu", evolved: true }, pokemonMode)!, /came into play this turn/);
  assert.equal(remindFor(t, { type: "UPDATE_PIECE_META", player: "p1", position: "bench_1", name: "Raichu ex", evolved: true }, pokemonMode), null);
});

test("self damage is read from the attack text", () => {
  assert.equal(selfDamage("This Pokémon also does 30 damage to itself."), 30);
  assert.equal(selfDamage("Discard all Energy from this Pokémon."), null);
  assert.equal(selfDamage(null), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
