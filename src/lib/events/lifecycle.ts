/**
 * When an event stops counting as "live business" (decided 2026-10-07).
 * Client-safe.
 *
 *   - Cancelled or archived: gone from every list and search (the page still
 *     loads by direct link, with a note).
 *   - Stale: an open tournament whose date passed more than STALE_OPEN_DAYS
 *     ago without starting. It leaves browse, stops using a free organizer's
 *     one active slot, and the organizer is nudged once to finish or cancel it.
 *   - Stuck (added 2026-10-19): a tournament still marked in progress more
 *     than STUCK_LIVE_DAYS after its date (someone forgot to finish it). It
 *     leaves browse and search too, and the organizer is nudged once, but it
 *     still holds the active slot (the database trigger only knows stale opens).
 */

export const STALE_OPEN_DAYS = 2;
export const STUCK_LIVE_DAYS = 3;

/** The cutoff instant: an open tournament dated before this is stale. */
export function staleCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - STALE_OPEN_DAYS * 86_400_000).toISOString();
}

export function isStaleOpen(t: { status: string | null; date_time: string | null }, now: Date = new Date()): boolean {
  return t.status === "open" && !!t.date_time && Date.parse(t.date_time) < Date.parse(staleCutoffIso(now));
}

/** The cutoff instant: a tournament still in progress and dated before this is stuck. */
export function stuckCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - STUCK_LIVE_DAYS * 86_400_000).toISOString();
}

export function isStuckLive(t: { status: string | null; date_time: string | null }, now: Date = new Date()): boolean {
  return t.status === "in_progress" && !!t.date_time && Date.parse(t.date_time) < Date.parse(stuckCutoffIso(now));
}

/** Still the organizer's live business: counts toward a free account's one active tournament. */
export function isActiveTournament(t: { status: string | null; date_time: string | null; archived_at?: string | null }, now: Date = new Date()): boolean {
  return !t.archived_at && ["draft", "open", "in_progress"].includes(t.status ?? "") && !isStaleOpen(t, now);
}

/** A PostgREST filter for lists and search that drops stale opens and stuck
 *  in-progress tournaments: any other status, or dated recently enough for its
 *  status, or undated. */
export function notStaleOpenFilter(now: Date = new Date()): string {
  return [
    "status.not.in.(open,in_progress)",
    `and(status.eq.open,date_time.gte.${staleCutoffIso(now)})`,
    `and(status.eq.in_progress,date_time.gte.${stuckCutoffIso(now)})`,
    "date_time.is.null",
  ].join(",");
}
