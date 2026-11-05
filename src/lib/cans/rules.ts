/**
 * Cans for GameShuffle Competitive (picks 2026-11-04, 11A to 18A; pure, client-safe). A team leader posts a war
 * time, players answer Can / Sub / Maybe / Can't, the lineup is the first cans in the order they answered, then
 * subs. Times are typed in the captain's own time zone and shown to everyone in theirs (Discord's timestamps,
 * the War room's device). Usual hours are kept as UTC hours of the week so a team spread over time zones adds up.
 * Tests: scripts/test-cans.ts.
 */

import { zonedDay, zonedInstant, zonedParts } from "@/lib/time/gsClock";

export type CanAnswer = "can" | "sub" | "maybe" | "cant";
export const ANSWERS: { id: CanAnswer; label: string; style: 1 | 2 | 3 | 4 }[] = [
  { id: "can", label: "Can", style: 3 },
  { id: "sub", label: "Sub", style: 1 },
  { id: "maybe", label: "Maybe", style: 2 },
  { id: "cant", label: "Can't", style: 4 },
];
export const isAnswer = (v: unknown): v is CanAnswer => v === "can" || v === "sub" || v === "maybe" || v === "cant";

export const DEFAULT_SIZE = 6;
export const MIN_SIZE = 2;
export const MAX_SIZE = 12;
/** The reminder goes out this long before the war (15A). */
export const REMIND_MINUTES = 15;

// ── Typing a time ───────────────────────────────────────────────────────────

/**
 * "7pm", "7:30 pm", "19:00", "1930", "noon", "midnight". A bare hour from 1 to 11 is an evening (wars are), 12 is
 * noon, 13 to 23 read as 24-hour. Null for anything else.
 */
export function parseTime(raw: string): { hour: number; minute: number } | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  if (s === "noon") return { hour: 12, minute: 0 };
  if (s === "midnight") return { hour: 0, minute: 0 };
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59) return null;
  const half = m[3]?.[0];
  if (half) {
    if (hour < 1 || hour > 12) return null;
    if (half === "a") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (!m[2] && hour >= 1 && hour <= 11) {
    hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute };
}

export type CanDay = "today" | "tomorrow" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const DAY_CHOICES: { value: CanDay; name: string }[] = [
  { value: "today", name: "Today" }, { value: "tomorrow", name: "Tomorrow" },
  { value: "mon", name: "Monday" }, { value: "tue", name: "Tuesday" }, { value: "wed", name: "Wednesday" }, { value: "thu", name: "Thursday" },
  { value: "fri", name: "Friday" }, { value: "sat", name: "Saturday" }, { value: "sun", name: "Sunday" },
];
const WEEKDAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
export const isCanDay = (v: unknown): v is CanDay => typeof v === "string" && DAY_CHOICES.some((d) => d.value === v);

const addDays = (day: string, n: number) => {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
/** 0 = Sunday, from a calendar day. */
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/**
 * When a typed day and time land, in the captain's time zone. A weekday is its next one (today if the time is still
 * ahead). "past" for today at a time already gone (more than 10 minutes ago).
 */
export function startFor(day: CanDay, time: { hour: number; minute: number }, tz: string, now: Date = new Date()): Date | "past" {
  const today = zonedDay(now, tz);
  let date = day === "today" ? today : day === "tomorrow" ? addDays(today, 1) : today;
  if (day !== "today" && day !== "tomorrow") {
    const ahead = (WEEKDAY[day] - weekdayOf(today) + 7) % 7;
    date = addDays(today, ahead);
    if (ahead === 0 && zonedInstant(date, time.hour, time.minute, tz).getTime() < now.getTime()) date = addDays(today, 7);
  }
  const at = zonedInstant(date, time.hour, time.minute, tz);
  if (at.getTime() < now.getTime() - 10 * 60_000) return "past";
  return at;
}

/** Discord's own timestamps: each reader sees their own time zone. */
export const discordTime = (at: Date | string, style: "F" | "t" | "R" | "f" = "F") => `<t:${Math.floor(new Date(at).getTime() / 1000)}:${style}>`;

// ── The lineup ─────────────────────────────────────────────────────────────

export interface CanRow { userId: string; name: string; answer: CanAnswer; at: string }

/** The answers by kind, each in the order people answered. */
export function grouped(rows: CanRow[]): Record<CanAnswer, CanRow[]> {
  const by: Record<CanAnswer, CanRow[]> = { can: [], sub: [], maybe: [], cant: [] };
  for (const r of [...rows].sort((a, b) => a.at.localeCompare(b.at) || a.userId.localeCompare(b.userId))) by[r.answer].push(r);
  return by;
}

/** Full: as many cans as the war needs. */
export const isFull = (rows: CanRow[], size: number) => rows.filter((r) => r.answer === "can").length >= size;

/** The lineup (15A): the first cans in the order they answered, then subs when there aren't enough cans; the rest of the subs wait. */
export function lineupOf(rows: CanRow[], size: number): { players: CanRow[]; subs: CanRow[] } {
  const g = grouped(rows);
  const players = g.can.slice(0, size);
  const fill = g.sub.slice(0, Math.max(0, size - players.length));
  return { players: [...players, ...fill], subs: [...g.can.slice(size), ...g.sub.slice(fill.length)] };
}

// ── Time zones ──────────────────────────────────────────────────────────────

/** The first-time question's list (Discord takes 25 choices): the zones lounge players race in most. */
export const TZ_CHOICES: { value: string; label: string }[] = [
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Halifax", label: "Atlantic (Halifax)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Bogota", label: "Bogotá" },
  { value: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "Europe/London", label: "UK and Ireland (London)" },
  { value: "Europe/Paris", label: "Central Europe (Paris, Berlin)" },
  { value: "Europe/Helsinki", label: "Eastern Europe (Helsinki)" },
  { value: "Europe/Moscow", label: "Moscow" },
  { value: "Asia/Dubai", label: "Gulf (Dubai)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Bangkok", label: "Bangkok, Jakarta" },
  { value: "Asia/Singapore", label: "Singapore, Manila" },
  { value: "Asia/Shanghai", label: "China (Shanghai)" },
  { value: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { value: "Asia/Seoul", label: "Korea (Seoul)" },
  { value: "Australia/Sydney", label: "Eastern Australia (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand (Auckland)" },
];

/** A time zone name the runtime knows. */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

// ── Usual hours ─────────────────────────────────────────────────────────────

/**
 * Usual hours are stored as UTC half-hours of the week: 0 = Monday 00:00 UTC, 335 = Sunday 23:30 UTC. Half-hours,
 * so zones half an hour off UTC (India) go there and back exactly; the grid shows whole local hours.
 */
export const WEEK_SLOTS = 336;
export const LOCAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The Monday that starts `ref`'s week in a time zone, as a calendar day. */
function mondayOf(ref: Date, tz: string): string {
  const today = zonedDay(ref, tz);
  return addDays(today, -((weekdayOf(today) + 6) % 7));
}
const utcSlotOf = (at: Date) => ((at.getUTCDay() + 6) % 7) * 48 + at.getUTCHours() * 2 + (at.getUTCMinutes() >= 30 ? 1 : 0);

/** A local (day 0 = Monday, hour) in `tz` as a UTC half-hour of the week, this week. */
export function toUtcSlot(localDay: number, hour: number, tz: string, ref: Date = new Date()): number {
  return utcSlotOf(zonedInstant(addDays(mondayOf(ref, tz), localDay), hour, 0, tz));
}

/** A UTC half-hour of the week as (day 0 = Monday, hour) in `tz`, this week. */
export function toLocalHour(slot: number, tz: string, ref: Date = new Date()): { day: number; hour: number } {
  // The Monday 00:00 UTC that starts this UTC week, plus the half-hours.
  const r = new Date(ref);
  const mon = Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()) - ((r.getUTCDay() + 6) % 7) * 86_400_000;
  const p = zonedParts(new Date(mon + slot * 1_800_000), tz);
  return { day: (weekdayOf(p.day) + 6) % 7, hour: p.hour };
}

/** Someone's local picks (day × hour) as the stored UTC half-hours, sorted and without repeats. */
export function storeHours(local: { day: number; hour: number }[], tz: string, ref: Date = new Date()): number[] {
  const out = new Set<number>();
  for (const { day, hour } of local) {
    if (!Number.isInteger(day) || !Number.isInteger(hour) || day < 0 || day > 6 || hour < 0 || hour > 23) continue;
    out.add(toUtcSlot(day, hour, tz, ref));
  }
  return [...out].sort((a, b) => a - b);
}

/** One player's stored half-hours as local picks in `tz` (their own grid, or the viewer's). */
export function localPicks(slots: number[], tz: string, ref: Date = new Date()): { day: number; hour: number }[] {
  const seen = new Set<string>();
  const out: { day: number; hour: number }[] = [];
  for (const s of slots) {
    if (!Number.isInteger(s) || s < 0 || s >= WEEK_SLOTS) continue;
    const p = toLocalHour(s, tz, ref);
    const k = `${p.day}:${p.hour}`;
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
}

/** How many players can usually race in each of the viewer's own hours: grid[day 0 = Monday][hour]. */
export function localGrid(lists: number[][], tz: string, ref: Date = new Date()): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const slots of lists) for (const { day, hour } of localPicks(slots, tz, ref)) grid[day][hour]++;
  return grid;
}

/** The hours where the most players can race (ties: the earliest in the week), in the viewer's own week. */
export function bestHours(grid: number[][], n = 3, min = 1): { day: number; hour: number; count: number }[] {
  const all: { day: number; hour: number; count: number }[] = [];
  grid.forEach((row, day) => row.forEach((count, hour) => { if (count >= min) all.push({ day, hour, count }); }));
  return all.sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour).slice(0, n);
}

/** "6 PM", "12 AM". */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
/** "6p" for the grid's narrow headings. */
export const hourShort = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

/** The next time a local (day, hour) comes round in `tz` (this week, else next), for "Post a can check for Tue 6 PM". */
export function nextLocal(day: number, hour: number, tz: string, now: Date = new Date()): Date {
  const mon = mondayOf(now, tz);
  let at = zonedInstant(addDays(mon, day), hour, 0, tz);
  if (at.getTime() < now.getTime()) at = zonedInstant(addDays(mon, day + 7), hour, 0, tz);
  return at;
}
