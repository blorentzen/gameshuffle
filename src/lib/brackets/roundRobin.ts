/**
 * Round robin for the free round robin generator: everyone plays everyone
 * (once, or twice with a second leg), scheduled with the circle method so each
 * round has everyone playing at the same time; with an odd count one player
 * sits out each round, and everyone sits out exactly once per leg.
 *
 * Standings: win 3, tie 1, loss 0. Level on points: head-to-head when exactly
 * two are level, then wins, then list order (the seed).
 */

export interface RRMatch {
  /** 0-based round across both legs. */
  round: number;
  a: number;
  b: number;
}

export interface RRSchedule {
  rounds: number;
  matches: RRMatch[];
  /** Who sits out each round (odd counts), by round. */
  byes: (number | null)[];
}

export type RRResult = "a" | "b" | "t";

/** The circle method: player 0 stays put, everyone else turns one seat each round. */
export function roundRobinSchedule(players: number, legs: 1 | 2 = 1): RRSchedule {
  const n = players % 2 ? players + 1 : players;
  const ghost = players % 2 ? n - 1 : -1;
  let seats = Array.from({ length: n }, (_, i) => i);
  const perLeg = n - 1;
  const matches: RRMatch[] = [];
  const byes: (number | null)[] = [];
  for (let r = 0; r < perLeg; r++) {
    let bye: number | null = null;
    for (let i = 0; i < n / 2; i++) {
      let a = seats[i], b = seats[n - 1 - i];
      if (a === ghost || b === ghost) { bye = a === ghost ? b : a; continue; }
      // Swap the fixed player's side every other round so nobody is always "first".
      if (i === 0 && r % 2) [a, b] = [b, a];
      matches.push({ round: r, a, b });
    }
    byes.push(bye);
    seats = [seats[0], seats[n - 1], ...seats.slice(1, n - 1)];
  }
  if (legs === 2) {
    const first = matches.length;
    for (let i = 0; i < first; i++) matches.push({ round: matches[i].round + perLeg, a: matches[i].b, b: matches[i].a });
    byes.push(...byes.slice());
  }
  return { rounds: perLeg * legs, matches, byes };
}

export interface RRRow {
  player: number;
  rank: number;
  played: number;
  wins: number;
  ties: number;
  losses: number;
  points: number;
}

/** Standings from the results so far (index = match index in the schedule). */
export function roundRobinStandings(players: number, schedule: RRSchedule, results: (RRResult | null)[]): RRRow[] {
  const rows: RRRow[] = Array.from({ length: players }, (_, player) => ({ player, rank: 0, played: 0, wins: 0, ties: 0, losses: 0, points: 0 }));
  // Points each player took off each opponent, for head-to-head.
  const h2h = new Map<string, number>();
  const addH2h = (x: number, y: number, pts: number) => h2h.set(`${x}:${y}`, (h2h.get(`${x}:${y}`) ?? 0) + pts);
  schedule.matches.forEach((m, i) => {
    const res = results[i];
    if (!res) return;
    const A = rows[m.a], B = rows[m.b];
    A.played++; B.played++;
    if (res === "t") { A.ties++; B.ties++; addH2h(m.a, m.b, 1); addH2h(m.b, m.a, 1); }
    else if (res === "a") { A.wins++; B.losses++; addH2h(m.a, m.b, 3); }
    else { B.wins++; A.losses++; addH2h(m.b, m.a, 3); }
  });
  for (const r of rows) r.points = r.wins * 3 + r.ties;
  const level = new Map<number, number>();
  for (const r of rows) level.set(r.points, (level.get(r.points) ?? 0) + 1);
  const sorted = [...rows].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (level.get(x.points) === 2) {
      const hx = h2h.get(`${x.player}:${y.player}`) ?? 0, hy = h2h.get(`${y.player}:${x.player}`) ?? 0;
      if (hx !== hy) return hy - hx;
    }
    if (y.wins !== x.wins) return y.wins - x.wins;
    return x.player - y.player;
  });
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

const RESULT_CODE: Record<RRResult, string> = { a: "a", b: "b", t: "t" };

export function encodeRR(results: (RRResult | null)[]): string {
  return results.map((r) => (r ? RESULT_CODE[r] : ".")).join("").replace(/\.+$/, "");
}

export function decodeRR(code: unknown, matches: number, ties: boolean): (RRResult | null)[] {
  const out: (RRResult | null)[] = Array.from({ length: matches }, () => null);
  if (typeof code !== "string") return out;
  for (let i = 0; i < Math.min(code.length, matches); i++) {
    const c = code[i];
    out[i] = c === "a" || c === "b" ? c : c === "t" && ties ? "t" : null;
  }
  return out;
}
