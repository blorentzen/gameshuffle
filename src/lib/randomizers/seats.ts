/**
 * Per-seat picks for the randomizer cards. A card's own refresh changes only
 * its seat; rolling everyone is the intro card's "Randomize" button. Seats are
 * a sparse list (null = not rolled yet), so a seat added after a roll, or a
 * card refreshed before anyone rolled, fills on its own.
 */

/** A copy of `list` with `seat` set to `value`, padded with nulls up to that seat. */
export function withSeat<T>(list: readonly (T | null | undefined)[], seat: number, value: T): (T | null)[] {
  const next: (T | null)[] = Array.from({ length: Math.max(list.length, seat + 1) }, (_, i) => list[i] ?? null);
  next[seat] = value;
  return next;
}

/** The picks every other seat holds (for games that keep picks different). */
export function otherSeats<T>(list: readonly (T | null | undefined)[], seat: number): T[] {
  return list.filter((x, i): x is T => i !== seat && x != null);
}

/** The card's name in a button label: what was typed, or "Player 2". */
export function seatLabel(names: readonly string[], seat: number): string {
  return names[seat]?.trim() || `Player ${seat + 1}`;
}
