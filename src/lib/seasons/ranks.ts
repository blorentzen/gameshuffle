/**
 * Seasons: calendar months, Pacific time (src/lib/time/gsClock.ts). Season points are the month's GS points
 * (placements, missions, awards...) from live nights. Client-safe.
 */

import { gsDayStart, gsMonthStart } from "@/lib/time/gsClock";

export interface SeasonRank { id: string; label: string; min: number }

/** Fixed thresholds, so a rank means the same thing in every community. */
export const SEASON_RANKS: SeasonRank[] = [
  { id: "rookie", label: "Rookie", min: 0 },
  { id: "bronze", label: "Bronze", min: 20 },
  { id: "silver", label: "Silver", min: 50 },
  { id: "gold", label: "Gold", min: 100 },
  { id: "platinum", label: "Platinum", min: 175 },
  { id: "superstar", label: "Superstar", min: 275 },
];

export function rankFor(points: number): SeasonRank {
  return [...SEASON_RANKS].reverse().find((r) => points >= r.min) ?? SEASON_RANKS[0];
}

/** The next rank up and how far away it is, or null at the top. */
export function nextRank(points: number): { rank: SeasonRank; needed: number } | null {
  const next = SEASON_RANKS.find((r) => r.min > points);
  return next ? { rank: next, needed: next.min - points } : null;
}

/** "2026-09" for a date: seasons are Pacific calendar months. */
export function seasonKey(d: Date = new Date()): string {
  return gsMonthStart(d).slice(0, 7);
}

/** A season's instants: midnight Pacific on the 1st to midnight Pacific on the next 1st. */
export function seasonRange(key: string): { start: string; end: string } {
  const [y, m] = key.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: gsDayStart(`${key}-01`).toISOString(), end: gsDayStart(`${next}-01`).toISOString() };
}

/** "September 2026" */
export function seasonLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function isSeasonKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Badge colour for a rank (CDS Badge variants). */
export function rankVariant(id: string): "default" | "info" | "success" | "warning" {
  return id === "superstar" || id === "platinum" ? "warning" : id === "gold" ? "success" : id === "silver" || id === "bronze" ? "info" : "default";
}
