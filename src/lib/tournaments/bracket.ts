/**
 * Single-elimination bracket engine (Tournament Overhaul, Phase 3). Pure +
 * game-agnostic — operates on participant IDs (seeds). Handles non-power-of-2
 * counts via byes. The bracket is stored as a jsonb blob on the tournament and
 * mutated by the organizer reporting match winners, which auto-advance.
 *
 * Double elimination / Swiss are follow-ons (they need a losers bracket /
 * pairing engine); v1 is single elim only.
 */

export interface BracketMatch {
  id: string; // `r{round}-m{slot}`
  round: number; // 0 = first round
  slot: number; // position within the round
  a: string | null; // participant id, or null (bye / not-yet-decided)
  b: string | null;
  winner: string | null;
}

export interface Bracket {
  kind: "single_elim";
  seeds: string[]; // participant ids in seed order (index 0 = #1 seed)
  size: number; // power-of-2 bracket size (>= seeds.length)
  rounds: number;
  matches: BracketMatch[];
}

/** Standard bracket seed order for a power-of-2 size (1-based seed positions). */
export function seedOrder(size: number): number[] {
  let pols = [1, 2];
  const rounds = Math.log2(size);
  for (let i = 1; i < rounds; i++) {
    const sum = pols.length * 2 + 1;
    const next: number[] = [];
    for (const p of pols) {
      next.push(p);
      next.push(sum - p);
    }
    pols = next;
  }
  return pols;
}

function nextPow2(n: number): number {
  return Math.max(2, 1 << Math.ceil(Math.log2(Math.max(2, n))));
}

/** Propagate a decided match's winner into the next round (mutates). */
function feedForward(bracket: Bracket, match: BracketMatch): void {
  if (!match.winner) return;
  const next = bracket.matches.find((m) => m.round === match.round + 1 && m.slot === Math.floor(match.slot / 2));
  if (!next) return; // final match
  if (match.slot % 2 === 0) next.a = match.winner;
  else next.b = match.winner;
}

/** Set a match winner and cascade it forward (mutates, returns the bracket). */
function applyWinner(bracket: Bracket, matchId: string, winnerId: string): Bracket {
  const match = bracket.matches.find((m) => m.id === matchId);
  if (!match) return bracket;
  if (winnerId !== match.a && winnerId !== match.b) return bracket;
  match.winner = winnerId;
  feedForward(bracket, match);
  return bracket;
}

/** Build a fresh single-elim bracket from seeds (index 0 = top seed). */
export function generateSingleElim(seeds: string[]): Bracket {
  const n = seeds.length;
  const size = nextPow2(n);
  const order = seedOrder(size);
  const rounds = Math.log2(size);
  const matches: BracketMatch[] = [];

  // Round 0 — pair consecutive slots from the seed order.
  for (let m = 0; m < size / 2; m++) {
    const aPos = order[m * 2];
    const bPos = order[m * 2 + 1];
    matches.push({
      id: `r0-m${m}`,
      round: 0,
      slot: m,
      a: aPos <= n ? seeds[aPos - 1] : null,
      b: bPos <= n ? seeds[bPos - 1] : null,
      winner: null,
    });
  }
  // Later rounds — empty (TBD), filled as winners advance.
  for (let r = 1; r < rounds; r++) {
    const count = size / Math.pow(2, r + 1);
    for (let m = 0; m < count; m++) {
      matches.push({ id: `r${r}-m${m}`, round: r, slot: m, a: null, b: null, winner: null });
    }
  }

  const bracket: Bracket = { kind: "single_elim", seeds, size, rounds, matches };

  // Auto-advance first-round byes (a real player vs an empty slot).
  for (const match of bracket.matches.filter((m) => m.round === 0)) {
    if (match.a && !match.b) applyWinner(bracket, match.id, match.a);
    else if (!match.a && match.b) applyWinner(bracket, match.id, match.b);
  }
  return bracket;
}

/** Report (or change) a match winner; recomputes downstream slots. */
export function reportWinner(bracket: Bracket, matchId: string, winnerId: string): Bracket {
  // Deep clone so callers stay immutable.
  const clone: Bracket = JSON.parse(JSON.stringify(bracket));
  applyWinner(clone, matchId, winnerId);
  return clone;
}

/** The champion (final match winner), or null if undecided. */
export function bracketChampion(bracket: Bracket): string | null {
  const final = bracket.matches.find((m) => m.round === bracket.rounds - 1);
  return final?.winner ?? null;
}

/** Human label for a round (Final / Semifinals / …). */
export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round + 1}`;
}
