/**
 * What a lounge event pays and who's favored (pure, client-safe). Fitted on 932 verified
 * MK World 12P tables (Oct 13 to 20, 2026; dashboard additions picks, all as recommended):
 *
 * - The MMR change works like Elo between every pair of teams: each pair is worth K points,
 *   split by how expected the result was, E = 1 / (1 + 10^((Rb − Ra) / scale)), with a
 *   team's rating as its players' average. K and the scale depend on the format (PAY below);
 *   with them every format matched real changes to within about 2 MMR on average.
 *   Multipliers (a player who left early, a host) aren't modelled.
 * - Who finishes ahead is a separate fit on real results: P(a ahead of b) =
 *   1 / (1 + 10^((Rb − Ra) / 3500)). The higher-rated player finished ahead in 66% of pairs.
 */

/** Points a pair is worth and the rating scale, by players per team (fitted per format). */
export const PAY: Record<number, { k: number; scale: number }> = {
  1: { k: 40, scale: 7000 },
  2: { k: 80, scale: 4000 },
  3: { k: 120, scale: 4000 },
  4: { k: 160, scale: 3500 },
  6: { k: 200, scale: 3500 },
};
export const ODDS_SCALE = 3500;

const expect = (a: number, b: number, scale: number) => 1 / (1 + 10 ** ((b - a) / scale));
const payFor = (teamSize: number) => PAY[Math.max(1, Math.round(teamSize))] ?? { k: 40 * Math.max(1, Math.round(teamSize)), scale: 4000 };

/** K for a format (players per team). */
export const kFor = (teamSize: number) => payFor(teamSize).k;

/** The change for a team (or a player in free-for-all) given every team's rating and finishing rank (1 = first; ties share a rank). */
export function eventDeltas(teams: { rating: number; rank: number }[], teamSize = 1): number[] {
  const { k, scale } = payFor(teamSize);
  return teams.map((t, i) => {
    let sum = 0;
    teams.forEach((o, j) => {
      if (i === j) return;
      const s = t.rank < o.rank ? 1 : t.rank === o.rank ? 0.5 : 0;
      sum += s - expect(t.rating, o.rating, scale);
    });
    return Math.round(k * sum);
  });
}

/** What each finishing place pays one team (index 0 = 1st), against the others' ratings.
 *  In an even room each place is worth about K. */
export function payouts(mine: number, others: number[], teamSize = 1): number[] {
  const { k, scale } = payFor(teamSize);
  const expected = others.reduce((n, r) => n + expect(mine, r, scale), 0);
  const n = others.length + 1;
  return Array.from({ length: n }, (_, place) => Math.round(k * ((n - 1 - place) - expected)));
}

/** The lowest place that doesn't lose MMR (1-based), or null when even 1st loses. */
export function breakEven(pay: number[]): number | null {
  let last: number | null = null;
  pay.forEach((v, i) => { if (v >= 0) last = i + 1; });
  return last;
}

/** Each team's likely finishing place (the average place from pairwise odds), in the order given. */
export function likelyPlaces(ratings: number[]): number[] {
  return ratings.map((r, i) => 1 + ratings.reduce((n, o, j) => (i === j ? n : n + expect(o, r, ODDS_SCALE)), 0));
}

/** The chance a team finishes ahead of another. */
export const aheadOdds = (a: number, b: number) => expect(a, b, ODDS_SCALE);

/** How a team did against the room: its finishing place minus its likely place (negative = better than expected). */
export function againstRoom(ratings: number[], index: number, place: number): number {
  return place - likelyPlaces(ratings)[index];
}
