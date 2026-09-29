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
  const hit = (i: number) => card[i] === FREE || called.includes(card[i]);
  return LINES.find((line) => line.every(hit)) ?? null;
}
