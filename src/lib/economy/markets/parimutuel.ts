/**
 * Market-wide parimutuel payout (Spec 02 §6 steps 5 and 6) for markets whose outcomes are one pool: binary, pickone
 * and count. Everyone who picked a winning outcome splits every token put in, pro rata by stake; integer dust goes to
 * the largest stake (ties: the lowest identity id, so it's the same every time). Nobody on the winning side, or nobody
 * on a losing side, means no counterparty: everyone gets their own stake back.
 *
 * Pure and client-safe; tests in scripts/test-speedrun.ts. (Placement markets keep their per-threshold pools in
 * lifecycle.ts.)
 */

export interface Stake {
  identity_id: string;
  outcome_id: string;
  amount: number;
}

export interface ParimutuelPlan {
  /** "refund" = everyone gets their own stake back (one-sided or empty market). */
  kind: "payout" | "refund";
  /** What each identity is credited. */
  credits: Map<string, number>;
  /** Every token put in. */
  pot: number;
  /** Distinct identities on a winning outcome. */
  winners: number;
}

export function parimutuel(bets: readonly Stake[], winningOutcomes: ReadonlySet<string>): ParimutuelPlan {
  const pot = bets.reduce((a, b) => a + Number(b.amount), 0);
  const winStake = new Map<string, number>();
  let loseTotal = 0;
  for (const b of bets) {
    const amt = Number(b.amount);
    if (winningOutcomes.has(b.outcome_id)) winStake.set(b.identity_id, (winStake.get(b.identity_id) ?? 0) + amt);
    else loseTotal += amt;
  }
  const winTotal = [...winStake.values()].reduce((a, b) => a + b, 0);

  if (pot <= 0 || winTotal <= 0 || loseTotal <= 0) {
    const credits = new Map<string, number>();
    for (const b of bets) credits.set(b.identity_id, (credits.get(b.identity_id) ?? 0) + Number(b.amount));
    return { kind: "refund", credits, pot, winners: winStake.size };
  }

  const order = [...winStake.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const credits = new Map<string, number>();
  let paid = 0;
  for (const [id, stake] of order) {
    const share = Math.floor((pot * stake) / winTotal);
    credits.set(id, share);
    paid += share;
  }
  const dust = pot - paid;
  if (dust > 0) credits.set(order[0][0], (credits.get(order[0][0]) ?? 0) + dust);
  return { kind: "payout", credits, pot, winners: winStake.size };
}
