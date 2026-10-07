/**
 * GameShuffle's clock. Every site-wide day, week and month (the Daily, the
 * Weekly, daily AI tries, seasons, allowances, release dates, admin charts)
 * turns over at midnight Pacific: America/Los_Angeles, so PDT in summer and
 * PST in winter. Nothing site-wide follows UTC.
 *
 * Tournaments, game nights, events and stream schedules are the exception:
 * they're shown in the viewer's or owner's own timezone (src/lib/time/format.ts).
 *
 * Days are "YYYY-MM-DD" strings. Calendar math on a day string (add days,
 * weekday) doesn't depend on any timezone; only "what day is it now" and
 * "when does this day start" do. Client-safe.
 */

export const GS_TIME_ZONE = "America/Los_Angeles";

const FORMATS = new Map<string, Intl.DateTimeFormat>();
function formatFor(tz: string): Intl.DateTimeFormat {
  let f = FORMATS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    FORMATS.set(tz, f);
  }
  return f;
}

function partsAt(at: number, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const p = Object.fromEntries(formatFor(tz).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A valid IANA zone, or Pacific (for a timezone sent by a browser). */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return GS_TIME_ZONE;
  try { formatFor(tz); return tz; } catch { return GS_TIME_ZONE; }
}

/** The calendar day for an instant in any zone. */
export function zonedDay(at: Date | number, tz: string): string {
  const { y, m, d } = partsAt(+at, tz);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A zone's offset from UTC at an instant, in minutes (Pacific: -420 in PDT, -480 in PST). */
function offsetMinutes(at: number, tz: string): number {
  const p = partsAt(at, tz);
  return (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(at / 1000) * 1000) / 60000;
}

/** The instant a calendar day begins (its midnight) in any zone. */
export function zonedDayStart(day: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMinutes(guess, tz) * 60000;
  const again = offsetMinutes(t, tz);
  if (again !== offsetMinutes(guess, tz)) t = guess - again * 60000;
  return new Date(t);
}

/** An instant's local calendar day and wall-clock time in any zone. */
export function zonedParts(at: Date | number, tz: string): { day: string; hour: number; minute: number } {
  const p = partsAt(+at, tz);
  return { day: `${p.y}-${pad(p.m)}-${pad(p.d)}`, hour: p.h, minute: p.mi };
}

/**
 * The instant a local wall-clock time happens in a zone ("2026-11-06" at
 * 19:00 in Los Angeles). For recurring events: step the local date, keep the
 * local time, so a 7pm night stays at 7pm across daylight saving changes.
 */
export function zonedInstant(day: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let t = guess - offsetMinutes(guess, tz) * 60000;
  const again = offsetMinutes(t, tz);
  if (again !== offsetMinutes(guess, tz)) t = guess - again * 60000;
  return new Date(t);
}

/** The Pacific calendar day for an instant (now by default). */
export function gsDay(at: Date | number = Date.now()): string {
  return zonedDay(at, GS_TIME_ZONE);
}

/** The hour (0-23) in Pacific time for an instant. */
export function gsHour(at: Date | number = Date.now()): number {
  return partsAt(+at, GS_TIME_ZONE).h;
}

/** The instant a Pacific calendar day begins (its midnight), for database "since today" queries. */
export function gsDayStart(day: string): Date {
  return zonedDayStart(day, GS_TIME_ZONE);
}

/** A day string moved by `n` calendar days. */
export function gsAddDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Weekday of a day string, 0 = Sunday. */
export function gsWeekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** The Monday that starts the Pacific week containing an instant. */
export function gsWeekStart(at: Date | number = Date.now()): string {
  const day = gsDay(at);
  return gsAddDays(day, -((gsWeekday(day) + 6) % 7));
}

/** The first day ("YYYY-MM-01") of the Pacific month containing an instant. */
export function gsMonthStart(at: Date | number = Date.now()): string {
  return `${gsDay(at).slice(0, 8)}01`;
}
