/**
 * Flights — the multi-flight points engine for large FFA/points fields. When a
 * field is bigger than one lobby can hold (e.g. >12 on MK8DX), the event runs in
 * ROUNDS; each round splits the field into FLIGHTS of `flightSize`, every flight
 * races `racesPerRound` races, and points (from a scoring table) accumulate per
 * player across every round. Between rounds the field is re-seeded into new
 * flights from the running standings — group the leaders together, or snake them
 * across flights so strength is spread.
 *
 * Pure + game-agnostic, and fully recompute-from-results (like the groups
 * engine): `results` (flight id -> the races reported in it) is the source of
 * truth, and the round/flight tree is derived, so editing an early race
 * re-seeds every later round. Deterministic — no randomness in `build` (round-0
 * randomness lives in the seed order the organizer generates).
 */

import { DEFAULT_SCORING_TABLE } from "@/lib/tournaments/scoring";

/** How the next round's flights are formed from the standings. */
export type ReseedStrategy = "standings" | "snake";

export interface FlightRules {
  /** Max players per flight (e.g. 12 on MK8DX, 24 on MKW). */
  flightSize: number;
  /** Number of rounds the event runs. */
  rounds: number;
  /** Races each flight runs per round (1 = score by round). */
  racesPerRound: number;
  /** How later rounds are re-seeded from the standings. */
  reseed: ReseedStrategy;
  /** Points for finishing 1st, 2nd, … (index 0 = 1st). */
  scoreTable: number[];
}

/** A single race's finishing positions: playerId -> 1-based place. */
export type RacePlacements = Record<string, number>;

export interface Flight {
  id: string; // positional, e.g. "r0-f2"
  round: number;
  slot: number;
  players: string[];
  races: RacePlacements[]; // reported races (0 .. racesPerRound)
}

export interface FlightsState {
  kind: "flights";
  rules: FlightRules;
  seeds: string[]; // index 0 = top seed
  /** Source of truth: flight id -> its reported races. */
  results: Record<string, RacePlacements[]>;
  /**
   * Manual point overrides — a player's final points as they showed in the game,
   * replacing the derived total. Applied to the final standings/placements only,
   * never to the between-round re-seed (which stays on the played races).
   */
  overrides?: Record<string, number>;
  /** How a tie in final points resolves: share the placement, or the organizer
   *  runs a runoff (an extra race among the tied players). */
  tieBreak?: "shared" | "runoff";
  /** Derived view rebuilt from `results` on every change. */
  rounds: Flight[][];
}

export interface FlightStanding {
  participantId: string;
  points: number;
  racesPlayed: number;
  wins: number;
  avgPosition: number | null;
  /** True when `points` came from a manual override rather than the played races. */
  overridden?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function normalizeFlightRules(r: Partial<FlightRules>): FlightRules {
  const flightSize = clampInt(r.flightSize ?? 12, 2, 24);
  const rounds = clampInt(r.rounds ?? 3, 1, 10);
  const racesPerRound = clampInt(r.racesPerRound ?? 4, 1, 32);
  const reseed: ReseedStrategy = r.reseed === "snake" ? "snake" : "standings";
  const scoreTable = r.scoreTable && r.scoreTable.length ? r.scoreTable : DEFAULT_SCORING_TABLE;
  return { flightSize, rounds, racesPerRound, reseed, scoreTable };
}

function flightCount(n: number, flightSize: number): number {
  return Math.max(1, Math.ceil(n / flightSize));
}

/** Split a rank-ordered pool into flights. "standings" keeps the leaders
 *  together (ranks 1..k in flight 0); "snake" spreads strength across flights. */
function splitFlights(ranked: string[], flightSize: number, strategy: ReseedStrategy): string[][] {
  const num = flightCount(ranked.length, flightSize);
  if (num <= 1) return [ranked.slice()];
  if (strategy === "standings") {
    const per = Math.ceil(ranked.length / num);
    const out: string[][] = [];
    for (let i = 0; i < ranked.length; i += per) out.push(ranked.slice(i, i + per));
    return out;
  }
  // snake
  const out: string[][] = Array.from({ length: num }, () => []);
  ranked.forEach((id, i) => {
    const row = Math.floor(i / num);
    const col = i % num;
    const idx = row % 2 === 0 ? col : num - 1 - col;
    out[idx].push(id);
  });
  return out;
}

/** Points a single race awards a player at 1-based position `pos`. */
function pointsFor(pos: number, scoreTable: number[]): number {
  return pos >= 1 && pos <= scoreTable.length ? scoreTable[pos - 1] : 0;
}

/** Competition ranking (1, 2, 2, 4) from an already-sorted standings list —
 *  players with equal points share a placement, and the next distinct points
 *  value skips accordingly. */
export function placementsWithTies(sorted: { participantId: string; points: number }[]): { participantId: string; placement: number }[] {
  let lastPoints: number | null = null;
  let lastPlacement = 0;
  return sorted.map((s, i) => {
    const placement = lastPoints !== null && s.points === lastPoints ? lastPlacement : i + 1;
    lastPoints = s.points;
    lastPlacement = placement;
    return { participantId: s.participantId, placement };
  });
}

/** Cumulative standings across the reported races of rounds 0..throughRound
 *  (inclusive). `overrides` (final only) replaces a player's total with their
 *  manually-entered game points. */
function standingsFrom(rounds: Flight[][], throughRound: number, rules: FlightRules, overrides?: Record<string, number>): FlightStanding[] {
  const pts = new Map<string, number>();
  const played = new Map<string, number>();
  const wins = new Map<string, number>();
  const posSum = new Map<string, number>();

  for (let r = 0; r <= throughRound && r < rounds.length; r++) {
    for (const f of rounds[r]) {
      for (const race of f.races) {
        for (const [id, pos] of Object.entries(race)) {
          pts.set(id, (pts.get(id) ?? 0) + pointsFor(pos, rules.scoreTable));
          played.set(id, (played.get(id) ?? 0) + 1);
          posSum.set(id, (posSum.get(id) ?? 0) + pos);
          if (pos === 1) wins.set(id, (wins.get(id) ?? 0) + 1);
        }
      }
    }
  }

  // Everyone seeded, so unplayed players still rank (0 points).
  const ids = new Set<string>([...pts.keys()]);
  for (const f of rounds.flatMap((x) => x)) for (const id of f.players) ids.add(id);

  const list: FlightStanding[] = [...ids].map((id) => {
    const p = played.get(id) ?? 0;
    const override = overrides?.[id];
    const overridden = override != null;
    return {
      participantId: id,
      points: overridden ? override : pts.get(id) ?? 0,
      racesPlayed: p,
      wins: wins.get(id) ?? 0,
      avgPosition: p > 0 ? (posSum.get(id) ?? 0) / p : null,
      overridden,
    };
  });
  // Points desc, then better average position, then fewer races (efficiency).
  list.sort((a, b) => b.points - a.points || (a.avgPosition ?? 99) - (b.avgPosition ?? 99));
  return list;
}

/** Has every flight in this round reported all of its races? */
function roundComplete(flights: Flight[], rules: FlightRules): boolean {
  return flights.length > 0 && flights.every((f) => f.races.length >= rules.racesPerRound);
}

// ---------------------------------------------------------------------------
// Build (recompute from results)
// ---------------------------------------------------------------------------

function build(rules: FlightRules, seeds: string[], results: Record<string, RacePlacements[]>): Flight[][] {
  const rounds: Flight[][] = [];
  for (let r = 0; r < rules.rounds; r++) {
    // Round 0 seeds from the given seed order; later rounds from standings.
    const ranked = r === 0 ? seeds.slice() : standingsFrom(rounds, r - 1, rules).map((s) => s.participantId);
    const chunks = splitFlights(ranked, rules.flightSize, rules.reseed);
    const flights: Flight[] = chunks.map((players, slot) => {
      const id = `r${r}-f${slot}`;
      return { id, round: r, slot, players, races: results[id] ?? [] };
    });
    rounds.push(flights);
    // Stop materializing the next round until this one is fully reported.
    if (!roundComplete(flights, rules)) break;
  }
  return rounds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateFlights(seeds: string[], rules: Partial<FlightRules>): FlightsState {
  const norm = normalizeFlightRules(rules);
  const seedList = seeds.slice();
  const results: Record<string, RacePlacements[]> = {};
  return { kind: "flights", rules: norm, seeds: seedList, results, rounds: build(norm, seedList, results) };
}

/** Append a race's finishing order to a flight, or replace an existing one. */
export function reportFlightRace(state: FlightsState, flightId: string, placements: RacePlacements, raceIdx?: number): FlightsState {
  const flight = state.rounds.flatMap((r) => r).find((f) => f.id === flightId);
  if (!flight) return state;
  const existing = state.results[flightId] ?? [];
  const races = existing.slice();
  if (raceIdx != null && raceIdx >= 0 && raceIdx < races.length) races[raceIdx] = placements;
  else races.push(placements);
  const results = { ...state.results, [flightId]: races };
  return { ...state, results, rounds: build(state.rules, state.seeds, results) };
}

/** Remove one race from a flight (later rounds recompute). */
export function clearFlightRace(state: FlightsState, flightId: string, raceIdx: number): FlightsState {
  const existing = state.results[flightId];
  if (!existing || raceIdx < 0 || raceIdx >= existing.length) return state;
  const races = existing.slice();
  races.splice(raceIdx, 1);
  const results = { ...state.results };
  if (races.length) results[flightId] = races;
  else delete results[flightId];
  return { ...state, results, rounds: build(state.rules, state.seeds, results) };
}

/** Cumulative standings across every reported round, with manual point
 *  overrides applied (they win over the derived totals). */
export function flightStandings(state: FlightsState): FlightStanding[] {
  return standingsFrom(state.rounds, state.rounds.length - 1, state.rules, state.overrides);
}

/** Set (or clear, with null) a player's manual points override. */
export function setFlightPoints(state: FlightsState, participantId: string, points: number | null): FlightsState {
  const overrides = { ...(state.overrides ?? {}) };
  if (points == null || Number.isNaN(points)) delete overrides[participantId];
  else overrides[participantId] = points;
  return { ...state, overrides };
}

/** Fill a flight up to `racesPerRound` with the same finishing order — for a
 *  "record all races" shortcut when the order is known / unchanged. */
export function fillFlightRaces(state: FlightsState, flightId: string, placements: RacePlacements): FlightsState {
  const flight = state.rounds.flatMap((r) => r).find((f) => f.id === flightId);
  if (!flight) return state;
  const have = (state.results[flightId] ?? []).length;
  const need = Math.max(0, state.rules.racesPerRound - have);
  if (need === 0) return state;
  const races = [...(state.results[flightId] ?? [])];
  for (let i = 0; i < need; i++) races.push({ ...placements });
  const results = { ...state.results, [flightId]: races };
  return { ...state, results, rounds: build(state.rules, state.seeds, results) };
}

export function flightRoundComplete(state: FlightsState, round: number): boolean {
  const flights = state.rounds[round];
  return !!flights && roundComplete(flights, state.rules);
}

/** Every round materialized and fully reported. */
export function isFlightsComplete(state: FlightsState): boolean {
  return state.rounds.length === state.rules.rounds && roundComplete(state.rounds[state.rounds.length - 1], state.rules);
}

/** Final placements from the cumulative standings, tie-aware — players level on
 *  points share a placement (1, 2, 2, 4). */
export function computeFlightPlacements(state: FlightsState): { participantId: string; placement: number }[] {
  return placementsWithTies(flightStandings(state).map((s) => ({ participantId: s.participantId, points: s.points })));
}

/** Groups of 2+ players tied on final points (for the runoff / share-placement
 *  decision). Each group is the tied participant ids. */
export function flightTies(state: FlightsState): string[][] {
  const byPoints = new Map<number, string[]>();
  for (const s of flightStandings(state)) {
    if (s.racesPlayed === 0 && !s.overridden) continue;
    const g = byPoints.get(s.points) ?? [];
    g.push(s.participantId);
    byPoints.set(s.points, g);
  }
  return [...byPoints.values()].filter((g) => g.length > 1);
}

/** A plain-English preview of the structure for the setup UI. */
export function describeFlights(rules: Partial<FlightRules>, fieldSize: number): string {
  const r = normalizeFlightRules(rules);
  if (fieldSize < 2) return "Add at least 2 players.";
  const num = flightCount(fieldSize, r.flightSize);
  const reseed = r.reseed === "snake" ? "spread across flights" : "grouped by standings";
  return `${fieldSize} players → ${num} ${num === 1 ? "flight" : "flights"} of ~${Math.round(fieldSize / num)}, ${r.racesPerRound} race${r.racesPerRound === 1 ? "" : "s"} each → ${r.rounds} round${r.rounds === 1 ? "" : "s"}, re-seeded ${reseed} between rounds. Champion = most points overall.`;
}
