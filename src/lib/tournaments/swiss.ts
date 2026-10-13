/**
 * Swiss (pure, client-safe). Everyone plays every round against someone on
 * the same record, nobody plays the same person twice, and the best records go
 * on to a single-elimination top cut. Follows the Play! Pokémon Tournament
 * Rules Handbook (revision September 1, 2026), which most 1v1 locals use too:
 *
 * - Round 1 is random. After that players are paired at random inside their
 *   match-point bracket, pairing down from the highest bracket; an odd player
 *   out gets a bye, at random from the lowest bracket, never twice.
 * - Win 3 match points, tie 1, loss 0. A bye is a win but not a tiebreaker.
 * - Ties in the standings: opponents' win %, then opponents' opponents' win %,
 *   then head-to-head when exactly two are still tied, then a fixed order.
 *   A win % is wins / rounds played (byes not counted as wins), at least 25%,
 *   at most 75% for someone who dropped.
 * - Rounds and top cut come from the player count (TCG Single Day, Variant #3)
 *   unless the organizer sets them; they're fixed once round 1 is paired.
 *
 * State lives on `tournaments.swiss` (version-guarded writes). Players' own
 * reports live in `tournament_swiss_reports`; a match counts as reported once
 * both players agree, or the organizer sets it. Results are worked out here on
 * every read, so nothing goes stale.
 */

import { computeBracketPlacements, generateSingleElim, reportWinner, roundLabel, type Bracket } from "./bracket";

export const SWISS_MIN_PLAYERS = 4;
export const SWISS_MAX_ROUNDS = 12;
export type BestOf = 1 | 3;
export type TopCut = 0 | 4 | 8;

export interface SwissSettings {
  rounds: "auto" | number;
  topCut: "auto" | TopCut;
  bestOf: BestOf;
  /** Minutes per round; null = no clock. */
  roundMinutes: number | null;
}

export const ROUND_MINUTE_CHOICES = [25, 50] as const;

/** Defaults for a new Swiss event: best of 3, and the 50-minute clock for card games. */
export function defaultSwissSettings(cardGame: boolean): SwissSettings {
  return { rounds: "auto", topCut: "auto", bestOf: 3, roundMinutes: cardGame ? 50 : null };
}

/** Reads `settings.swiss` defensively (older rows, hand edits). */
export function swissSettingsOf(settings: unknown, cardGame = false): SwissSettings {
  const raw = ((settings as { swiss?: Partial<SwissSettings> } | null)?.swiss ?? {}) as Partial<SwissSettings>;
  const d = defaultSwissSettings(cardGame);
  const rounds = typeof raw.rounds === "number" && raw.rounds >= 1 && raw.rounds <= SWISS_MAX_ROUNDS ? Math.round(raw.rounds) : "auto";
  const topCut = raw.topCut === 0 || raw.topCut === 4 || raw.topCut === 8 ? raw.topCut : "auto";
  const bestOf = raw.bestOf === 1 || raw.bestOf === 3 ? raw.bestOf : d.bestOf;
  const roundMinutes = raw.roundMinutes === null ? null : typeof raw.roundMinutes === "number" && raw.roundMinutes > 0 && raw.roundMinutes <= 180 ? Math.round(raw.roundMinutes) : d.roundMinutes;
  return { rounds, topCut, bestOf, roundMinutes };
}

/** Play! Pokémon TCG Single Day structure (handbook Sept 1, 2026, Variant #3). */
export const STRUCTURE: { max: number; rounds: number; cut: TopCut }[] = [
  { max: 8, rounds: 3, cut: 0 },
  { max: 12, rounds: 4, cut: 4 },
  { max: 20, rounds: 5, cut: 4 },
  { max: 32, rounds: 5, cut: 8 },
  { max: 64, rounds: 6, cut: 8 },
  { max: 128, rounds: 7, cut: 8 },
  { max: 226, rounds: 8, cut: 8 },
  { max: 409, rounds: 9, cut: 8 },
  { max: Infinity, rounds: 10, cut: 8 },
];

export function suggestStructure(players: number): { rounds: number; topCut: TopCut } {
  const row = STRUCTURE.find((r) => players <= r.max) ?? STRUCTURE[STRUCTURE.length - 1];
  return { rounds: row.rounds, topCut: row.cut };
}

/** The structure for this many players, with the organizer's choices applied. A cut is never the whole field. */
export function structureFor(s: SwissSettings, players: number): { rounds: number; topCut: TopCut } {
  const auto = suggestStructure(Math.max(players, SWISS_MIN_PLAYERS));
  const rounds = s.rounds === "auto" ? auto.rounds : s.rounds;
  let topCut: TopCut = s.topCut === "auto" ? auto.topCut : s.topCut;
  if (topCut >= players) topCut = topCut === 8 && players > 4 ? 4 : 0;
  return { rounds, topCut };
}

/** "5 rounds of Swiss, then a Top 4 bracket. Best of 3, 50 minutes a round. About 6½ hours with the top cut." */
export function describeStructure(s: SwissSettings, players: number): string {
  const { rounds, topCut } = structureFor(s, players);
  const swiss = `${rounds} round${rounds === 1 ? "" : "s"} of Swiss`;
  const cut = topCut ? `, then a Top ${topCut} bracket` : ", no top cut";
  const clock = s.roundMinutes ? `, ${s.roundMinutes} minutes a round` : ", no round clock";
  const roundMins = (s.roundMinutes ?? (s.bestOf === 3 ? 50 : 25)) + 5;
  const total = (rounds + (topCut ? Math.log2(topCut) : 0)) * roundMins;
  const halfHours = Math.max(2, Math.round(total / 30));
  const hours = halfHours % 2 ? `${Math.floor(halfHours / 2)}½` : `${halfHours / 2}`;
  return `${swiss}${cut}. Best of ${s.bestOf}${clock}. About ${hours} hour${halfHours === 2 ? "" : "s"}${topCut ? " with the top cut" : ""}.`;
}

// ─── State ───────────────────────────────────────────────────────────────────

/** Games won by side a and side b. Equal = a tie. */
export interface SwissResult { a: number; b: number; by: "players" | "organizer" | "bye" | "drop" }
export interface SwissTable { t: number; a: string; b: string | null }
export interface SwissRound {
  n: number;
  pairedAt: string;
  tables: SwissTable[];
  /** Organizer-set results, and every result once the next round is paired (keyed by table number). */
  results: Record<string, SwissResult>;
}
export interface SwissTimer { minutes: number | null; startedAt: string | null; pausedAt: string | null; extraSeconds: number }
export interface SwissState {
  v: 1;
  version: number;
  rounds: number;
  topCut: TopCut;
  bestOf: BestOf;
  startedWith: number;
  list: SwissRound[];
  /** Dropped players → the last round they played. */
  drops: Record<string, number>;
  /** Players added after round 1 → the first round they were paired in (earlier rounds are losses). */
  lateFrom: Record<string, number>;
  cut: { seeds: string[]; results: Record<string, SwissResult> } | null;
  timer: SwissTimer | null;
  finishedAt: string | null;
}

export interface SwissReport { matchKey: string; participantId: string; mine: number; theirs: number }

export const roundKey = (n: number) => `r${n}`;
export const cutKey = (matchId: string) => `c:${matchId}`;
export const gamesToWin = (bestOf: BestOf) => (bestOf === 1 ? 1 : 2);

export function isSwissState(x: unknown): x is SwissState {
  return !!x && typeof x === "object" && (x as SwissState).v === 1 && Array.isArray((x as SwissState).list);
}

/** A result is a possible score for the match length: nobody past the games needed, not both there; a cut match can't tie. */
export function validScore(bestOf: BestOf, a: number, b: number, cut = false): boolean {
  const need = gamesToWin(bestOf);
  if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= need)) return false;
  if (a === need && b === need) return false;
  if (cut && a === b) return false;
  return true;
}

/** What players can tap. Best of 3: 2-0, 2-1, 1-2, 0-2, tie. */
export function scoreChoices(bestOf: BestOf, cut = false): { mine: number; theirs: number; label: string }[] {
  const out = bestOf === 1
    ? [{ mine: 1, theirs: 0, label: "I won" }, { mine: 0, theirs: 1, label: "I lost" }]
    : [{ mine: 2, theirs: 0, label: "I won 2-0" }, { mine: 2, theirs: 1, label: "I won 2-1" }, { mine: 1, theirs: 2, label: "I lost 1-2" }, { mine: 0, theirs: 2, label: "I lost 0-2" }];
  return cut ? out : [...out, { mine: bestOf === 1 ? 0 : 1, theirs: bestOf === 1 ? 0 : 1, label: "Tie" }];
}

export function newSwissState(s: SwissSettings, players: number): SwissState {
  const { rounds, topCut } = structureFor(s, players);
  return {
    v: 1, version: 0, rounds, topCut, bestOf: s.bestOf, startedWith: players,
    list: [], drops: {}, lateFrom: {}, cut: null,
    timer: s.roundMinutes ? { minutes: s.roundMinutes, startedAt: null, pausedAt: null, extraSeconds: 0 } : null,
    finishedAt: null,
  };
}

// ─── Results ─────────────────────────────────────────────────────────────────

export type TableState = "done" | "waiting" | "disagree" | "bye";
export interface TableStatus {
  result: SwissResult | null;
  state: TableState;
  /** What each side said (games for them, games for the other). */
  reportA: [number, number] | null;
  reportB: [number, number] | null;
}

function reportsFor(reports: SwissReport[], key: string) {
  const m = new Map<string, [number, number]>();
  for (const r of reports) if (r.matchKey === key) m.set(r.participantId, [r.mine, r.theirs]);
  return m;
}

/** Both players said the same score. */
function agreed(rep: Map<string, [number, number]>, a: string, b: string): SwissResult | null {
  const ra = rep.get(a), rb = rep.get(b);
  if (!ra || !rb) return null;
  return ra[0] === rb[1] && ra[1] === rb[0] ? { a: ra[0], b: ra[1], by: "players" } : null;
}

export function tableStatus(state: SwissState, round: SwissRound, table: SwissTable, reports: SwissReport[]): TableStatus {
  if (!table.b) return { result: { a: gamesToWin(state.bestOf), b: 0, by: "bye" }, state: "bye", reportA: null, reportB: null };
  const rep = reportsFor(reports, roundKey(round.n));
  const reportA = rep.get(table.a) ?? null;
  const reportB = rep.get(table.b) ?? null;
  const set = round.results[String(table.t)] ?? null;
  if (set) return { result: set, state: "done", reportA, reportB };
  const both = agreed(rep, table.a, table.b);
  if (both) return { result: both, state: "done", reportA, reportB };
  return { result: null, state: reportA && reportB ? "disagree" : "waiting", reportA, reportB };
}

export function roundDone(state: SwissState, round: SwissRound, reports: SwissReport[]): boolean {
  return round.tables.every((t) => tableStatus(state, round, t, reports).result);
}

/** Freezes every result of a finished round into it (done before the next round is paired). */
export function lockRound(state: SwissState, round: SwissRound, reports: SwissReport[]): SwissRound {
  const results: Record<string, SwissResult> = { ...round.results };
  for (const t of round.tables) {
    const st = tableStatus(state, round, t, reports);
    if (st.result) results[String(t.t)] = st.result;
  }
  return { ...round, results };
}

// ─── Standings ───────────────────────────────────────────────────────────────

export interface StandingRow {
  id: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  /** Win % used by opponents' tiebreakers (0.25..1, or ..0.75 after a drop). */
  winPct: number;
  owp: number;
  oowp: number;
  dropped: boolean;
  byes: number;
  opponents: string[];
}

/** A small, stable hash, so players tied on everything keep one order. */
function hashOrder(seed: string, id: string): number {
  let h = 2166136261;
  for (const ch of `${seed}:${id}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const r4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Standings after every round with a result (an unfinished round counts only
 * its finished tables). `field` lists everyone in the event (paired or about
 * to be), so a player who hasn't played yet still shows.
 */
export function swissStandings(state: SwissState, reports: SwissReport[], field: string[], seed = ""): StandingRow[] {
  const ids = new Set(field);
  for (const r of state.list) for (const t of r.tables) { ids.add(t.a); if (t.b) ids.add(t.b); }
  type Acc = { wins: number; losses: number; ties: number; byes: number; played: number; opps: string[]; vs: Map<string, "W" | "L" | "T"> };
  const acc = new Map<string, Acc>();
  for (const id of ids) acc.set(id, { wins: 0, losses: 0, ties: 0, byes: 0, played: 0, opps: [], vs: new Map() });

  for (const round of state.list) {
    const seen = new Set<string>();
    for (const t of round.tables) {
      const st = tableStatus(state, round, t, reports);
      seen.add(t.a); if (t.b) seen.add(t.b);
      if (!st.result) continue;
      const A = acc.get(t.a)!;
      if (!t.b) { A.wins++; A.byes++; A.played++; continue; }
      const B = acc.get(t.b)!;
      A.played++; B.played++;
      A.opps.push(t.b); B.opps.push(t.a);
      const { a, b } = st.result;
      if (a > b) { A.wins++; B.losses++; A.vs.set(t.b, "W"); B.vs.set(t.a, "L"); }
      else if (b > a) { B.wins++; A.losses++; A.vs.set(t.b, "L"); B.vs.set(t.a, "W"); }
      else { A.ties++; B.ties++; A.vs.set(t.b, "T"); B.vs.set(t.a, "T"); }
    }
    // A late joiner's rounds before they arrived are losses.
    for (const [id, from] of Object.entries(state.lateFrom)) {
      if (round.n < from && !seen.has(id) && acc.has(id)) { const X = acc.get(id)!; X.losses++; X.played++; }
    }
  }

  const winPct = new Map<string, number>();
  for (const [id, a] of acc) {
    const dropped = id in state.drops;
    const pct = a.played ? (a.wins - a.byes) / a.played : 0;
    winPct.set(id, a.played ? Math.min(dropped ? 0.75 : 1, Math.max(0.25, pct)) : 0);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const owp = new Map<string, number>();
  for (const [id, a] of acc) owp.set(id, avg(a.opps.map((o) => winPct.get(o) ?? 0)));
  const rows: StandingRow[] = [...acc].map(([id, a]) => ({
    id, rank: 0, wins: a.wins, losses: a.losses, ties: a.ties, points: a.wins * 3 + a.ties,
    winPct: r4(winPct.get(id) ?? 0), owp: r4(owp.get(id) ?? 0), oowp: r4(avg(a.opps.map((o) => owp.get(o) ?? 0))),
    dropped: id in state.drops, byes: a.byes, opponents: a.opps,
  }));

  const key = (r: StandingRow) => `${r.points}|${r.owp}|${r.oowp}`;
  const groups = new Map<string, StandingRow[]>();
  for (const r of rows) (groups.get(key(r)) ?? groups.set(key(r), []).get(key(r))!).push(r);
  rows.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.owp !== x.owp) return y.owp - x.owp;
    if (y.oowp !== x.oowp) return y.oowp - x.oowp;
    // Head-to-head decides only when exactly two are tied and they played.
    if (groups.get(key(x))!.length === 2) {
      const res = acc.get(x.id)!.vs.get(y.id);
      if (res === "W") return -1;
      if (res === "L") return 1;
    }
    return hashOrder(seed, x.id) - hashOrder(seed, y.id);
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export const recordText = (r: Pick<StandingRow, "wins" | "losses" | "ties">) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`;
export const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;

// ─── Pairing ─────────────────────────────────────────────────────────────────

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Pairs a list in order (best record first), trying the nearest opponent first and never a rematch. */
function pairList(list: string[], played: Set<string>, budget: { left: number }): [string, string][] | null {
  if (!list.length) return [];
  if (--budget.left < 0) return null;
  const [p, ...rest] = list;
  for (let i = 0; i < rest.length; i++) {
    const q = rest[i];
    if (played.has(pairKey(p, q))) continue;
    const sub = pairList([...rest.slice(0, i), ...rest.slice(i + 1)], played, budget);
    if (sub) return [[p, q], ...sub];
  }
  return null;
}

/**
 * The next round's tables. `active` = everyone who plays this round (not
 * dropped), in any order. Returns tables best record first, the bye last.
 */
export function pairNextRound(state: SwissState, reports: SwissReport[], active: string[], rand: () => number = Math.random, seed = ""): SwissTable[] {
  const players = active.filter((id) => !(id in state.drops));
  const played = new Set<string>();
  const hadBye = new Set<string>();
  for (const r of state.list) for (const t of r.tables) { if (t.b) played.add(pairKey(t.a, t.b)); else hadBye.add(t.a); }

  let ordered: string[];
  if (!state.list.length) {
    ordered = shuffle(players, rand);
  } else {
    // Brackets by match points, best first; random inside each.
    const points = new Map(swissStandings(state, reports, players, seed).map((r) => [r.id, r.points]));
    const byPoints = new Map<number, string[]>();
    for (const id of players) { const p = points.get(id) ?? 0; (byPoints.get(p) ?? byPoints.set(p, []).get(p)!).push(id); }
    ordered = [...byPoints.keys()].sort((a, b) => b - a).flatMap((p) => shuffle(byPoints.get(p)!, rand));
  }

  // The bye: odd field → someone in the lowest bracket who hasn't had one, at random.
  const byeOptions: (string | null)[] = [];
  if (ordered.length % 2) {
    const lowFirst = [...ordered].reverse();
    const points = new Map(state.list.length ? swissStandings(state, reports, players, seed).map((r) => [r.id, r.points]) : []);
    const fresh = lowFirst.filter((id) => !hadBye.has(id));
    const pool = fresh.length ? fresh : lowFirst;
    const lowest = Math.min(...pool.map((id) => points.get(id) ?? 0));
    byeOptions.push(...shuffle(pool.filter((id) => (points.get(id) ?? 0) === lowest), rand), ...pool.filter((id) => (points.get(id) ?? 0) !== lowest));
  } else byeOptions.push(null);

  const attempt = (allowRematch: boolean) => {
    for (const bye of byeOptions) {
      const list = bye ? ordered.filter((id) => id !== bye) : ordered;
      const pairs = allowRematch
        ? list.reduce<[string, string][]>((acc, id, i) => (i % 2 ? acc : [...acc, [id, list[i + 1]]]), [])
        : pairList(list, played, { left: 200_000 });
      if (pairs) return { pairs, bye };
    }
    return null;
  };
  const found = attempt(false) ?? attempt(true)!;
  const tables: SwissTable[] = found.pairs.map(([a, b], i) => ({ t: i + 1, a, b }));
  if (found.bye) tables.push({ t: tables.length + 1, a: found.bye, b: null });
  return tables;
}

// ─── Top cut ─────────────────────────────────────────────────────────────────

/** The top cut's seeds: the best records still in the event. */
export function cutSeeds(standings: StandingRow[], topCut: number): string[] {
  return standings.filter((r) => !r.dropped).slice(0, topCut).map((r) => r.id);
}

/** The top cut bracket with every agreed or organizer result applied, round by round. */
export function cutBracket(state: SwissState, reports: SwissReport[]): Bracket | null {
  if (!state.cut) return null;
  let bracket = generateSingleElim(state.cut.seeds);
  for (let round = 0; round < bracket.rounds; round++) {
    for (const m of bracket.matches.filter((x) => x.round === round)) {
      if (!m.a || !m.b || m.winner) continue;
      const res = cutMatchResult(state, reports, m.id, m.a, m.b);
      if (res) bracket = reportWinner(bracket, m.id, res.a > res.b ? m.a : m.b);
    }
  }
  return bracket;
}

export function cutMatchResult(state: SwissState, reports: SwissReport[], matchId: string, a: string, b: string): SwissResult | null {
  const set = state.cut?.results[matchId];
  if (set) return set;
  return agreed(reportsFor(reports, cutKey(matchId)), a, b);
}

export function cutMatchStatus(state: SwissState, reports: SwissReport[], matchId: string, a: string, b: string): TableStatus {
  const rep = reportsFor(reports, cutKey(matchId));
  const reportA = rep.get(a) ?? null, reportB = rep.get(b) ?? null;
  const result = cutMatchResult(state, reports, matchId, a, b);
  return { result, state: result ? "done" : reportA && reportB ? "disagree" : "waiting", reportA, reportB };
}

export function cutRoundLabel(bracket: Bracket, round: number): string {
  return roundLabel(round, bracket.rounds);
}

// ─── Where the event is ──────────────────────────────────────────────────────

export type SwissPhase = "setup" | "swiss" | "cut" | "done";
export function swissPhase(state: SwissState | null): SwissPhase {
  if (!state || !state.list.length) return "setup";
  if (state.finishedAt) return "done";
  return state.cut ? "cut" : "swiss";
}

export type NextStep = "pair" | "cut" | "finish" | "wait" | null;
/** What the organizer's main button does now. */
export function nextStep(state: SwissState, reports: SwissReport[]): NextStep {
  if (state.finishedAt) return null;
  if (state.cut) {
    const b = cutBracket(state, reports)!;
    const final = b.matches.find((m) => m.round === b.rounds - 1);
    return final?.winner ? "finish" : "wait";
  }
  const last = state.list[state.list.length - 1];
  if (!last) return "pair";
  if (!roundDone(state, last, reports)) return "wait";
  if (state.list.length < state.rounds) return "pair";
  return state.topCut ? "cut" : "finish";
}

/** Final placements: the top cut by how far each got, then everyone else by Swiss standings. */
export function finalPlacements(state: SwissState, reports: SwissReport[], standings: StandingRow[]): { participantId: string; placement: number }[] {
  const out: { participantId: string; placement: number }[] = [];
  const placed = new Set<string>();
  const bracket = cutBracket(state, reports);
  if (bracket) {
    for (const p of computeBracketPlacements(bracket)) { out.push(p); placed.add(p.participantId); }
    // Anyone in the cut without a placement yet (an unfinished cut) goes by seed.
    for (const id of state.cut!.seeds) if (!placed.has(id)) { out.push({ participantId: id, placement: out.length + 1 }); placed.add(id); }
  }
  let next = placed.size + 1;
  for (const r of standings) if (!placed.has(r.id)) { out.push({ participantId: r.id, placement: next++ }); placed.add(r.id); }
  return out.sort((a, b) => a.placement - b.placement);
}

/** Who a player meets now: a Swiss table without a result, or a ready top cut match. */
export interface CurrentMatch { key: string; label: string; table: number | null; opponent: string | null; side: "a" | "b"; cut: boolean }
export function currentMatchFor(state: SwissState, reports: SwissReport[], id: string): CurrentMatch | null {
  if (state.finishedAt) return null;
  if (state.cut) {
    const b = cutBracket(state, reports)!;
    const m = b.matches.find((x) => x.a && x.b && !x.winner && (x.a === id || x.b === id));
    if (!m) return null;
    return { key: cutKey(m.id), label: `Top ${state.cut.seeds.length} · ${cutRoundLabel(b, m.round)}`, table: null, opponent: m.a === id ? m.b : m.a, side: m.a === id ? "a" : "b", cut: true };
  }
  const round = state.list[state.list.length - 1];
  if (!round) return null;
  const t = round.tables.find((x) => x.a === id || x.b === id);
  if (!t) return null;
  // A finished table stays the player's match until the next round is paired, so the card can show the result.
  return { key: roundKey(round.n), label: `Round ${round.n} of ${state.rounds}`, table: t.b ? t.t : null, opponent: t.a === id ? t.b : t.a, side: t.a === id ? "a" : "b", cut: false };
}

// ─── The round clock ─────────────────────────────────────────────────────────

/** Seconds left on the clock (negative once time is up); null when there's no clock or it hasn't started. */
export function secondsLeft(timer: SwissTimer | null, now = Date.now()): number | null {
  if (!timer?.minutes || !timer.startedAt) return null;
  const end = Date.parse(timer.startedAt) + (timer.minutes * 60 + timer.extraSeconds) * 1000;
  const at = timer.pausedAt ? Date.parse(timer.pausedAt) : now;
  return Math.round((end - at) / 1000);
}

export function clockText(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds <= 0) return "Time";
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
