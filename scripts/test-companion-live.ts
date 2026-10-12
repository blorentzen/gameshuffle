/**
 * Play together (2026-10-11): a companion game shared between two phones.
 * Codes, joining, moves from both seats, host-only moves, server rolls,
 * Undo (own last move only, never a flip), and the move lines the other
 * phone reads. Pure: the plans in livePlan.ts, no database.
 *   npx tsx scripts/test-companion-live.ts
 */

import assert from "node:assert/strict";
import { findSlot, initialSessionState, makeReducer } from "@/lib/companion/state";
import { pokemonMode } from "@/lib/companion/modes/pokemon";
import type { SessionState } from "@/lib/companion/types";
import { CODE_ALPHABET, CODE_LENGTH, PAST_CAP, describeMove, isAway, makeCode, normalizeCode, spacedCode, AWAY_MS } from "@/lib/companion/liveRules";
import { planJoin, planMove, planRoll, planUndo, viewFor, type GameRow, type Patch, type Plan } from "@/lib/companion/livePlan";

const reducer = makeReducer(pokemonMode);
const NOW = "2026-10-11T20:00:00.000Z";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`ok  ${name}`); } catch (err) { failed++; console.error(`FAIL ${name}`); console.error(err); }
}

function board(): SessionState {
  let s = initialSessionState(pokemonMode);
  s = reducer(s, { type: "APPLY_GAME_SETTINGS", settings: { ...s.gameSettings, gameStarted: true } });
  s = reducer(s, { type: "SET_PLAYER_NAME", player: "p1", name: "Sam" });
  s = reducer(s, { type: "PLACE_PIECE", player: "p1", position: "active", name: "Pikachu ex", maxHp: 190, koValue: 2 });
  s = reducer(s, { type: "PLACE_PIECE", player: "p2", position: "active", name: "Charizard ex", maxHp: 330, koValue: 2 });
  s = reducer(s, { type: "TOGGLE_CONDITION", player: "p2", position: "active", which: "b", value: true });
  return s;
}

function hostedGame(): GameRow {
  return {
    code: "KQ7M3P",
    seats: { p1: { name: "Sam", userId: "user-sam", tokenHash: null, seenAt: NOW } },
    state: board(),
    version: 1,
    past: [],
    last_move: null,
    pending_rolls: [],
    ended_at: null,
  };
}

/** Apply a plan's patch, as the database update would. */
function apply(row: GameRow, plan: Plan): GameRow {
  assert.ok(plan.ok, `plan failed: ${!plan.ok ? `${plan.error} ${plan.message ?? ""}` : ""}`);
  const patch = plan.value as Patch | null;
  return patch ? { ...row, ...patch } : row;
}

function joined(): GameRow {
  return apply(hostedGame(), planJoin(hostedGame(), pokemonMode, { name: "Riley", userId: null, tokenHash: "hash-riley" }, NOW));
}

const heads = () => "a" as const;
const tails = () => "b" as const;

// --- Codes -----------------------------------------------------------------

test("codes are six characters from the readable alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const code = makeCode((n) => Math.floor(Math.random() * n));
    assert.equal(code.length, CODE_LENGTH);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
  }
  assert.ok(!/[IO01]/.test(CODE_ALPHABET));
});

test("codes typed loosely still match; anything else is refused", () => {
  assert.equal(normalizeCode("kq7 m3p"), "KQ7M3P");
  assert.equal(normalizeCode("KQ7-M3P"), "KQ7M3P");
  assert.equal(normalizeCode("KQ7M3"), null);
  assert.equal(normalizeCode("KQ7M3P9"), null);
  assert.equal(normalizeCode("KQ0M3P"), null); // zero isn't in the alphabet
  assert.equal(normalizeCode(null), null);
  assert.equal(spacedCode("KQ7M3P"), "KQ7 M3P");
});

// --- Joining ---------------------------------------------------------------

test("the opponent takes p2, the board gets their name, the host hears it", () => {
  const row = joined();
  assert.equal(row.seats.p2?.name, "Riley");
  assert.equal(row.state.playerNames.p2, "Riley");
  assert.equal(row.version, 2);
  assert.equal(row.last_move?.text, "Riley joined");
  assert.equal(row.last_move?.big, true);
});

test("a third person can't join", () => {
  const plan = planJoin(joined(), pokemonMode, { name: "Alex", userId: null, tokenHash: "x" }, NOW);
  assert.equal(plan.ok, false);
  assert.equal(!plan.ok && plan.error, "full");
});

test("each phone sees itself and whether the other is here", () => {
  const row = joined();
  const now = Date.parse(NOW);
  const host = viewFor(row, "p1", now);
  const guest = viewFor(row, "p2", now);
  assert.equal(host.host, true);
  assert.equal(guest.host, false);
  assert.equal(guest.you, "p2");
  assert.equal(host.seats.p2.joined, true);
  assert.equal(host.seats.p2.account, false);
  assert.equal(host.seats.p1.account, true);
  assert.equal(isAway(NOW, now + AWAY_MS + 1), true);
  assert.equal(isAway(NOW, now + 1000), false);
});

// --- Moves -----------------------------------------------------------------

test("either player's move lands on the shared board, with a line for the other phone", () => {
  let row = joined();
  row = apply(row, planMove(row, "p2", { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 30 }, pokemonMode, heads, NOW));
  assert.equal(findSlot(row.state, "p1", "active")?.damage, 30);
  assert.equal(row.last_move?.text, "Riley put 30 damage on Pikachu ex");
  assert.equal(row.last_move?.by, "p2");
  assert.equal(row.last_move?.big, false);
  row = apply(row, planMove(row, "p1", { type: "ADJUST_ENERGY", player: "p1", position: "active", energyKey: "lightning", delta: 1 }, pokemonMode, heads, NOW));
  assert.equal(findSlot(row.state, "p1", "active")?.energies.lightning, 1);
  assert.equal(row.last_move?.text, "Sam attached Lightning Energy to Pikachu ex");
  assert.equal(row.version, 4);
});

test("a move that changes nothing saves nothing", () => {
  const row = joined();
  // Charizard ex is already Burned.
  const plan = planMove(row, "p1", { type: "TOGGLE_CONDITION", player: "p2", position: "active", which: "b", value: true }, pokemonMode, heads, NOW);
  assert.ok(plan.ok);
  assert.equal(plan.ok && plan.value, null);
});

test("only the host starts a new game or changes the settings", () => {
  const row = joined();
  const reset = planMove(row, "p2", { type: "RESET_GAME", mode: pokemonMode }, pokemonMode, heads, NOW);
  assert.equal(!reset.ok && reset.error, "host_only");
  const settings = planMove(row, "p2", { type: "APPLY_GAME_SETTINGS", settings: row.state.gameSettings }, pokemonMode, heads, NOW);
  assert.equal(!settings.ok && settings.error, "host_only");
  const hostReset = apply(row, planMove(row, "p1", { type: "RESET_GAME", mode: pokemonMode }, pokemonMode, heads, NOW));
  assert.equal(hostReset.state.gameSettings.gameStarted, false);
  assert.deepEqual(hostReset.past, [], "a new game can't be undone");
  assert.equal(hostReset.last_move?.text, "Sam started a new game");
});

test("phones can't log coin flips or dice themselves", () => {
  const row = joined();
  const flip = planMove(row, "p1", { type: "LOG_COIN_FLIP", side: "a" }, pokemonMode, heads, NOW);
  assert.equal(!flip.ok && flip.error, "bad_move");
  const die = planMove(row, "p1", { type: "LOG_DICE_ROLL", faces: 6, result: 6 }, pokemonMode, heads, NOW);
  assert.equal(!die.ok && die.error, "bad_move");
  const junk = planMove(row, "p1", { nope: true } as never, pokemonMode, heads, NOW);
  assert.equal(!junk.ok && junk.error, "bad_move");
});

test("renaming on either phone keeps the seats in step", () => {
  let row = joined();
  row = apply(row, planMove(row, "p2", { type: "SET_PLAYER_NAME", player: "p2", name: "Riles" }, pokemonMode, heads, NOW));
  assert.equal(row.seats.p2?.name, "Riles");
  assert.equal(row.last_move?.text, "Riley is now Riles");
});

test("turns and attacks read well on the other phone", () => {
  let row = joined();
  row = apply(row, planMove(row, "p1", { type: "START_TURNS", first: "p1" }, pokemonMode, heads, NOW));
  assert.equal(row.last_move?.text, "Sam goes first");
  row = apply(row, planMove(row, "p1", { type: "ATTACK", target: { player: "p2", position: "active" }, damage: 220, name: "Thunder" }, pokemonMode, heads, NOW));
  assert.equal(row.last_move?.text, "Pikachu ex used Thunder: 220 to Charizard ex");
  assert.equal(row.last_move?.big, true);
  row = apply(row, planMove(row, "p1", { type: "END_TURN" }, pokemonMode, heads, NOW));
  assert.equal(row.last_move?.text, "Sam ended their turn. Riley's turn");
  assert.equal(row.state.turn?.player, "p2");
});

// --- Server rolls ------------------------------------------------------------

test("a logged flip goes on the board for both phones and can't be undone", () => {
  let row = joined();
  row = apply(row, planRoll(row, "p2", { kind: "coin", faces: 2, use: "log", value: "b" }, pokemonMode, NOW));
  assert.equal(row.state.coinHistory[0]?.side, "b");
  assert.equal(row.last_move?.text, "Riley flipped a coin: Tails");
  const undo = planUndo(row, "p2", NOW);
  assert.equal(!undo.ok && undo.message, "A coin flip or die roll can't be taken back in a shared game.");
});

test("a die roll is logged with its faces", () => {
  let row = joined();
  row = apply(row, planRoll(row, "p1", { kind: "die", faces: 6, use: "log", value: 4 }, pokemonMode, NOW));
  assert.equal(row.state.diceHistory[0]?.result, 4);
  assert.equal(row.last_move?.text, "Sam rolled a d6: 4");
});

test("a resolve flip is kept, and the phone's resolve move gets the server's side", () => {
  let row = joined();
  const before = row.version;
  row = apply(row, planRoll(row, "p1", { kind: "coin", faces: 2, use: "resolve", value: "a", rollId: "roll-1" }, pokemonMode, NOW));
  assert.equal(row.version, before, "keeping a flip isn't a board change");
  assert.equal(row.pending_rolls.length, 1);
  // The phone claims tails; the server's kept flip (heads) wins and cures Burn.
  row = apply(row, planMove(row, "p1", { type: "RESOLVE_BURN_COIN", player: "p2", position: "active", side: "b", rollId: "roll-1" }, pokemonMode, tails, NOW));
  assert.equal(findSlot(row.state, "p2", "active")?.conditionB, false);
  assert.equal(row.state.coinHistory[0]?.side, "a");
  assert.equal(row.pending_rolls.length, 0);
  assert.equal(row.last_move?.text, "Sam flipped for Burn on Charizard ex: Heads");
});

test("someone else's kept flip can't be used, and no flip means the server flips", () => {
  let row = joined();
  row = apply(row, planRoll(row, "p1", { kind: "coin", faces: 2, use: "resolve", value: "a", rollId: "roll-sam" }, pokemonMode, NOW));
  // Riley names Sam's heads; the server flips itself (tails here), Burn stays.
  row = apply(row, planMove(row, "p2", { type: "RESOLVE_BURN_COIN", player: "p2", position: "active", side: "a", rollId: "roll-sam" }, pokemonMode, tails, NOW));
  assert.equal(findSlot(row.state, "p2", "active")?.conditionB, true);
  assert.equal(row.state.coinHistory[0]?.side, "b");
});

test("resolving a coin can't be undone into a re-flip", () => {
  let row = joined();
  row = apply(row, planMove(row, "p1", { type: "RESOLVE_BURN_COIN", player: "p2", position: "active", side: "a" }, pokemonMode, tails, NOW));
  const undo = planUndo(row, "p1", NOW);
  assert.equal(undo.ok, false);
});

// --- Undo --------------------------------------------------------------------

test("Undo takes back your own last move", () => {
  let row = joined();
  row = apply(row, planMove(row, "p2", { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 30 }, pokemonMode, heads, NOW));
  row = apply(row, planUndo(row, "p2", NOW));
  assert.equal(findSlot(row.state, "p1", "active")?.damage, 0);
  assert.equal(row.last_move?.text, "Riley took back their last move");
  assert.equal(row.past.length, 0);
});

test("Undo won't reach past the other player's move", () => {
  let row = joined();
  row = apply(row, planMove(row, "p2", { type: "ADJUST_DAMAGE", player: "p1", position: "active", delta: 30 }, pokemonMode, heads, NOW));
  row = apply(row, planMove(row, "p1", { type: "ADJUST_DAMAGE", player: "p2", position: "active", delta: 10 }, pokemonMode, heads, NOW));
  const undo = planUndo(row, "p2", NOW);
  assert.equal(!undo.ok && undo.message, "Sam has moved since. Change it back by hand.");
  const nothing = planUndo(joined(), "p1", NOW);
  assert.equal(!nothing.ok && nothing.message, "Nothing of yours to take back.");
});

test("Undo won't reach past a flip either", () => {
  let row = joined();
  row = apply(row, planMove(row, "p1", { type: "ADJUST_DAMAGE", player: "p2", position: "active", delta: 10 }, pokemonMode, heads, NOW));
  row = apply(row, planRoll(row, "p2", { kind: "coin", faces: 2, use: "log", value: "a" }, pokemonMode, NOW));
  const undo = planUndo(row, "p1", NOW);
  assert.equal(undo.ok, false);
});

test("Undo history stays short", () => {
  let row = joined();
  for (let i = 0; i < PAST_CAP + 4; i++) {
    row = apply(row, planMove(row, "p1", { type: "ADJUST_DAMAGE", player: "p2", position: "active", delta: 10 }, pokemonMode, heads, NOW));
  }
  assert.equal(row.past.length, PAST_CAP);
});

// --- Lines -------------------------------------------------------------------

test("cosmetic changes say nothing; conditions and Knock Outs do", () => {
  const s = joined().state;
  assert.equal(describeMove(s, { type: "MARK_USED", key: "supporter", value: true }, pokemonMode, "p1"), null);
  assert.equal(describeMove(s, { type: "TOGGLE_CONDITION", player: "p1", position: "active", which: "a", value: true }, pokemonMode, "p2")?.text, "Riley gave Pikachu ex Poison");
  const ko = describeMove(s, { type: "KNOCKOUT", player: "p2", position: "active" }, pokemonMode, "p1");
  assert.equal(ko?.text, "Sam Knocked Out Charizard ex");
  assert.equal(ko?.big, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
