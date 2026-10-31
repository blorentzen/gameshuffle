// Random Pokémon generator rules (src/lib/pokemon/generator.ts).
//   npx tsx scripts/test-pokemon-generator.ts
import { ALL_POKEMON, DEFAULT_OPTIONS, genPool, linkParams, readLink, rerollSlot, rollPokemon, shortfall, type GenOptions } from "../src/lib/pokemon/generator";

let pass = 0, fail = 0;
const ok = (cond: boolean, what: string) => { if (cond) pass++; else { fail++; console.error("✗", what); } };

ok(ALL_POKEMON.length === 1025, "all 1,025 Pokémon");
ok(ALL_POKEMON[0].name === "Bulbasaur" && ALL_POKEMON[1024].name === "Pecharunt", "Bulbasaur to Pecharunt");
ok(genPool(DEFAULT_OPTIONS).length === 1025, "no filters = everyone");
ok(genPool({ ...DEFAULT_OPTIONS, gen: 1 }).length === 151, "Gen 1 is 151");
ok(genPool({ ...DEFAULT_OPTIONS, type: "Fire" }).every((p) => p.types.includes("Fire")), "type filter");
ok(genPool({ ...DEFAULT_OPTIONS, fullyEvolved: true }).every((p) => p.stage === "Final" || p.stage === "Single"), "fully evolved");
ok(!genPool({ ...DEFAULT_OPTIONS, fullyEvolved: true }).some((p) => p.name === "Charmander"), "Charmander isn't fully evolved");
ok(genPool({ ...DEFAULT_OPTIONS, noLegendary: true }).every((p) => !p.legendary), "no legendaries");
ok(!genPool({ ...DEFAULT_OPTIONS, noLegendary: true }).some((p) => p.name === "Mewtwo" || p.name === "Mew"), "Mewtwo and Mew are out");

const combos: GenOptions[] = [
  DEFAULT_OPTIONS,
  { ...DEFAULT_OPTIONS, noRepeatTypes: true },
  { ...DEFAULT_OPTIONS, gen: 1, fullyEvolved: true, noLegendary: true },
  { ...DEFAULT_OPTIONS, type: "Dragon", noRepeatTypes: false },
  { ...DEFAULT_OPTIONS, gen: 9, noRepeatTypes: true, fullyEvolved: true },
];
for (const o of combos) {
  for (let t = 0; t < 300; t++) {
    const r = rollPokemon(6, o);
    const pool = new Set(genPool(o).map((p) => p.dex));
    ok(new Set(r.map((p) => p.dex)).size === r.length, "different Pokémon");
    ok(r.every((p) => pool.has(p.dex)), "all from the pool");
    if (o.noRepeatTypes) {
      const types = r.flatMap((p) => p.types);
      ok(new Set(types).size === types.length, "no shared types");
    }
    if (!o.noRepeatTypes) ok(r.length === 6, "a full roll without no-repeat types");
    const slot = Math.floor(Math.random() * r.length);
    const next = rerollSlot(r, slot, o);
    ok(!!next && next.dex !== r[slot].dex, "a re-roll changes that slot");
    ok(!r.some((p, i) => i !== slot && p.dex === next!.dex), "a re-roll stays different from the others");
    if (o.noRepeatTypes) ok(!r.some((p, i) => i !== slot && p.types.some((x) => next!.types.includes(x))), "a re-roll keeps types apart");
  }
}
// A type filter with no repeated types can only ever give one.
const one = rollPokemon(6, { ...DEFAULT_OPTIONS, type: "Fire", noRepeatTypes: true });
ok(one.length === 1, "type + no repeats = one");
ok(!!shortfall(6, one.length, { ...DEFAULT_OPTIONS, type: "Fire", noRepeatTypes: true })?.includes("Fire"), "and it says why");
ok(shortfall(6, 6, DEFAULT_OPTIONS) === null, "no note for a full roll");

// Share links rebuild the roll and the options.
const opts: GenOptions = { gen: 3, type: "Water", fullyEvolved: true, noLegendary: true, noRepeatTypes: false };
const roll = rollPokemon(3, opts);
const back = readLink(linkParams(roll, 3, opts));
ok(!!back && back.count === 3 && back.rolled.map((p) => p.dex).join() === roll.map((p) => p.dex).join(), "link rebuilds the roll");
ok(!!back && JSON.stringify(back.options) === JSON.stringify(opts), "link rebuilds the options");
ok(readLink(new URLSearchParams("")) === null, "no link, nothing to rebuild");
ok(readLink(new URLSearchParams("p=9999-25"))!.rolled.map((p) => p.name).join() === "Pikachu", "unknown numbers are dropped");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
