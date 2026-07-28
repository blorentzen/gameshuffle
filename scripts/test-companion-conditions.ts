/**
 * Locks the load-bearing condition rule in the Companion reducer
 * (src/lib/companion/state.ts): the status group (Asleep / Paralyzed /
 * Confused) is MUTUALLY EXCLUSIVE — turning one on clears the others in its
 * `exclusiveGroup` — while Poison and Burn (conditionA / conditionB) are
 * INDEPENDENT and coexist.
 *
 * No test runner is configured; this follows the repo convention of
 * `scripts/test-*.ts` run via `npx tsx`:
 *
 *   npx tsx scripts/test-companion-conditions.ts
 *
 * Exit code 0 = pass, 1 = fail.
 */

import { makeReducer, initialSessionState, findSlot } from "../src/lib/companion/state";
import { pokemonMode } from "../src/lib/companion/modes/pokemon";
import type { SessionState } from "../src/lib/companion/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
}

const reduce = makeReducer(pokemonMode);

// Grab the three status-group condition keys straight from the mode so the
// test tracks the real config rather than hardcoding keys.
const statusKeys = pokemonMode.extraConditions
  .filter((c) => c.exclusiveGroup === "status")
  .map((c) => c.key);

function occupiedState(): SessionState {
  let s = initialSessionState(pokemonMode);
  s = reduce(s, {
    type: "PLACE_PIECE",
    player: "p1",
    position: "active",
    name: "Test",
    maxHp: 100,
    koValue: 2,
  });
  return s;
}

function extra(state: SessionState, key: string): boolean {
  return findSlot(state, "p1", "active")?.extraConditions[key] === true;
}

console.log("Companion condition rules:");

// 1. Status group is mutually exclusive.
{
  let s = occupiedState();
  const [a, b, c] = statusKeys;
  s = reduce(s, { type: "TOGGLE_EXTRA_CONDITION", player: "p1", position: "active", key: a, value: true });
  assert(extra(s, a), `${a} turns on`);

  s = reduce(s, { type: "TOGGLE_EXTRA_CONDITION", player: "p1", position: "active", key: b, value: true });
  assert(extra(s, b) && !extra(s, a), `${b} on replaces ${a} (mutual exclusion)`);

  s = reduce(s, { type: "TOGGLE_EXTRA_CONDITION", player: "p1", position: "active", key: c, value: true });
  assert(extra(s, c) && !extra(s, a) && !extra(s, b), `${c} on clears ${a} and ${b}`);

  // Turning OFF only affects the targeted condition.
  s = reduce(s, { type: "TOGGLE_EXTRA_CONDITION", player: "p1", position: "active", key: c, value: false });
  assert(!extra(s, a) && !extra(s, b) && !extra(s, c), `turning ${c} off leaves all status off`);
}

// 2. Poison + Burn (conditionA / conditionB) are independent and coexist.
{
  let s = occupiedState();
  s = reduce(s, { type: "TOGGLE_CONDITION", player: "p1", position: "active", which: "a", value: true });
  s = reduce(s, { type: "TOGGLE_CONDITION", player: "p1", position: "active", which: "b", value: true });
  const slot = findSlot(s, "p1", "active");
  assert(slot?.conditionA === true && slot?.conditionB === true, "conditionA and conditionB coexist");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll condition-rule assertions passed.");
