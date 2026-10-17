/**
 * Help bought with tokens at the dailies' last chance (Britton's picks,
 * 2026-10-16): letters of the answer's name and extra guesses. Client-safe;
 * the server side is src/lib/daily/help.ts.
 *
 * Letters: the Daily Dex's last chance already shows the first letter, so
 * bought letters are the 2nd, 3rd and 4th; the Daily Shuffle shows none, so
 * the first purchase is the first letter (and, with the squares, the length).
 * Two letters always stay hidden, so a short name allows fewer.
 */

export interface HelpCounts { letters: number; guesses: number }
export interface HelpPrices { letter: number; guess: number; letters: number; guesses: number }
export const NO_HELP: HelpCounts = { letters: 0, guesses: 0 };
export const HELP_DEFAULTS: HelpPrices = { letter: 100, guess: 250, letters: 3, guesses: 2 };

export type HelpCell = { kind: "free" | "bought"; ch: string } | { kind: "blank" } | { kind: "gap" } | { kind: "mark"; ch: string };

const isLetter = (ch: string) => /\p{L}/u.test(ch);

export function letterTotal(name: string): number {
  return [...name].filter(isLetter).length;
}

/** The name as squares: `free` letters given, `bought` more in gold, the rest blank; spaces and punctuation as they are. */
export function helpCells(name: string, free: number, bought: number): HelpCell[] {
  let i = 0;
  return [...name].map((ch): HelpCell => {
    if (!isLetter(ch)) return ch === " " ? { kind: "gap" } : { kind: "mark", ch };
    const at = i++;
    if (at < free) return { kind: "free", ch: ch.toUpperCase() };
    if (at < free + bought) return { kind: "bought", ch: ch.toUpperCase() };
    return { kind: "blank" };
  });
}

/** How many letters can be bought for a name: up to the cap, always leaving two hidden. */
export function lettersAllowed(name: string, free: number, cap: number): number {
  return Math.max(0, Math.min(cap, letterTotal(name) - free - 2));
}

/** The shared-results line: a 💡 per letter, ➕ per extra guess ("" without help). */
export function helpLine(h: HelpCounts | null | undefined): string {
  if (!h || (!h.letters && !h.guesses)) return "";
  return [`${"💡".repeat(h.letters)}`, `${"➕".repeat(h.guesses)}`].filter(Boolean).join(" ");
}

/** Spoken label for the squares: "Starts with C H I, 9 letters". */
export function helpCellsLabel(cells: HelpCell[]): string {
  const shown = cells.filter((c): c is { kind: "free" | "bought"; ch: string } => c.kind === "free" || c.kind === "bought").map((c) => c.ch);
  const total = cells.filter((c) => c.kind === "free" || c.kind === "bought" || c.kind === "blank").length;
  return `${shown.length ? `Starts with ${shown.join(" ")}, ` : ""}${total} letters`;
}
