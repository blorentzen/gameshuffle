/**
 * Waitlist rules (pure, client-safe). Decisions:
 * https://claude.ai/artifact/VGCbh3KiXEPLz4MKUTmJ7v
 *
 * When a seat opens, the next person in line gets an OFFER they can claim
 * until it runs out, then it moves on. How long an offer lasts slides with how
 * close the event is; in the last stretch there's no time for one-at-a-time
 * offers, so it becomes STANDBY: anyone waiting can claim an open spot, and
 * waitlisted people already checked in at the venue are seated first.
 */

import type { EventType } from "./calendar";

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;
/** The last stretch before the start where standby replaces offers. */
export const STANDBY_MS = 2 * HOUR;

export type OfferPlan = { kind: "offer"; ms: number } | { kind: "standby" };

/** How long a new offer lasts, given when the event starts (null = no start time: the far-out window). */
export function offerPlan(startsAt: string | null, now: number = Date.now()): OfferPlan {
  if (!startsAt) return { kind: "offer", ms: 24 * HOUR };
  const until = Date.parse(startsAt) - now;
  if (until <= STANDBY_MS) return { kind: "standby" };
  if (until > 3 * DAY) return { kind: "offer", ms: 24 * HOUR };
  if (until > DAY) return { kind: "offer", ms: 4 * HOUR };
  return { kind: "offer", ms: HOUR };
}

/** When a new offer expires: its window, but never later than the start of standby. */
export function offerExpiry(startsAt: string | null, now: number = Date.now()): Date | null {
  const plan = offerPlan(startsAt, now);
  if (plan.kind === "standby") return null;
  let end = now + plan.ms;
  if (startsAt) end = Math.min(end, Date.parse(startsAt) - STANDBY_MS);
  return new Date(Math.max(end, now + 15 * 60 * 1000));
}

/** Statuses that take a seat (an offer holds one). */
export function seatStatuses(type: EventType): string[] {
  return type === "tournament" ? ["registered", "confirmed", "checked_in", "offered"] : ["going", "offered"];
}

export interface InLine { id: string; status: string; rank: number | null; waitlistedAt: string | null; joinedAt: string | null }

/** The line, in order: organizer rank first, then who joined the waitlist first. */
export function lineOrder<T extends InLine>(rows: T[]): T[] {
  return rows
    .filter((r) => r.status === "waitlisted")
    .sort((a, b) =>
      (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      || (a.waitlistedAt ?? a.joinedAt ?? "").localeCompare(b.waitlistedAt ?? b.joinedAt ?? ""));
}

/** "3h 42m", "45m", "2d 4h". */
export function timeLeft(ms: number): string {
  if (ms <= 0) return "0m";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
