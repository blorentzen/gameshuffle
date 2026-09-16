/**
 * Pure recurrence math for board-game-night series. No deps + no server-only, so
 * the create form (preview) and the server generator share one implementation.
 * Week-based cadences add a fixed number of weeks from the anchor; "monthly"
 * repeats the anchor's Nth weekday-of-month (e.g. the 2nd Saturday). All math is
 * done on the stored instant (UTC getters) so a materialized night keeps the
 * anchor's time-of-day.
 */

export type Cadence = "weekly" | "biweekly" | "every_3_weeks" | "every_4_weeks" | "monthly";

export const CADENCES: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "every_3_weeks", label: "Every 3 weeks" },
  { value: "every_4_weeks", label: "Every 4 weeks" },
  { value: "monthly", label: "Monthly (same weekday)" },
];

export function cadenceLabel(c: string): string {
  return CADENCES.find((x) => x.value === c)?.label ?? c;
}

const WEEKS: Partial<Record<Cadence, number>> = {
  weekly: 1,
  biweekly: 2,
  every_3_weeks: 3,
  every_4_weeks: 4,
};

const DAY_MS = 86_400_000;

/** The Nth weekday-of-month for (year, month), at the given time, or null if it
 *  doesn't exist that month (e.g. a 5th Saturday). Month is 0-based. */
function nthWeekday(
  year: number, month: number, weekday: number, ordinal: number, hour: number, minute: number,
): Date | null {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWd = first.getUTCDay();
  const day = 1 + ((weekday - firstWd + 7) % 7) + ordinal * 7;
  const d = new Date(Date.UTC(year, month, day, hour, minute));
  return d.getUTCMonth() === month ? d : null;
}

/**
 * The first occurrence strictly after `after`. If the anchor itself is still in
 * the future it's returned as-is. Returns null only for an unknown cadence.
 */
export function nextOccurrence(anchor: Date, cadence: Cadence, after: Date): Date | null {
  if (anchor.getTime() > after.getTime()) return anchor;

  const weeks = WEEKS[cadence];
  if (weeks) {
    const step = weeks * 7 * DAY_MS;
    const diff = after.getTime() - anchor.getTime();
    const steps = Math.floor(diff / step) + 1; // smallest step landing strictly after
    return new Date(anchor.getTime() + steps * step);
  }

  if (cadence === "monthly") {
    const weekday = anchor.getUTCDay();
    const ordinal = Math.floor((anchor.getUTCDate() - 1) / 7); // 0-based Nth
    const hour = anchor.getUTCHours();
    const minute = anchor.getUTCMinutes();
    let y = anchor.getUTCFullYear();
    let m = anchor.getUTCMonth();
    for (let i = 0; i < 48; i++) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      const d = nthWeekday(y, m, weekday, ordinal, hour, minute);
      if (d && d.getTime() > after.getTime()) return d;
    }
    return null;
  }

  return null;
}
