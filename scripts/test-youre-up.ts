/**
 * Tests for "you're up": which race counts as called, per format.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-youre-up.ts
 *
 * Pure logic only. The alert itself needs event-alerts-m1.sql applied.
 */

import { calledRace } from "../src/lib/tournaments/youreUp";
import { generateSingleElim, reportWinner } from "../src/lib/tournaments/bracket";
import { generateHeatMains, reportHeatResult } from "../src/lib/tournaments/heatMains";
import { generateGroupBracket, reportLobby, currentLobby } from "../src/lib/tournaments/groups";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}
const none = { bracket: null, heat_mains: null, group_bracket: null };
const field = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// --- Race-scoring formats: nothing is ever "called".
check("no structure means no called race", calledRace(none) === null);

// --- Single elimination.
{
  let b = generateSingleElim(field(8));
  const first = calledRace({ ...none, bracket: b });
  check("bracket: a match is called", !!first && first.drivers.length === 2, first?.label);
  const [a, bb] = first!.drivers;
  b = reportWinner(b, first!.id, a);
  const second = calledRace({ ...none, bracket: b });
  check("bracket: reporting a winner calls the next match", !!second && second.id !== first!.id);
  check("bracket: the next match does not include the eliminated player", !second!.drivers.includes(bb));
}

// --- Byes are never called (a single-entrant slot is not a match).
{
  const b = generateSingleElim(field(5)); // 8-slot bracket, three byes
  const r = calledRace({ ...none, bracket: b });
  check("bracket with byes: the called match has two real entrants", !!r && r.drivers.every((d) => !!d) && r.drivers.length === 2);
}

// --- Heat to Mains.
{
  let hm = generateHeatMains(field(16), { heatSize: 8 });
  const h1 = calledRace({ ...none, heat_mains: hm });
  check("heats: the first heat is called", !!h1 && h1.drivers.length > 0, h1?.label);
  hm = reportHeatResult(hm, h1!.id, h1!.drivers, []);
  const h2 = calledRace({ ...none, heat_mains: hm });
  check("heats: reporting a heat calls the next one", !!h2 && h2.id !== h1!.id, h2?.label);
  // Drive every heat to completion; a main should be called next.
  let guard = 0;
  let cur = h2;
  // Heat ids look like "s0h0"; mains are only built once every heat is in.
  while (cur && !/main/i.test(cur.label) && guard++ < 50) {
    hm = reportHeatResult(hm, cur.id, cur.drivers, []);
    cur = calledRace({ ...none, heat_mains: hm });
  }
  check("heats: once every heat is run, a main is called", !!cur && /main/i.test(cur.label), cur?.label);
}

// --- Group lobbies: exactly one at a time, earliest first.
{
  let gb = generateGroupBracket(field(16), { lobbySize: 4, advance: 2 });
  const l1 = currentLobby(gb);
  check("lobbies: one lobby is called", !!l1 && l1.entrants.length >= 2, l1?.id);
  check("lobbies: the earliest round goes first", !!l1 && l1.round === 0 && l1.bracket === "wb");
  gb = reportLobby(gb, l1!.id, l1!.entrants);
  const l2 = currentLobby(gb);
  check("lobbies: reporting a lobby calls another one", !!l2 && l2.id !== l1!.id, l2?.id);
  const called = calledRace({ ...none, group_bracket: gb });
  check("lobbies: calledRace agrees with currentLobby", called?.id === l2!.id);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
