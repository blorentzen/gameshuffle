/**
 * Seasonal trivia categories (Britton's pick, 2026-10-19): a holiday pack plays
 * in its season and stays out of everything mixed the rest of the year, so a
 * July trivia night, break-mode round or Fire Round never deals a Halloween
 * question. Rounds or categories that ask for the holiday by name still get it.
 * Client-safe; dates are Pacific (MM-DD, inclusive).
 */

import { gsDay } from "@/lib/time/gsClock";

export type SeasonRange = { from: string; to: string };

export const SEASONS: Record<string, SeasonRange> = {
  Halloween: { from: "10-01", to: "10-31" },
};

/** Is a Pacific day (YYYY-MM-DD) inside a season? A range may wrap the new year. */
export function inSeasonRange(range: SeasonRange, day: string): boolean {
  const md = day.slice(5, 10);
  return range.from <= range.to ? md >= range.from && md <= range.to : md >= range.from || md <= range.to;
}

/** Year-round categories always are; seasonal ones only in their season. */
export function categoryInSeason(category: string | null | undefined, day: string = gsDay()): boolean {
  const range = category ? SEASONS[category] : undefined;
  return !range || inSeasonRange(range, day);
}
