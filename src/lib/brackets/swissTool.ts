/**
 * Swiss for the free Swiss pairing generator, on the tournament Swiss engine
 * (src/lib/tournaments/swiss.ts, the Play! Pokémon handbook rules) without
 * changing it. Players are their list index as a string; results are set the
 * way an organizer sets them (no player reports). Pairings are random, so the
 * share link carries every table, not a seed.
 *
 * Only the round in play takes results; once the next round is paired the
 * earlier ones are settled (that's what the pairings were made from). Before
 * anyone has a result, the round can be paired again.
 */

import { generateSingleElim, type Bracket } from "@/lib/tournaments/bracket";
import {
  newSwissState,
  pairNextRound,
  swissStandings,
  structureFor,
  cutSeeds,
  type StandingRow,
  type SwissResult,
  type SwissRound,
  type SwissState,
  type TopCut,
} from "@/lib/tournaments/swiss";
import { applyPicks, playerIndex, type Picks } from "./elim";
import { fromCode, toCode } from "./tool";

export type SwissOutcome = "a" | "b" | "t";

export interface SwissToolOptions {
  rounds: "auto" | number;
  topCut: "auto" | TopCut;
}

export interface SwissTool {
  count: number;
  swiss: SwissState;
  /** Top cut winners by match id (player index), when there's a cut. */
  cutPicks: Picks;
}

const ids = (count: number) => Array.from({ length: count }, (_, i) => String(i));

const RESULT: Record<SwissOutcome, SwissResult> = {
  a: { a: 1, b: 0, by: "organizer" },
  b: { a: 0, b: 1, by: "organizer" },
  t: { a: 0, b: 0, by: "organizer" },
};

export function outcomeOf(r: SwissResult | undefined | null): SwissOutcome | null {
  if (!r) return null;
  return r.a > r.b ? "a" : r.b > r.a ? "b" : "t";
}

/** The number of rounds and the cut for this many players (the handbook's table unless chosen). */
export function swissPlan(count: number, o: SwissToolOptions): { rounds: number; topCut: TopCut } {
  return structureFor({ rounds: o.rounds, topCut: o.topCut, bestOf: 1, roundMinutes: null }, count);
}

/** A new event with round 1 paired. */
export function startSwiss(count: number, o: SwissToolOptions, rand: () => number = Math.random): SwissTool {
  const swiss = newSwissState({ rounds: o.rounds, topCut: o.topCut, bestOf: 1, roundMinutes: null }, count);
  return pairRound({ count, swiss, cutPicks: {} }, rand);
}

function pairRound(t: SwissTool, rand: () => number): SwissTool {
  const active = ids(t.count).filter((id) => !(id in t.swiss.drops));
  const tables = pairNextRound(t.swiss, [], active, rand);
  const round: SwissRound = { n: t.swiss.list.length + 1, pairedAt: "", tables, results: {} };
  return { ...t, swiss: { ...t.swiss, list: [...t.swiss.list, round] } };
}

export const currentRound = (t: SwissTool): SwissRound | null => t.swiss.list[t.swiss.list.length - 1] ?? null;

/** Every table in the round has a result (a bye counts as one). */
export function roundComplete(r: SwissRound | null): boolean {
  return !!r && r.tables.every((x) => !x.b || r.results[String(x.t)]);
}

/** Sets or clears one table's result in the round in play. */
export function setResult(t: SwissTool, table: number, outcome: SwissOutcome | null): SwissTool {
  const r = currentRound(t);
  if (!r || t.swiss.cut) return t;
  const tb = r.tables.find((x) => x.t === table);
  if (!tb || !tb.b) return t;
  const results = { ...r.results };
  if (outcome) results[String(table)] = RESULT[outcome];
  else delete results[String(table)];
  const list = [...t.swiss.list.slice(0, -1), { ...r, results }];
  return { ...t, swiss: { ...t.swiss, list } };
}

export type SwissStep = "results" | "pair" | "cut" | "cut-results" | "done";

/** What the main button does now. */
export function swissStep(t: SwissTool): SwissStep {
  if (t.swiss.cut) return cutChampion(t) != null ? "done" : "cut-results";
  if (!roundComplete(currentRound(t))) return "results";
  if (t.swiss.list.length < t.swiss.rounds) return "pair";
  return t.swiss.topCut ? "cut" : "done";
}

/** Pairs the next round (only once the round in play is finished). */
export function pairNext(t: SwissTool, rand: () => number = Math.random): SwissTool {
  return swissStep(t) === "pair" ? pairRound(t, rand) : t;
}

/** Pairs the round in play again, while it still has no results. */
export function repairRound(t: SwissTool, rand: () => number = Math.random): SwissTool {
  const r = currentRound(t);
  if (!r || t.swiss.cut || Object.keys(r.results).length) return t;
  return pairRound({ ...t, swiss: { ...t.swiss, list: t.swiss.list.slice(0, -1) } }, rand);
}

/** A player leaves: they aren't paired again (only between rounds, so a table never loses a player). */
export function dropPlayer(t: SwissTool, player: number, drop = true): SwissTool {
  if (swissStep(t) !== "pair") return t;
  const drops = { ...t.swiss.drops };
  if (drop) drops[String(player)] = t.swiss.list.length;
  else delete drops[String(player)];
  return { ...t, swiss: { ...t.swiss, drops } };
}

export function swissTable(t: SwissTool): StandingRow[] {
  return swissStandings(t.swiss, [], ids(t.count));
}

/** Starts the top cut from the standings. */
export function startCut(t: SwissTool): SwissTool {
  if (swissStep(t) !== "cut") return t;
  const seeds = cutSeeds(swissTable(t), t.swiss.topCut);
  return { ...t, swiss: { ...t.swiss, cut: { seeds, results: {} } }, cutPicks: {} };
}

export function cutView(t: SwissTool): { bracket: Bracket; picks: Picks } | null {
  if (!t.swiss.cut) return null;
  return applyPicks(generateSingleElim(t.swiss.cut.seeds), t.cutPicks);
}

export function pickCut(t: SwissTool, matchId: string, winner: number | null): SwissTool {
  const next = { ...t.cutPicks };
  if (winner == null) delete next[matchId];
  else next[matchId] = winner;
  const view = applyPicks(generateSingleElim(t.swiss.cut?.seeds ?? []), next);
  return { ...t, cutPicks: view.picks };
}

export function cutChampion(t: SwissTool): number | null {
  const v = cutView(t);
  if (!v) return null;
  const final = v.bracket.matches.find((m) => m.round === v.bracket.rounds - 1);
  return playerIndex(final?.winner ?? null);
}

/** The winner: the top cut's champion, or first in the standings when there's no cut. */
export function swissWinner(t: SwissTool): number | null {
  if (swissStep(t) !== "done") return null;
  if (t.swiss.cut) return cutChampion(t);
  return playerIndex(swissTable(t)[0]?.id ?? null);
}

// ── Link code ────────────────────────────────────────────────────────────────
// { s: [rounds, topCut], l: one string per round (3 characters a table: player
// a, player b or "." for a bye, result a/b/t or "."), d: drops (player + round),
// c: top cut seeds, p: top cut picks by match order }.

export interface SwissCode { s: [number, number]; l: string[]; d?: string; c?: string; p?: string }

const OUT = ["a", "b", "t"] as const;

export function encodeSwiss(t: SwissTool): SwissCode {
  const l = t.swiss.list.map((r) => r.tables.map((x) => `${toCode(Number(x.a))}${x.b ? toCode(Number(x.b)) : "."}${outcomeOf(r.results[String(x.t)]) ?? "."}`).join(""));
  const d = Object.entries(t.swiss.drops).map(([p, r]) => `${toCode(Number(p))}${toCode(r)}`).join("");
  const code: SwissCode = { s: [t.swiss.rounds, t.swiss.topCut], l };
  if (d) code.d = d;
  if (t.swiss.cut) {
    code.c = t.swiss.cut.seeds.map((s) => toCode(Number(s))).join("");
    const order = generateSingleElim(t.swiss.cut.seeds).matches.map((m) => m.id);
    code.p = order.map((id) => toCode(t.cutPicks[id])).join("").replace(/\.+$/, "");
  }
  return code;
}

export function decodeSwiss(count: number, raw: unknown): SwissTool | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<SwissCode>;
  if (!Array.isArray(c.s) || !Array.isArray(c.l)) return null;
  const rounds = Math.round(Number(c.s[0]));
  const topCut = Number(c.s[1]);
  if (!(rounds >= 1 && rounds <= 12) || ![0, 4, 8].includes(topCut) || topCut >= count) return null;
  const swiss = newSwissState({ rounds, topCut: topCut as TopCut, bestOf: 1, roundMinutes: null }, count);
  const list: SwissRound[] = [];
  for (const [i, code] of c.l.slice(0, rounds).entries()) {
    if (typeof code !== "string" || code.length % 3) return null;
    const round: SwissRound = { n: i + 1, pairedAt: "", tables: [], results: {} };
    const seen = new Set<number>();
    for (let k = 0; k < code.length; k += 3) {
      const a = fromCode(code[k]), b = fromCode(code[k + 1]), res = code[k + 2];
      if (a == null || a >= count || seen.has(a) || (b != null && (b >= count || seen.has(b) || b === a))) return null;
      seen.add(a); if (b != null) seen.add(b);
      const t = round.tables.length + 1;
      round.tables.push({ t, a: String(a), b: b == null ? null : String(b) });
      if (b != null && (OUT as readonly string[]).includes(res)) round.results[String(t)] = RESULT[res as SwissOutcome];
    }
    if (!round.tables.length) return null;
    list.push(round);
  }
  if (!list.length) return null;
  // Earlier rounds must be finished: later pairings were made from them.
  if (list.slice(0, -1).some((r) => !roundComplete(r))) return null;
  const drops: Record<string, number> = {};
  if (typeof c.d === "string") for (let k = 0; k + 1 < c.d.length; k += 2) {
    const p = fromCode(c.d[k]), r = fromCode(c.d[k + 1]);
    if (p != null && p < count && r != null) drops[String(p)] = r;
  }
  let tool: SwissTool = { count, swiss: { ...swiss, list, drops }, cutPicks: {} };
  if (typeof c.c === "string" && c.c.length === topCut && list.length === rounds && roundComplete(list[list.length - 1])) {
    const seeds = [...c.c].map(fromCode);
    if (seeds.every((s) => s != null && s < count) && new Set(seeds).size === seeds.length) {
      const cutSeedsList = seeds.map(String);
      tool = { ...tool, swiss: { ...tool.swiss, cut: { seeds: cutSeedsList, results: {} } } };
      const order = generateSingleElim(cutSeedsList).matches.map((m) => m.id);
      const picks: Picks = {};
      if (typeof c.p === "string") for (let k = 0; k < Math.min(c.p.length, order.length); k++) {
        const w = fromCode(c.p[k]);
        if (w != null && w < count) picks[order[k]] = w;
      }
      tool = { ...tool, cutPicks: applyPicks(generateSingleElim(cutSeedsList), picks).picks };
    }
  }
  return tool;
}
