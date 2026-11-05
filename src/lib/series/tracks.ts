/**
 * The tracks a team series drafts from. Client-safe.
 *
 * Ids are the time trials' Mario Kart 8 Deluxe ids (stable cup-prefixed slugs), named the way the game names
 * them ("GBA Mario Circuit"). The default bank is the base game's 48 (the first 12 cups); organizers can make
 * it any set of the 96 (umikofy's question 3: which 48).
 */

import { ttTracks, type TtTrack } from "@/lib/timeTrials/tracks";

export type SeriesTrack = TtTrack;

export const BASE_BANK_SIZE = 48;

export function seriesTracks(): SeriesTrack[] {
  return ttTracks("mk8dx");
}

const BY_ID = new Map(seriesTracks().map((t) => [t.id, t]));

export function seriesTrack(id: string): SeriesTrack | null {
  return BY_ID.get(id) ?? null;
}

export function trackName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/** The base game's 48 tracks, in game order. */
export function baseBank(): string[] {
  return seriesTracks().slice(0, BASE_BANK_SIZE).map((t) => t.id);
}

/** Known track ids only, each once, in game order. */
export function cleanBank(ids: unknown): string[] {
  const want = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  return seriesTracks().filter((t) => want.has(t.id)).map((t) => t.id);
}

/** A bank grouped by cup, in game order (for the draft board). */
export function bankCups(bank: string[]): { cup: string; tracks: SeriesTrack[] }[] {
  const want = new Set(bank);
  const out: { cup: string; tracks: SeriesTrack[] }[] = [];
  for (const t of seriesTracks()) {
    if (!want.has(t.id)) continue;
    const last = out[out.length - 1];
    if (last && last.cup === t.cup) last.tracks.push(t);
    else out.push({ cup: t.cup, tracks: [t] });
  }
  return out;
}
