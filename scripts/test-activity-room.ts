/**
 * Checks the Discord Activity's play-together rules (src/lib/activity/roomRules.ts)
 * and that every quick-fire game plays outside a stream.
 *
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/test-activity-room.ts
 */
import { GAMES } from "../src/lib/break/games";
import { publicPuzzles, puzzleOrder } from "../src/lib/break/games/facts";
import { BREAK_GAMES } from "../src/lib/break/types";
import {
  QUICKFIRE_FOCUS, QUICKFIRE_FOCUS_IDS, QUICKFIRE_SETS, QUICKFIRE_SET_IDS, ROUND_COUNTS, RUSH_ROUNDS,
  addPoints, everyoneAnswered, lineupFor, ranked,
} from "../src/lib/activity/roomRules";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else { failed++; console.log(`FAIL ${name}`, detail ?? ""); }
}

// Seeded random so failures repeat.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// ── Lineups ──────────────────────────────────────────────────────────────────
for (const set of QUICKFIRE_SET_IDS) {
  const counts: readonly number[] = set === "rush" ? RUSH_ROUNDS : ROUND_COUNTS;
  for (const n of counts) {
    for (let seed = 1; seed <= 50; seed++) {
      const l = lineupFor(set, n, seeded(seed));
      check(`${set} ${n}: length`, l.length === n, l.length);
      check(`${set} ${n}: only the set's games`, l.every((g) => QUICKFIRE_SETS[set].games.includes(g)), l);
      if (QUICKFIRE_SETS[set].games.length > 1) {
        check(`${set} ${n}: no game twice in a row`, l.every((g, i) => i === 0 || g !== l[i - 1]), l);
        if (n >= QUICKFIRE_SETS[set].games.length) check(`${set} ${n}: every game appears`, QUICKFIRE_SETS[set].games.every((g) => l.includes(g)), l);
      }
    }
  }
}

// ── Scores ───────────────────────────────────────────────────────────────────
const r = ranked([{ name: "Sam", score: 5 }, { name: "Ana", score: 7 }, { name: "Bo", score: 5 }, { name: "Cy", score: 0 }]);
check("ranked order", r.map((p) => p.name).join() === "Ana,Bo,Sam,Cy", r);
check("ties share a place", r.map((p) => p.place).join() === "1,2,2,4", r.map((p) => p.place));
check("addPoints adds", JSON.stringify(addPoints({ a: 2 }, [{ id: "a", points: 3 }, { id: "b", points: 1 }, { id: "c", points: 0 }])) === JSON.stringify({ a: 5, b: 1 }));
check("addPoints doesn't change the input", (() => { const s = { a: 1 }; addPoints(s, [{ id: "a", points: 2 }]); return s.a === 1; })());
check("everyone answered", everyoneAnswered(["a", "b"], new Set(["a", "b", "c"])));
check("not everyone answered", !everyoneAnswered(["a", "b"], new Set(["a"])));
check("nobody here never closes early", !everyoneAnswered([], new Set(["a"])));

// ── Every quick-fire game plays in a room ─────────────────────────────────────
const all = new Set(QUICKFIRE_SET_IDS.flatMap((s) => QUICKFIRE_SETS[s].games));
for (const id of all) {
  const game = GAMES[id];
  check(`${id}: exists`, !!game && !!BREAK_GAMES[id]);
  check(`${id}: not hosted on another engine`, !game.hosted);
  check(`${id}: one round each (no multi-round state)`, !game.rounds && BREAK_GAMES[id].name.length > 0);
  if (game.load) continue; // trivia reads the approved pack from the database
  for (const focus of QUICKFIRE_FOCUS_IDS) {
    const f = QUICKFIRE_FOCUS[focus];
    const ids = publicPuzzles().map((p) => p.id);
    const puzzles = f.puzzles ? ids.filter((p) => f.puzzles!.includes(p)) : puzzleOrder(null);
    let made = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const draft = game.make({ skip: () => false, puzzles: puzzles.length ? puzzles : ids, streamer: "your group", gameOnStream: f.game, rand: seeded(seed), meta: {}, fresh: true, roundOfGame: 1 });
      if (!draft) continue;
      made++;
      // A judge with no answers never crashes and pays nobody.
      const j = game.judge({ round: draft.round, secret: draft.secret }, [], {});
      check(`${id}/${focus}: empty judge pays nobody`, j.awards.length === 0, j.awards);
      check(`${id}/${focus}: reveal has text`, typeof j.reveal.text === "string", j.reveal);
    }
    check(`${id}/${focus}: makes rounds`, made > 30, made);
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
