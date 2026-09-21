/**
 * Stream schedule — a streamer's recurring weekly slots, surfaced on their
 * community / profile / live page (a friendlier stand-in for Twitch's schedule).
 * Client-safe.
 *
 * SECURITY: `resolveStreamSchedule` is the gate — day/time/duration are numeric
 * + range-checked, the timezone must be a real IANA zone, titles are plain text.
 * Run on read + write. Nothing renderable but validated primitives.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MAX_SLOTS = 21;
const TITLE_MAX = 60;

export interface ScheduleSlot {
  day: number;            // 0 = Sunday … 6 = Saturday
  start: string;          // "HH:MM" 24h, in the schedule's timezone
  durationMins: number;   // 15–720
  title: string | null;
}
export interface StreamSchedule {
  timezone: string;       // IANA, e.g. "America/Los_Angeles"
  slots: ScheduleSlot[];
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validTimezone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}

export function resolveStreamSchedule(raw: unknown): StreamSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const timezone = validTimezone(obj.timezone) ?? "UTC";
  const slots: ScheduleSlot[] = [];
  if (Array.isArray(obj.slots)) {
    for (const s of obj.slots) {
      if (slots.length >= MAX_SLOTS || !s || typeof s !== "object") continue;
      const o = s as Record<string, unknown>;
      const day = Number(o.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const start = typeof o.start === "string" && HHMM.test(o.start) ? o.start : null;
      if (!start) continue;
      let durationMins = Number(o.durationMins);
      if (!Number.isFinite(durationMins)) durationMins = 120;
      durationMins = Math.max(15, Math.min(720, Math.round(durationMins)));
      const title = (typeof o.title === "string" ? o.title : "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) || null;
      slots.push({ day, start, durationMins, title });
    }
  }
  if (slots.length === 0) return null;
  slots.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  return { timezone, slots };
}

// ── Timezone math (no external lib) ──────────────────────────────────────────

/** ms to add to a UTC instant to get the wall clock in `tz` (i.e. the offset). */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) if (part.type !== "literal") p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - instant.getTime();
}

/** The UTC instant for a wall-clock time in `tz`. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo, d, h, mi);
  // Two-pass to settle DST edges.
  const off1 = tzOffsetMs(new Date(guess), tz);
  const off2 = tzOffsetMs(new Date(guess - off1), tz);
  return new Date(guess - off2);
}

/** The streamer-tz calendar date (y/m/d/weekday) for a UTC instant. */
function zonedDateParts(instant: Date, tz: string): { y: number; mo: number; d: number; wd: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) if (part.type !== "literal") p[part.type] = part.value;
  const wd = WEEKDAYS.indexOf(p.weekday as (typeof WEEKDAYS)[number]);
  return { y: +p.year, mo: +p.month - 1, d: +p.day, wd };
}

export interface NextStream { slot: ScheduleSlot; at: Date }

/** The soonest upcoming slot as a real UTC instant, searching the next 8 days. */
export function nextStreamOccurrence(schedule: StreamSchedule, now: Date = new Date()): NextStream | null {
  const base = zonedDateParts(now, schedule.timezone);
  let best: NextStream | null = null;
  for (let k = 0; k < 8; k++) {
    // The tz calendar date base+k days, via pure UTC calendar arithmetic (no tz
    // conversion — base.y/mo/d are already the streamer-zone date components).
    const cal = new Date(Date.UTC(base.y, base.mo, base.d + k));
    const y = cal.getUTCFullYear(), mo = cal.getUTCMonth(), d = cal.getUTCDate();
    const weekday = (base.wd + k) % 7;
    for (const slot of schedule.slots) {
      if (slot.day !== weekday) continue;
      const [h, mi] = slot.start.split(":").map(Number);
      const at = zonedToUtc(y, mo, d, h, mi, schedule.timezone);
      if (at.getTime() >= now.getTime() && (!best || at.getTime() < best.at.getTime())) {
        best = { slot, at };
      }
    }
  }
  return best;
}

/** "7:00 PM" from "19:00". */
export function formatSlotTime(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

/** Short tz label (e.g. "PST") for display next to the times. */
export function tzAbbrev(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch { return tz; }
}
