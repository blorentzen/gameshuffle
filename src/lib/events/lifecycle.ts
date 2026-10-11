/**
 * When an event stops counting as "live business" (decided 2026-10-07).
 * Client-safe.
 *
 *   - Cancelled or archived: gone from every list and search (the page still
 *     loads by direct link, with a note).
 *   - Stale: an open tournament whose date passed more than STALE_OPEN_DAYS
 *     ago without starting. It leaves browse, stops using a free organizer's
 *     one active slot, and the organizer is nudged once to finish or cancel it.
 */

export const STALE_OPEN_DAYS = 2;

/** The cutoff instant: an open tournament dated before this is stale. */
export function staleCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - STALE_OPEN_DAYS * 86_400_000).toISOString();
}

export function isStaleOpen(t: { status: string | null; date_time: string | null }, now: Date = new Date()): boolean {
  return t.status === "open" && !!t.date_time && Date.parse(t.date_time) < Date.parse(staleCutoffIso(now));
}

/** Still the organizer's live business: counts toward a free account's one active tournament. */
export function isActiveTournament(t: { status: string | null; date_time: string | null; archived_at?: string | null }, now: Date = new Date()): boolean {
  return !t.archived_at && ["draft", "open", "in_progress"].includes(t.status ?? "") && !isStaleOpen(t, now);
}

/** A PostgREST filter that drops stale opens: not open, or dated recently, or undated. */
export function notStaleOpenFilter(now: Date = new Date()): string {
  return `status.neq.open,date_time.gte.${staleCutoffIso(now)},date_time.is.null`;
}
