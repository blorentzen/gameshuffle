/**
 * Bracket engine (Tournament Overhaul, Phase 3). Pure + game-agnostic —
 * operates on participant IDs (seeds). Stored as a jsonb blob on the tournament
 * and mutated by the organizer reporting match winners, which auto-advance.
 *
 * - Single elimination: any count (byes for non-power-of-2).
 * - Double elimination: power-of-2 counts (4/8/16/32) in v1 — winners +
 *   losers bracket, grand final with a bracket reset. Byes in double elim are
 *   a v2 refinement.
 * - Swiss is a separate follow-on (needs a pairing engine).
 */

export type BracketGroup = "wb" | "lb" | "gf";

export interface BracketMatch {
  id: string;
  group: BracketGroup; // wb = winners, lb = losers, gf = grand final
  round: number; // 0-based within its group
  slot: number;
  a: string | null; // participant id, or null (bye / not-yet-decided)
  b: string | null;
  winner: string | null;
}

export interface Bracket {
  kind: "single_elim" | "double_elim";
  seeds: string[]; // index 0 = #1 seed
  size: number; // power-of-2 bracket size (>= seeds.length)
  rounds: number; // winners-bracket rounds
  lbRounds?: number; // losers-bracket rounds (double elim)
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

export function isPowerOf2(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

const find = (b: Bracket, group: BracketGroup, round: number, slot: number) =>
  b.matches.find((m) => m.group === group && m.round === round && m.slot === slot);

// --- Single elimination ----------------------------------------------------

function feedForwardSE(bracket: Bracket, match: BracketMatch): void {
  if (!match.winner) return;
  const next = find(bracket, "wb", match.round + 1, Math.floor(match.slot / 2));
  if (!next) return;
  if (match.slot % 2 === 0) next.a = match.winner;
  else next.b = match.winner;
}

export function generateSingleElim(seeds: string[]): Bracket {
  const n = seeds.length;
  const size = nextPow2(n);
  const order = seedOrder(size);
  const rounds = Math.log2(size);
  const matches: BracketMatch[] = [];

  for (let m = 0; m < size / 2; m++) {
    const aPos = order[m * 2];
    const bPos = order[m * 2 + 1];
    matches.push({
      id: `wb-r0-m${m}`,
      group: "wb",
      round: 0,
      slot: m,
      a: aPos <= n ? seeds[aPos - 1] : null,
      b: bPos <= n ? seeds[bPos - 1] : null,
      winner: null,
    });
  }
  for (let r = 1; r < rounds; r++) {
    const count = size / Math.pow(2, r + 1);
    for (let m = 0; m < count; m++) {
      matches.push({ id: `wb-r${r}-m${m}`, group: "wb", round: r, slot: m, a: null, b: null, winner: null });
    }
  }

  const bracket: Bracket = { kind: "single_elim", seeds, size, rounds, matches };
  for (const match of bracket.matches.filter((m) => m.round === 0)) {
    if (match.a && !match.b) applySingle(bracket, match.id, match.a);
    else if (!match.a && match.b) applySingle(bracket, match.id, match.b);
  }
  return bracket;
}

function applySingle(bracket: Bracket, matchId: string, winnerId: string): Bracket {
  const match = bracket.matches.find((m) => m.id === matchId);
  if (!match || (winnerId !== match.a && winnerId !== match.b)) return bracket;
  match.winner = winnerId;
  feedForwardSE(bracket, match);
  return bracket;
}

// --- Double elimination (power-of-2 seeds) ---------------------------------

/** LB match count per losers-bracket round for a bracket of `size`. */
function lbRoundCounts(size: number): number[] {
  const w = Math.log2(size);
  const counts: number[] = [];
  let cur = size / 4; // LB round 0 (minor) pairs WB-r0 losers
  for (let r = 0; r < 2 * (w - 1); r++) {
    counts.push(cur);
    // minor (even) round halves into next; major (odd) round keeps count then
    // the following minor halves. Pattern: [S/4, S/4, S/8, S/8, ...] then final.
    if (r % 2 === 1) cur = Math.max(1, Math.floor(cur / 2));
  }
  return counts;
}

export function generateDoubleElim(seeds: string[]): Bracket {
  const n = seeds.length;
  const size = n; // require exact power of 2 (caller guards)
  const order = seedOrder(size);
  const w = Math.log2(size);
  const matches: BracketMatch[] = [];

  // Winners bracket (no byes — power of 2).
  for (let m = 0; m < size / 2; m++) {
    matches.push({
      id: `wb-r0-m${m}`,
      group: "wb",
      round: 0,
      slot: m,
      a: seeds[order[m * 2] - 1],
      b: seeds[order[m * 2 + 1] - 1],
      winner: null,
    });
  }
  for (let r = 1; r < w; r++) {
    for (let m = 0; m < size / Math.pow(2, r + 1); m++) {
      matches.push({ id: `wb-r${r}-m${m}`, group: "wb", round: r, slot: m, a: null, b: null, winner: null });
    }
  }

  // Losers bracket.
  const lbCounts = lbRoundCounts(size);
  lbCounts.forEach((count, r) => {
    for (let m = 0; m < count; m++) {
      matches.push({ id: `lb-r${r}-m${m}`, group: "lb", round: r, slot: m, a: null, b: null, winner: null });
    }
  });

  // Grand final (+ reset created lazily on report).
  matches.push({ id: "gf-r0-m0", group: "gf", round: 0, slot: 0, a: null, b: null, winner: null });

  return { kind: "double_elim", seeds, size, rounds: w, lbRounds: lbCounts.length, matches };
}

/** Where a WB loser drops into the LB. Returns [round, slot, side]. */
function loserDrop(round: number, slot: number, w: number): { round: number; slot: number; side: "a" | "b" } {
  if (round === 0) {
    return { round: 0, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? "a" : "b" };
  }
  // WB round r>=1 losers drop into LB major round (2r-1), same slot, side b.
  return { round: 2 * round - 1, slot, side: "b" };
}

/** Where an LB winner advances. Returns null when this was the LB final. */
function lbAdvance(round: number, slot: number, lbRounds: number): { round: number; slot: number; side: "a" | "b" } | null {
  if (round >= lbRounds - 1) return null; // LB final → grand final
  if (round % 2 === 0) {
    // minor → major: same slot, side a
    return { round: round + 1, slot, side: "a" };
  }
  // major → minor: pair up, side by parity
  return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? "a" : "b" };
}

function applyDouble(bracket: Bracket, matchId: string, winnerId: string): Bracket {
  const match = bracket.matches.find((m) => m.id === matchId);
  if (!match || (winnerId !== match.a && winnerId !== match.b)) return bracket;
  match.winner = winnerId;
  const loser = winnerId === match.a ? match.b : match.a;
  const w = bracket.rounds;
  const lbRounds = bracket.lbRounds ?? 0;

  if (match.group === "wb") {
    // Advance winner within WB (or to GF if this was the WB final).
    if (match.round < w - 1) {
      const next = find(bracket, "wb", match.round + 1, Math.floor(match.slot / 2));
      if (next) (match.slot % 2 === 0 ? (next.a = winnerId) : (next.b = winnerId));
    } else {
      const gf = find(bracket, "gf", 0, 0);
      if (gf) gf.a = winnerId; // WB champ on side a
    }
    // Drop loser into LB.
    if (loser) {
      if (match.round === w - 1) {
        // WB final loser → LB final major round, side b
        const lbFinal = find(bracket, "lb", lbRounds - 1, 0);
        if (lbFinal) lbFinal.b = loser;
      } else {
        const d = loserDrop(match.round, match.slot, w);
        const t = find(bracket, "lb", d.round, d.slot);
        if (t) (d.side === "a" ? (t.a = loser) : (t.b = loser));
      }
    }
  } else if (match.group === "lb") {
    const adv = lbAdvance(match.round, match.slot, lbRounds);
    if (adv) {
      const next = find(bracket, "lb", adv.round, adv.slot);
      if (next) (adv.side === "a" ? (next.a = winnerId) : (next.b = winnerId));
    } else {
      const gf = find(bracket, "gf", 0, 0);
      if (gf) gf.b = winnerId; // LB champ on side b
    }
  } else if (match.group === "gf") {
    if (match.round === 0) {
      // If the LB champ (side b) wins, reset — one more match.
      if (winnerId === match.b) {
        if (!find(bracket, "gf", 1, 0)) {
          bracket.matches.push({ id: "gf-r1-m0", group: "gf", round: 1, slot: 0, a: match.a, b: match.b, winner: null });
        }
      }
    }
  }
  return bracket;
}

// --- Public API ------------------------------------------------------------

/** Report (or change) a match winner; recomputes downstream slots (immutable). */
export function reportWinner(bracket: Bracket, matchId: string, winnerId: string): Bracket {
  const clone: Bracket = JSON.parse(JSON.stringify(bracket));
  if (clone.kind === "double_elim") applyDouble(clone, matchId, winnerId);
  else applySingle(clone, matchId, winnerId);
  return clone;
}

/** The champion, or null if undecided. */
export function bracketChampion(bracket: Bracket): string | null {
  if (bracket.kind === "double_elim") {
    const reset = bracket.matches.find((m) => m.id === "gf-r1-m0");
    if (reset) return reset.winner;
    const gf = bracket.matches.find((m) => m.id === "gf-r0-m0");
    // gf-r0 decides the title only when the WB champ (side a) wins.
    return gf?.winner && gf.winner === gf.a ? gf.winner : null;
  }
  const final = bracket.matches.find((m) => m.group === "wb" && m.round === bracket.rounds - 1);
  return final?.winner ?? null;
}

/** Human label for a winners-bracket round (Final / Semifinals / …). */
export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${round + 1}`;
}

export function lbRoundLabel(round: number, lbRounds: number): string {
  if (round === lbRounds - 1) return "Losers Final";
  return `Losers R${round + 1}`;
}
