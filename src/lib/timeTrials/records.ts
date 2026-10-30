/**
 * The record floor (picks 2026-10-29, 8A): a time faster than a track's world record can't be
 * saved, on the site, in /gs-tt or in an import. Records come from mkwrs.com
 * (src/data/time-trials-records.ts, refreshed by scripts/pull-tt-records.ts and checked monthly).
 * A time up to RECORD_SLACK under the stored record still counts, so a record set since the last
 * refresh isn't refused. Client-safe.
 */

import { TT_RECORDS } from "@/data/time-trials-records";
import type { TtClass, TtGame } from "./tracks";

export const RECORD_SLACK = 0.01;

export function recordFor(game: TtGame, track: string, cc: TtClass): number | null {
  return TT_RECORDS[`${game}:${track}:${cc}`] ?? null;
}

export function fasterThanRecord(game: TtGame, track: string, cc: TtClass, ms: number): boolean {
  const r = recordFor(game, track, cc);
  return r != null && ms < Math.floor(r * (1 - RECORD_SLACK));
}
