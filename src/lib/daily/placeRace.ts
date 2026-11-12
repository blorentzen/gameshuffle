/**
 * The day board as a race between the places people play (co-op picks
 * 2026-11-11; Britton: "a race between the places people play"). Pure and
 * client-safe: each place's points and players today, from the day's scores.
 *
 *   site      signed in on GameShuffle (u:)
 *   discord   played in the Discord Activity without an account (i:)
 *   guest     a guest on the site (g:)
 *
 * The Facebook Instant Game becomes a fourth place once its players are told
 * apart from site guests.
 */

export type RacePlace = "site" | "discord" | "guest";

export interface PlaceTotal { place: RacePlace; points: number; players: number }

export const RACE_NAME: Record<RacePlace, string> = { site: "GameShuffle", discord: "Discord", guest: "Guests" };

const placeOfKey = (player: string): RacePlace | null =>
  player.startsWith("u:") ? "site" : player.startsWith("i:") ? "discord" : player.startsWith("g:") ? "guest" : null;

/** Each place's total, most points first (ties: more players, then the fixed order). Places nobody played from are left out. */
export function raceTotals(rows: { player: string; points: number }[]): PlaceTotal[] {
  const order: RacePlace[] = ["site", "discord", "guest"];
  const totals = new Map<RacePlace, PlaceTotal>();
  for (const r of rows) {
    const place = placeOfKey(r.player);
    if (!place) continue;
    const t = totals.get(place) ?? { place, points: 0, players: 0 };
    t.points += Math.max(0, Number(r.points) || 0);
    t.players += 1;
    totals.set(place, t);
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || b.players - a.players || order.indexOf(a.place) - order.indexOf(b.place));
}

/** Worth showing: at least two places have players today. */
export const isRace = (totals: PlaceTotal[] | null | undefined): totals is PlaceTotal[] => !!totals && totals.length >= 2;
