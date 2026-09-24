/**
 * How a price reads on every GameShuffle surface.
 *
 * Listings used to render a price only when there was one, so a free event
 * showed nothing at all and you could not tell "free" apart from "we did not
 * say". Price is now always stated, because the absence of a number is the one
 * thing a buyer cannot interpret.
 *
 * Client-safe and pure so the browse grid, the more-from rail and any future
 * card can share it rather than each re-deciding what `null` means.
 */

export interface EventPrice {
  label: string;
  isFree: boolean;
}

/**
 * `cents` is the LOWEST active tier, or null when the event sells no tickets.
 * Both mean free to attend; the distinction is not useful to a viewer.
 */
export function formatEventPrice(cents: number | null | undefined): EventPrice {
  if (cents == null || cents === 0) return { label: "Free", isFree: true };
  const dollars = cents / 100;
  // Whole dollars lose the ".00": "$15" reads faster than "$15.00" in a grid.
  const amount = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return { label: `From ${amount}`, isFree: false };
}
