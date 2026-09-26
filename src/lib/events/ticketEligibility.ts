/**
 * Who gets a door ticket (the QR), as a pure client-safe rule.
 *
 * Deliberately NOT in `attendees.ts`: that module is `server-only`, and the
 * tournament page that has to ask this question is a client component, so
 * importing from there drags the server module into the client graph and the
 * build fails.
 *
 * The page and the API were answering this differently — someone who had signed
 * up for a tournament but sat at `registered` saw no ticket on the page, while
 * `/ticket` would still mint them one by URL. One predicate now, because the two
 * answers must agree: the page decides whether to SHOW a QR, the route decides
 * whether to SIGN one.
 */

import type { EventType } from "./calendar";

export type AttendeeStatus =
  | "registered" | "confirmed" | "checked_in" | "dropped"
  | "waitlisted" | "going" | "maybe" | "declined";

/**
 *   game night  going                  → yes (maybe / waitlisted / declined → no)
 *   tournament  confirmed / checked_in → yes
 *               registered             → only when the event auto-accepts. Under
 *                                        manual acceptance the entry is still an
 *                                        application the organizer can turn
 *                                        down, and a scannable ticket would
 *                                        imply a seat they do not have yet.
 */
export function canHoldTicket(
  type: EventType,
  status: AttendeeStatus,
  acceptanceMode?: string | null,
): boolean {
  if (type === "game-night") return status === "going";
  if (status === "confirmed" || status === "checked_in") return true;
  return status === "registered" && acceptanceMode === "auto";
}
