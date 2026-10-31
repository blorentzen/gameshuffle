/**
 * Pokémon rules the companion knows (src/lib/companion/pokemonRules.ts).
 *   npx tsx scripts/test-companion-rules.ts
 */

import assert from "node:assert/strict";
import {
  FRESH_TURN, attackDamage, energyCheck, parseCardRules, parseDamage, prizeValue,
  reminderAttack, reminderEnergy, reminderEvolve, reminderRetreat, reminderSupporter, type TurnState,
} from "@/lib/companion/pokemonRules";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`ok  ${name}`); } catch (err) { failed++; console.error(`FAIL ${name}`); console.error(err); }
}

// Shaped like a cached Scrydex row.
const pikachu = parseCardRules({
  types: ["Lightning"], subtypes: ["Basic", "ex"], hp: "190",
  attacks: [
    { name: "Thunderbolt", cost: ["Lightning", "Lightning", "Lightning"], damage: "140", text: "Discard all Energy from this Pokémon." },
    { name: "Thunder Crash", cost: ["Lightning", "Lightning", "Colorless", "Colorless"], damage: "220", text: null },
    { name: "Spark Up", cost: ["Lightning"], damage: "30+", text: "Flip a coin. If heads, this attack does 30 more damage." },
  ],
  weaknesses: [{ type: "Fighting", value: "×2" }], resistances: [], retreat_cost: ["Colorless"],
});
const gyarados = parseCardRules({ types: ["Water"], subtypes: ["Stage 1", "ex"], hp: "330", attacks: [], weaknesses: [{ type: "Lightning", value: "×2" }], resistances: [{ type: "Lightning", value: "-30" }], retreat_cost: ["Colorless", "Colorless", "Colorless"] });

test("card data parses, including untyped JSON and junk", () => {
  assert.equal(pikachu.hp, 190);
  assert.equal(pikachu.retreat, 1);
  assert.equal(pikachu.attacks[0].damage?.base, 140);
  assert.deepEqual(parseDamage("30+"), { base: 30, mod: "+", raw: "30+" });
  assert.deepEqual(parseDamage("20x"), { base: 20, mod: "×", raw: "20x" });
  assert.equal(parseDamage(""), null);
  const junk = parseCardRules({ attacks: "nope", weaknesses: [null, { type: 5 }], hp: "?", retreat_cost: null });
  assert.deepEqual(junk, { types: [], subtypes: [], hp: null, attacks: [], weaknesses: [], resistances: [], retreat: 0 });
});

test("prize values by card type, today's and older eras", () => {
  assert.equal(prizeValue(["Basic"]), 1);
  assert.equal(prizeValue(["Basic", "ex"]), 2);
  assert.equal(prizeValue(["Stage 1", "Tera", "ex"]), 2);
  assert.equal(prizeValue(["Basic", "MEGA", "ex"]), 3);
  assert.equal(prizeValue(["Basic", "MEGA", "EX"]), 2); // XY Mega-EX
  assert.equal(prizeValue(["VMAX"]), 3);
  assert.equal(prizeValue(["Basic", "TAG TEAM", "GX"]), 3);
  assert.equal(prizeValue(["VSTAR"]), 2);
});

test("Energy: typed must match, Colorless takes what's left", () => {
  assert.deepEqual(energyCheck(["Lightning", "Lightning", "Lightning"], { lightning: 3 }), { met: true, missing: 0 });
  assert.deepEqual(energyCheck(["Lightning", "Lightning", "Colorless", "Colorless"], { lightning: 3 }), { met: false, missing: 1 });
  assert.deepEqual(energyCheck(["Lightning", "Colorless"], { water: 2 }), { met: false, missing: 1 });
  assert.deepEqual(energyCheck(["Colorless", "Colorless"], { special: 1, fire: 1 }), { met: true, missing: 0 });
  assert.deepEqual(energyCheck([], {}), { met: true, missing: 0 });
});

test("damage: Weakness ×2 then Resistance −30, only against the Active", () => {
  const d = attackDamage({ attack: pikachu.attacks[0], attackerTypes: pikachu.types, defender: gyarados, defenderIsActive: true });
  assert.deepEqual(d.steps.map((s) => s.label), ["×2 Weakness", "-30 Resistance"]);
  assert.equal(d.total, 250);
  const bench = attackDamage({ attack: pikachu.attacks[0], attackerTypes: pikachu.types, defender: gyarados, defenderIsActive: false });
  assert.equal(bench.total, 140);
  assert.equal(bench.steps.length, 0);
});

test("damage: card effects before Weakness, never below 0, Pocket's +20, and 'varies'", () => {
  const d = attackDamage({ attack: pikachu.attacks[0], attackerTypes: pikachu.types, defender: { weaknesses: [{ type: "Lightning", value: "×2" }], resistances: [] }, defenderIsActive: true, extra: 30 });
  assert.equal(d.total, 340);
  const low = attackDamage({ attack: { name: "Tap", cost: [], damage: parseDamage("10"), text: null }, attackerTypes: ["Lightning"], defender: { weaknesses: [], resistances: [{ type: "Lightning", value: "-30" }] }, defenderIsActive: true });
  assert.equal(low.total, 0);
  const pocket = attackDamage({ attack: { name: "Psydrive", cost: [], damage: parseDamage("150"), text: null }, attackerTypes: ["Psychic"], defender: { weaknesses: [{ type: "Psychic", value: "+20" }], resistances: [] }, defenderIsActive: true });
  assert.equal(pocket.total, 170);
  assert.equal(attackDamage({ attack: pikachu.attacks[2], attackerTypes: pikachu.types, defender: null, defenderIsActive: true }).varies, true);
});

const turn = (n: number, used: Partial<TurnState["used"]> = {}): TurnState => ({ number: n, player: "p1", first: "p1", used: { ...FRESH_TURN, ...used } });
const piece = { name: "Pikachu ex", enteredTurn: 1, conditions: [] as string[], energy: { lightning: 3 } as Record<string, number>, rules: pikachu };

test("reminders: first-turn limits, once a turn, conditions, Energy, evolution timing", () => {
  assert.match(reminderSupporter(turn(1), "Sam")!, /went first/);
  assert.equal(reminderSupporter(turn(3), "Sam"), null);
  assert.match(reminderSupporter(turn(3, { supporter: true }), "Sam")!, /already played a Supporter/);
  assert.match(reminderEnergy(turn(3, { energy: true }), "Sam")!, /already attached/);
  assert.match(reminderAttack(turn(1), "Sam", piece, pikachu.attacks[0])!, /no attacking/);
  assert.equal(reminderAttack(turn(3), "Sam", piece, pikachu.attacks[0]), null);
  assert.match(reminderAttack(turn(3), "Sam", piece, pikachu.attacks[1])!, /1 more Energy/);
  assert.match(reminderAttack(turn(3), "Sam", { ...piece, conditions: ["Asleep"] }, pikachu.attacks[0])!, /Asleep: it can't attack/);
  assert.match(reminderRetreat(turn(3), "Sam", { ...piece, conditions: ["Paralyzed"] })!, /can't retreat/);
  assert.match(reminderRetreat(turn(3), "Sam", { ...piece, energy: {} })!, /costs 1 Energy and it has 0/);
  assert.equal(reminderRetreat(turn(3), "Sam", piece), null);
  assert.match(reminderEvolve(turn(2), piece)!, /first turn/);
  assert.match(reminderEvolve(turn(4), { ...piece, enteredTurn: 4 })!, /came into play this turn/);
  assert.equal(reminderEvolve(turn(4), piece), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
