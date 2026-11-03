/**
 * The 200cc Lounge's own MMR rules ("200 Lounge rules"; history import picks 2026-11-01,
 * https://claude.ai/artifact/8DkgY7VZgHqRH1HkiQf9Un, picks 1A and 2A), rebuilt from its open-source bot
 * (billypom/200-Bot, helpers/calculate_pre_mmr.py, calculate_mmr.py, handlers/handle_placement_init.py). Pure,
 * client-safe. Checked against the bot's own records: every Season 6 result it can check, and 19,126 of 19,152 in
 * Season 7 (the other 26 off by 4 or less); Season 5 used an older version.
 *
 * Each team is rated at its players' average, where a player on their first table counts as 0. Every pair of teams
 * moves points: beating a team pays 1 + O·(1 + (theirs − yours)/H)^M, losing costs 1 + O·(1 + (yours − theirs)/H)^M,
 * and a tie moves S·(((Δ/H)²)^⅓)² toward the lower team. H is 10,999 (the bot's "highest MMR"). A team's change is the
 * floor of its sum, and every player on it moves by that. Python raises a negative number to a fractional power as a
 * complex number and the bot keeps the real part, so `realPow` does the same.
 *
 * A new player is placed by their first table's score (110+ Gold 5,250, 80+ Silver 3,750, 50+ Bronze 2,250, else
 * Iron 1,000; a Tier C room asks 10 more points for each), then moves by their team's change like everyone else.
 */

/** Per players-per-team: tie scale S, pair scale O, exponent M. */
export const LOUNGE200_CONSTANTS: Record<number, { S: number; O: number; M: number }> = {
  1: { S: 63, O: 19, M: 2.1 },
  2: { S: 142, O: 39, M: 3.0000001 },
  3: { S: 288, O: 59, M: 3.1 },
  4: { S: 402, O: 79, M: 3.35 },
  6: { S: 525, O: 99, M: 3.5 },
};
export const LOUNGE200_HIGHEST = 10999;

/** Python's `base ** exp` for a float base, real part only (a negative base gives |base|^exp · cos(π·exp)). */
export function realPow(base: number, exp: number): number {
  if (base >= 0) return Math.pow(base, exp);
  return Math.pow(-base, exp) * Math.cos(Math.PI * exp);
}

/** Each team's change, in the order given. `rank` is 1 for the best team; tied teams share a rank. */
export function lounge200Deltas(teams: { rating: number; rank: number }[], format: number): number[] {
  const c = LOUNGE200_CONSTANTS[format];
  if (!c) return teams.map(() => 0);
  const H = LOUNGE200_HIGHEST;
  return teams.map((x, i) => {
    let sum = 0;
    teams.forEach((y, j) => {
      if (i === j) return;
      if (y.rank === x.rank) {
        const v = c.S * Math.pow(Math.pow(Math.pow((y.rating - x.rating) / H, 2), 1 / 3), 2);
        sum += y.rating >= x.rating ? v : -v;
      } else if (y.rank > x.rank) {
        sum += 1 + c.O * realPow(1 + (y.rating - x.rating) / H, c.M);
      } else {
        sum -= 1 + c.O * realPow(1 + (x.rating - y.rating) / H, c.M);
      }
    });
    return Math.floor(sum);
  });
}

export interface PlacementStep { score: number; mmr: number }
export interface ScorePlacement {
  /** Highest score first; the first step a score reaches is where the player starts. */
  steps: PlacementStep[];
  /** Extra points a tier asks for (tier name lowercased, "c" → 10). */
  tierExtra: Record<string, number>;
  /** A player on their first table counts as 0 in their team's average (the bot does, on purpose since 2022). */
  countZero: boolean;
}

export const LOUNGE200_PLACEMENT: ScorePlacement = {
  steps: [{ score: 110, mmr: 5250 }, { score: 80, mmr: 3750 }, { score: 50, mmr: 2250 }, { score: 0, mmr: 1000 }],
  tierExtra: { c: 10 },
  countZero: true,
};

/** Where a new player starts from their first table's score. */
export function placedAt(score: number | null, tier: string | null, p: ScorePlacement): number {
  const extra = tier ? p.tierExtra[tier.trim().toLowerCase().replace(/^tier[\s-]*/, "")] ?? 0 : 0;
  const s = score ?? 0;
  const sorted = [...p.steps].sort((a, b) => b.score - a.score);
  for (const step of sorted) if (s >= step.score + (step.score > 0 ? extra : 0)) return step.mmr;
  return sorted[sorted.length - 1]?.mmr ?? 1000;
}

/** The 200cc Lounge's divisions (the same in Seasons 5 to 7). */
export const LOUNGE200_DIVISIONS = [
  { name: "Iron", at: 0 }, { name: "Bronze", at: 1500 }, { name: "Silver", at: 3000 }, { name: "Gold", at: 4500 },
  { name: "Platinum", at: 6000 }, { name: "Diamond", at: 7500 }, { name: "Master", at: 9000 }, { name: "Grandmaster", at: 11000 },
];
