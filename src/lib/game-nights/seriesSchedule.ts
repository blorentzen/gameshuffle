/**
 * Pure recurrence math for game night series. No deps + no server-only, so
 * the create form (preview) and the server generator share one implementation.
 * Week-based cadences add a fixed number of weeks from the anchor; "monthly"
 * repeats the anchor's Nth weekday-of-month (e.g. the 2nd Saturday). All math
 * runs in the series' timezone on the local date and wall-clock time, so a
 * night keeps its local start time through daylight saving changes.
 */

import { GS_TIME_ZONE, gsAddDays, gsWeekday, zonedInstant, zonedParts } from "@/lib/time/gsClock";

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

/**
 * The Nth weekday-of-month for a month, as a local day string, or null if it
 * doesn't exist that month (e.g. a 5th Saturday). Month is 1-based.
 */
function nthWeekday(year: number, month: number, weekday: number, ordinal: number): string | null {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const offset = (weekday - gsWeekday(first) + 7) % 7 + ordinal * 7;
  const day = gsAddDays(first, offset);
  return Number(day.slice(5, 7)) === month ? day : null;
}

/**
 * The first occurrence strictly after `after`. If the anchor itself is still in
 * the future it's returned as-is. Returns null only for an unknown cadence.
 *
 * Steps happen in the series' own timezone (`tz`): the local date moves and the
 * local start time stays, so a 7pm weekly night is still 7pm after daylight
 * saving changes, and "the 2nd Friday" means the host's Friday, not UTC's.
 */
export function nextOccurrence(anchor: Date, cadence: Cadence, after: Date, tz: string = GS_TIME_ZONE): Date | null {
  if (anchor.getTime() > after.getTime()) return anchor;
  const local = zonedParts(anchor, tz);

  const weeks = WEEKS[cadence];
  if (weeks) {
    const at = (k: number) => zonedInstant(gsAddDays(local.day, k * weeks * 7), local.hour, local.minute, tz);
    // Estimate from elapsed time, then settle: an hour of daylight saving can move the boundary by one step.
    let k = Math.max(1, Math.floor((after.getTime() - anchor.getTime()) / (weeks * 7 * 86_400_000)) + 1);
    while (at(k).getTime() <= after.getTime()) k++;
    while (k > 1 && at(k - 1).getTime() > after.getTime()) k--;
    return at(k);
  }

  if (cadence === "monthly") {
    const weekday = gsWeekday(local.day);
    const ordinal = Math.floor((Number(local.day.slice(8, 10)) - 1) / 7); // 0-based Nth
    let y = Number(local.day.slice(0, 4));
    let m = Number(local.day.slice(5, 7));
    for (let i = 0; i < 48; i++) {
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      const day = nthWeekday(y, m, weekday, ordinal);
      if (!day) continue;
      const d = zonedInstant(day, local.hour, local.minute, tz);
      if (d.getTime() > after.getTime()) return d;
    }
    return null;
  }

  return null;
}
