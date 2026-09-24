/**
 * Shape of a "More from this organizer" card.
 *
 * Client-safe on purpose. It lives here rather than in `more.ts` because that
 * module is `server-only`, and the rail that RENDERS these is a client
 * component — importing the type from there drags the server module into the
 * client graph and the build fails. One definition, imported by both sides, so
 * the query and the card cannot drift (they already had: the rail's inline copy
 * of this type was missing `coverUrl`).
 */
import type { EventType } from "./calendar";

export interface MoreEvent {
  type: EventType;
  id: string;
  title: string;
  startsAt: string | null;
  href: string;
  /** Short subtitle: game label or place. */
  subtitle: string | null;
  /** Lowest active ticket price in cents; null when the event sells none.
   *  Always rendered (as "Free" when absent) so a card never leaves price
   *  unstated. */
  priceFromCents: number | null;
  /** Cover art when the event has one; the rail falls back to a deterministic
   *  gradient + emoji so every card carries a visual and the row stays even. */
  coverUrl: string | null;
}
