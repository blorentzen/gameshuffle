/**
 * Verifies the Group Knockout engine (src/lib/tournaments/groups.ts).
 * Run: npx tsx scripts/test-groups.ts
 */
import {
  generateGroupBracket,
  reportLobby,
  isComplete,
  groupChampion,
  computeGroupPlacements,
  describeStructure,
  type GroupBracket,
  type GroupRules,
} from "../src/lib/tournaments/groups";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function field(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

/** Auto-play: report every unreported lobby with its entrants in seed order
 *  (so the top seed "wins" each lobby), until the bracket completes. */
function playOut(b: GroupBracket): GroupBracket {
  let guard = 0;
  while (!isComplete(b) && guard++ < 200) {
    const next = b.lobbies.find((l) => !l.results);
    if (!next) break;
    b = reportLobby(b, next.id, next.entrants);
  }
  return b;
}

function uniquePlacements(b: GroupBracket): { ok: boolean; count: number; unique: number } {
  const pl = computeGroupPlacements(b);
  const ids = new Set(pl.map((p) => p.participantId));
  return { ok: pl.length === b.seeds.length && ids.size === b.seeds.length, count: pl.length, unique: ids.size };
}

function run(name: string, seeds: string[], rules: Partial<GroupRules>) {
  console.log(`\n${name} (${seeds.length} players, lobby ${rules.lobbySize}/adv ${rules.advance}/${rules.bracketing})`);
  console.log(`  ${describeStructure(rules, seeds.length)}`);
  let b = generateGroupBracket(seeds, rules);
  b = playOut(b);
  check("completes (has champion)", isComplete(b), `champion=${groupChampion(b)}`);
  check("top seed wins when top seed always wins", groupChampion(b) === "p1", `got ${groupChampion(b)}`);
  const up = uniquePlacements(b);
  check("everyone placed exactly once", up.ok, `count=${up.count} unique=${up.unique} field=${seeds.length}`);
  // No lobby larger than lobbySize; size 1 is a valid bye.
  const badSize = b.lobbies.find((l) => l.entrants.length > (rules.lobbySize ?? 4) || l.entrants.length < 1);
  check("no lobby exceeds lobbySize (size 1 = bye ok)", !badSize, badSize ? `${badSize.id}=${badSize.entrants.length}` : "");
  return b;
}

console.log("=== Group Knockout engine ===");

run("Single-elim, even", field(16), { lobbySize: 4, advance: 2, bracketing: "single" });
run("Single-elim, uneven", field(10), { lobbySize: 4, advance: 2, bracketing: "single" });
run("Single-elim, odd/awkward", field(13), { lobbySize: 4, advance: 2, bracketing: "single" });
run("Double-elim, even (the feedback case)", field(16), { lobbySize: 4, advance: 2, bracketing: "double" });
run("Double-elim, uneven", field(22), { lobbySize: 4, advance: 2, bracketing: "double" });
run("Preset: 1v1 single-elim", field(8), { lobbySize: 2, advance: 1, bracketing: "single" });
run("Preset: 1v1 double-elim", field(8), { lobbySize: 2, advance: 1, bracketing: "double" });
run("Big field", field(64), { lobbySize: 4, advance: 2, bracketing: "single" });

// Recompute-on-edit: re-reporting an early lobby with a DIFFERENT order must
// invalidate downstream results that referenced the old advancers.
console.log("\nRecompute-on-edit");
{
  let b = generateGroupBracket(field(16), { lobbySize: 4, advance: 2, bracketing: "single" });
  b = playOut(b);
  const beforeChamp = groupChampion(b);
  // Edit round-0 lobby 0: reverse its finishing order (different top 2 advance).
  const r0 = b.lobbies.find((l) => l.id === "wb-r0-s0")!;
  b = reportLobby(b, "wb-r0-s0", [...r0.entrants].reverse());
  const laterReported = b.lobbies.filter((l) => l.round > 0 && l.results);
  check("edit invalidates downstream (some later lobby now unreported)", laterReported.length < b.lobbies.filter((l) => l.round > 0).length || !isComplete(b));
  b = playOut(b);
  check("re-plays to completion after edit", isComplete(b), `champ ${beforeChamp} -> ${groupChampion(b)}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
