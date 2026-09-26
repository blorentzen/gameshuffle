/**
 * Heat splitting. Run: npx tsx scripts/test-heat-split.ts
 *
 * Acceptance criterion 4 of the seeding spec: 8 players into 2 heats must give
 * 1,4,5,8 and 2,3,6,7. The old round-robin split gave 1,3,5,7 / 2,4,6,8, which
 * stacks heat 1 with the top seed in every pair.
 */
import { generateHeatMains } from "../src/lib/tournaments/heatMains";

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};

/** Seeds as 1-based numbers, so the output reads like the spec. */
const heatsOf = (n: number, opts: Parameters<typeof generateHeatMains>[1] = {}) => {
  const field = Array.from({ length: n }, (_, i) => String(i + 1));
  const hm = generateHeatMains(field, { series: 1, ...opts });
  return hm.heats.map((r) => r.drivers.map(Number));
};

check("8 into 2 heats snakes", heatsOf(8, { heatSize: 4 }), [[1, 4, 5, 8], [2, 3, 6, 7]]);
check("9 into 3 heats snakes", heatsOf(9, { heatSize: 3 }), [[1, 6, 7], [2, 5, 8], [3, 4, 9]]);
check("6 into 2 heats snakes", heatsOf(6, { heatSize: 3 }), [[1, 4, 5], [2, 3, 6]]);

// Fairness property: with a snake, the sum of seeds per heat should be nearly
// equal. That is the whole point, and it is what round-robin fails.
for (const [n, size] of [[8, 4], [12, 4], [16, 4], [9, 3], [15, 5]] as const) {
  const heats = heatsOf(n, { heatSize: size });
  const sums = heats.map((h) => h.reduce((a, b) => a + b, 0));
  const spread = Math.max(...sums) - Math.min(...sums);
  const ok = spread <= heats.length;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${n} players / ${heats.length} heats: seed sums ${JSON.stringify(sums)}, spread ${spread}`);
}

// Nobody is lost or duplicated, at any awkward size.
for (const n of [5, 6, 7, 9, 13, 23]) {
  const flat = heatsOf(n).flat().sort((a, b) => a - b);
  const ok = JSON.stringify(flat) === JSON.stringify(Array.from({ length: n }, (_, i) => i + 1));
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} field of ${n}: every player placed exactly once`);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
