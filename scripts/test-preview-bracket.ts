/**
 * The preview bracket has to show the tournament's real SHAPE before it runs.
 * The padding rules are the part that goes subtly wrong: an off-by-one in the
 * power-of-two fill adds a phantom round, which misrepresents the format to
 * someone deciding whether to enter.
 *
 *   npx tsx scripts/test-preview-bracket.ts
 */

import { buildPreviewBracket, isOpenSeat } from "../src/lib/tournaments/previewBracket";
import { bracketChampion } from "../src/lib/tournaments/bracket";

let failures = 0;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  ${cond ? "pass" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
}

console.log("\nBuilds only for elimination formats:");
for (const f of ["ffa_points", "round_robin", "heat_mains", null, undefined]) {
  check(`${f} -> none`, buildPreviewBracket({ format: f as string, taken: ids(8), capacity: 8 }) === null);
}
check("single_elim -> built", !!buildPreviewBracket({ format: "single_elim", taken: ids(8), capacity: 8 }));
check("double_elim -> built", !!buildPreviewBracket({ format: "double_elim", taken: ids(8), capacity: 8 }));

console.log("\nOne signup is a person waiting, not a bracket:");
check("0 -> none", buildPreviewBracket({ format: "single_elim", taken: [], capacity: 8 }) === null);
check("1 -> none", buildPreviewBracket({ format: "single_elim", taken: ids(1), capacity: 8 }) === null);
check("2 -> built", !!buildPreviewBracket({ format: "single_elim", taken: ids(2), capacity: 8 }));

console.log("\nPads to CAPACITY, so the shape is final from the first signup:");
for (const [taken, cap, rounds] of [[2, 8, 3], [5, 8, 3], [8, 8, 3], [3, 16, 4], [26, 32, 5]] as const) {
  const b = buildPreviewBracket({ format: "single_elim", taken: ids(taken), capacity: cap })!;
  check(`${taken}/${cap} -> ${rounds} rounds`, b.rounds === rounds, `got ${b.rounds}, size ${b.size}`);
  const open = b.seeds.filter(isOpenSeat).length;
  check(`${taken}/${cap} -> ${cap - taken} open seats`, open === cap - taken, `got ${open}`);
}

console.log("\nNo capacity: next power of two, never a phantom round:");
for (const [taken, size] of [[2, 2], [3, 4], [4, 4], [5, 8], [8, 8], [9, 16]] as const) {
  const b = buildPreviewBracket({ format: "single_elim", taken: ids(taken), capacity: null })!;
  check(`${taken} players -> size ${size}`, b.size === size, `got ${b.size}`);
}

console.log("\nA preview is never already won:");
for (const f of ["single_elim", "double_elim"] as const) {
  const b = buildPreviewBracket({ format: f, taken: ids(4), capacity: 16 })!;
  check(`${f} has no champion`, bracketChampion(b) === null);
  check(`${f} has no reported winner`, b.matches.every((m) => !m.winner));
}

console.log("\nPlaceholders are identifiable, real ids are not:");
check("open seat detected", isOpenSeat("__open-3"));
check("player id is not", !isOpenSeat("p3"));
check("null is not", !isOpenSeat(null));

console.log(failures === 0 ? "\nPreview brackets show the real shape.\n" : `\n${failures} FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
