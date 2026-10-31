/**
 * Track codes (picks 2026-10-30, https://claude.ai/artifact/98nMfavGN4fZQyDLp634we): the short names comp
 * players use (MKS, rMMM, bNYM…), one per track, from the paste reader's tables (MK8DX's standard 96,
 * World's community codes). Lists of times show the code; single-track posts show the name with the
 * code; the Discord track picker finds a track by its code. Pure.
 */

import { shortNames } from "./quaxly";
import { ttTracks, type TtGame, type TtTrack } from "./tracks";

type Table = { code: Map<string, string>; byCode: Map<string, TtTrack[]> };
const tables = new Map<TtGame, Table>();

function table(game: TtGame): Table {
  const hit = tables.get(game);
  if (hit) return hit;
  const byName = new Map(ttTracks(game).map((t) => [t.name, t]));
  const code = new Map<string, string>();
  const byCode = new Map<string, TtTrack[]>();
  for (const { abbr, name } of shortNames(game)) {
    const t = byName.get(name);
    if (!t) continue;
    // The first code listed for a track is the one shown (World lists aliases after it: PS, PS1, PS2).
    if (!code.has(t.id)) code.set(t.id, abbr);
    const k = abbr.toLowerCase();
    byCode.set(k, [...(byCode.get(k) ?? []), t]);
  }
  const t: Table = { code, byCode };
  tables.set(game, t);
  return t;
}

/** The track's code ("rMMM"), or null when it has none. */
export function trackCode(t: TtTrack): string | null {
  return table(t.game).code.get(t.id) ?? null;
}

/** A single-track title: the name with its code, "Wii Moo Moo Meadows (rMMM)". */
export function trackTitle(t: TtTrack): string {
  const c = trackCode(t);
  return c ? `${t.name} (${c})` : t.name;
}

/**
 * Tracks whose code matches typed text, any case: exact codes first, then codes starting with it.
 * Both games unless one is given.
 */
export function tracksByCode(text: string, game?: TtGame): TtTrack[] {
  const q = text.trim().toLowerCase();
  if (!q || /\s/.test(q) || q.length > 6) return [];
  const games: TtGame[] = game ? [game] : ["mk8dx", "mkworld"];
  const exact: TtTrack[] = [];
  const prefix: TtTrack[] = [];
  for (const g of games) {
    for (const [k, list] of table(g).byCode) {
      if (k === q) exact.push(...list);
      else if (k.startsWith(q)) prefix.push(...list);
    }
  }
  const seen = new Set<string>();
  return [...exact, ...prefix].filter((t) => {
    const key = `${t.game}|${t.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
