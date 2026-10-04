/**
 * Number bingo (a GameShuffle Original: the couch version of Stream Bingo).
 * Pure and client-safe. Classic 75-ball: B 1–15, I 16–30, N 31–45, G 46–60,
 * O 61–75, free centre. A claim is checked against the numbers actually called,
 * so a bingo can't be faked by marking extra squares.
 */

export const LETTERS = ["B", "I", "N", "G", "O"] as const;
/** 0 marks the free centre square. */
export const FREE = 0;

/** A card: 25 numbers, row by row. */
export type Card = number[];

export function makeCard(rand: () => number = Math.random): Card {
  const cols = LETTERS.map((_, c) => {
    const pool = Array.from({ length: 15 }, (_, i) => c * 15 + i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 5);
  });
  const card: Card = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) card.push(r === 2 && c === 2 ? FREE : cols[c][r]);
  return card;
}

export function letterFor(n: number): string {
  return LETTERS[Math.min(4, Math.floor((n - 1) / 15))];
}

export function nextCall(called: number[], rand: () => number = Math.random): number | null {
  const left = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !called.includes(n));
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

const LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** The first complete line on this card from the called numbers, as square indexes, or null. */
export function bingoLine(card: Card, called: number[]): number[] | null {
  return patternHit(card, called, "line");
}

/**
 * Winning patterns. "line" is any row, column or diagonal; the rest are one
 * fixed shape each. A game uses one pattern, or a series steps through them.
 */
export type Pattern = "line" | "corners" | "x" | "frame" | "blackout";
export const PATTERNS: { id: Pattern; label: string; blurb: string }[] = [
  { id: "line", label: "Any line", blurb: "A full row, column or diagonal" },
  { id: "corners", label: "Four corners", blurb: "All four corner squares" },
  { id: "x", label: "The X", blurb: "Both diagonals" },
  { id: "frame", label: "Picture frame", blurb: "Every square around the edge" },
  { id: "blackout", label: "Blackout", blurb: "Every square on the card" },
];
/** The order a series works through. */
export const PATTERN_SERIES: Pattern[] = ["line", "corners", "x", "frame", "blackout"];

const SHAPES: Record<Exclude<Pattern, "line">, number[]> = {
  corners: [0, 4, 20, 24],
  x: [0, 6, 12, 18, 24, 4, 8, 16, 20],
  frame: [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24],
  blackout: Array.from({ length: 25 }, (_, i) => i),
};

/** The squares that complete the pattern on this card, or null if it isn't complete. */
export function patternHit(card: Card, called: number[], pattern: Pattern): number[] | null {
  const hit = (i: number) => card[i] === FREE || called.includes(card[i]);
  if (pattern === "line") return LINES.find((line) => line.every(hit)) ?? null;
  const shape = SHAPES[pattern];
  return shape.every(hit) ? shape : null;
}

/** The pattern for the nth game of a series (1-based). */
export function seriesPattern(n: number): Pattern {
  return PATTERN_SERIES[(Math.max(1, n) - 1) % PATTERN_SERIES.length];
}
