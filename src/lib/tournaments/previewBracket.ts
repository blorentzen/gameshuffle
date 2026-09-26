/**
 * A shape-only bracket for a tournament that has not started yet.
 *
 * An open elimination tournament used to show nothing of the thing people were
 * signing up for — not how many rounds it runs, not where the field sits. This
 * builds the real bracket from the real generator, padding the field to
 * capacity with placeholder seats so the SHAPE is right from the first signup.
 *
 * Pure and separate from the page so the padding rules can be tested: they are
 * easy to get subtly wrong (an off-by-one in the power-of-two fill puts a
 * phantom round on the end, which would misrepresent the format).
 */

import { generateSingleElim, generateDoubleElim, type Bracket } from "./bracket";

/** Placeholder seats. Rendered as "???" — never as a player. */
export const OPEN_SEAT = "__open-";

export function isOpenSeat(id: string | null | undefined): boolean {
  return !!id && id.startsWith(OPEN_SEAT);
}

export function buildPreviewBracket(opts: {
  format: string | null | undefined;
  /** Ids of everyone currently holding a seat. */
  taken: string[];
  /** Field cap, when the organizer set one. */
  capacity?: number | null;
}): Bracket | null {
  const { format, taken } = opts;
  if (format !== "single_elim" && format !== "double_elim") return null;
  // One signup is not a bracket, it is a person waiting.
  if (taken.length < 2) return null;

  const cap = opts.capacity ?? 0;
  let size: number;
  if (cap > taken.length) {
    size = cap;
  } else if (cap) {
    size = cap; // full: the bracket is exactly the field
  } else {
    // No cap, so the shape is the next power of two the field fits into —
    // which is what the generator would pick at start time anyway.
    size = 2;
    while (size < taken.length) size *= 2;
  }

  const seeds = [
    ...taken,
    ...Array.from({ length: Math.max(0, size - taken.length) }, (_, i) => `${OPEN_SEAT}${i}`),
  ];

  try {
    return format === "single_elim" ? generateSingleElim(seeds) : generateDoubleElim(seeds);
  } catch {
    // A field the generator will not take is not worth guessing at.
    return null;
  }
}
