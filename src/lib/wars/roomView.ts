/**
 * The War room's view of a war (GameShuffle Competitive's Activity; War room picks 2026-11-01,
 * https://claude.ai/artifact/LKB8iApfE2Tqg1yhivbj53, all as recommended). Pure and client-safe: the server builds it
 * from the war row (src/lib/wars/room.ts) and the app draws it (src/components/activity/war/).
 *   Who it waits on (pick 4A): players who tapped an earlier race of this war and haven't tapped this one (the newest
 *   tapped lineup, like the card), so people watching never hold a race up and a sub shows up once they tap.
 *   Players (pick 6A): each player's place in every race they tapped, and their points; races that went in by hand
 *   aren't split by player.
 *   Other formats (team sizes picks 2026-11-10): the places and the team follow the war's size; taps run only in
 *   two-team wars of up to 12 players, and with several teams `them` is the leader (or the team behind you when you lead).
 */

import { POINTS, TEAM, penaltyTeam, standing, tapClashes, type WarGame, type WarPenalty, type WarRace, type WarSide } from "./rules";
import { DEFAULT_FORMAT, placePoints, teamScores, type WarFormat } from "./format";

export interface RoomTeam { tag: string; name: string | null; logo: string | null; total: number }
export interface RoomPerson { id: string; name: string }
export interface RoomTrack { id: string; code: string | null; name: string; image: string | null }
export interface RoomRaceRow { n: number; track: RoomTrack | null; spots: number[]; diff: number; lead: number; by: string; tapped: boolean }
export interface RoomPlayerRow { id: string; name: string; places: (number | null)[]; points: number }

export interface WarRoomView {
  id: string;
  status: "live" | "done" | "ended";
  game: WarGame;
  racesTotal: number;
  /** Players a team, players in the room, teams in it, and your team's place among them. */
  size: number;
  room: number;
  teamsCount: number;
  rank: number;
  /** Whether players tap their places here (two-team wars of up to 12 players); else races go in on the card. */
  tapsOn: boolean;
  us: RoomTeam;
  them: RoomTeam;
  /** Every team in the order they were named (two for a two-team war). */
  teams: RoomTeam[];
  diff: number;
  diffs: number[];
  played: number;
  left: number;
  decided: WarSide | null;
  need: { side: WarSide; avg: number } | null;
  /** The race being tapped in (null once the war is over). */
  race: {
    n: number;
    track: RoomTrack | null;
    /** Who tapped each place (more than one = a clash). */
    taps: { place: number; people: RoomPerson[] }[];
    clashes: number[];
    waiting: RoomPerson[];
    count: number;
    /** The viewer's own place this race, if they tapped. */
    mine: number | null;
  } | null;
  races: RoomRaceRow[];
  players: RoomPlayerRow[];
  /** Races that went in by hand (not split by player) and their points. */
  byHand: { races: number[]; points: number };
  penalties: { side: WarSide; points: number; reason: string; team: number }[];
  /** "Kart Club won 522 to 462", once the war is over. */
  headline: string | null;
  /** The best scorer from the taps, once the war is over. */
  topPlayer: { name: string; points: number } | null;
  /** Where the war's card is in Discord, and its page on GameShuffle. */
  cardUrl: string | null;
  pageUrl: string;
  channelId: string;
  /** The last race that can still be undone (the newest one). */
  undo: number | null;
}

export const teamName = (t: { name: string | null; tag: string }) => t.name || t.tag;

/**
 * Who the race being tapped is still waiting on (pick 4A): the lineup of the newest race that was tapped in, like the
 * war card, so a player who was subbed out isn't waited on once the sub has tapped a race.
 */
export function waitingOn(races: readonly WarRace[], taps: readonly { id: string }[], size = TEAM): RoomPerson[] {
  if (taps.length >= size) return [];
  const tapped = new Set(taps.map((t) => t.id));
  const lineup = [...races].sort((a, b) => b.n - a.n).find((r) => r.players?.length)?.players ?? [];
  return lineup.filter((p) => !tapped.has(p.id)).map((p) => ({ id: p.id, name: p.name })).slice(0, size - taps.length);
}

/** Each player's places and points from the taps (pick 6A); `points` is the room's points table. */
export function playerRows(races: readonly WarRace[], total: number, points: readonly number[] = POINTS): { rows: RoomPlayerRow[]; byHand: { races: number[]; points: number } } {
  const sorted = [...races].sort((a, b) => a.n - b.n);
  const rows = new Map<string, RoomPlayerRow>();
  const byHand: number[] = [];
  let handPoints = 0;
  for (const r of sorted) {
    const players = r.players ?? [];
    const scored = new Set(players.map((p) => p.place));
    // A race counts as tapped only when every one of the team's places has a player.
    // A race carried over with only points counts its points by hand too.
    if (!players.length) { byHand.push(r.n); handPoints += r.spots.length ? r.spots.reduce((a, s) => a + placePoints(points, s), 0) : r.scores?.[0] ?? 0; }
    else {
      const loose = r.spots.filter((s) => !scored.has(s));
      if (loose.length) { byHand.push(r.n); handPoints += loose.reduce((a, s) => a + placePoints(points, s), 0); }
    }
    for (const p of players) {
      const row = rows.get(p.id) ?? { id: p.id, name: p.name, places: Array<number | null>(total).fill(null), points: 0 };
      row.name = p.name;
      if (r.n >= 1 && r.n <= total) row.places[r.n - 1] = p.place;
      row.points += placePoints(points, p.place);
      rows.set(p.id, row);
    }
  }
  return { rows: [...rows.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)), byHand: { races: byHand, points: handPoints } };
}

/** The lead after each race over `rival` (the other team, or with several teams the standing's rival), penalties counted from the race before they were given. */
export function leads(races: readonly WarRace[], penalties: readonly WarPenalty[], game: WarGame = "mk8dx", fmt: WarFormat = DEFAULT_FORMAT, rival = 1): number[] {
  const sorted = [...races].sort((a, b) => a.n - b.n);
  let lead = 0;
  return sorted.map((r, i) => {
    const sc = teamScores(r, game, fmt);
    lead += (sc[0] ?? 0) - (sc[rival] ?? 0);
    const next = sorted[i + 1];
    const pens = penalties.filter((p) => Date.parse(p.at) >= Date.parse(r.at) && (!next || Date.parse(p.at) < Date.parse(next.at)));
    for (const p of pens) {
      const t = penaltyTeam(p);
      if (t === 0) lead -= p.points;
      else if (t === rival) lead += p.points;
    }
    return lead;
  });
}

/** Who tapped each place, and the places two people share. */
export function tapGrid(taps: readonly { id: string; name: string; place: number }[]): { taps: { place: number; people: RoomPerson[] }[]; clashes: number[] } {
  const by = new Map<number, RoomPerson[]>();
  for (const t of taps) by.set(t.place, [...(by.get(t.place) ?? []), { id: t.id, name: t.name }]);
  return { taps: [...by].sort((a, b) => a[0] - b[0]).map(([place, people]) => ({ place, people })), clashes: tapClashes(taps) };
}

export function headlineFor(status: string, played: number, racesTotal: number, us: RoomTeam, them: RoomTeam): string | null {
  if (status === "live") return null;
  if (status === "ended" && played < racesTotal) return `Ended after race ${played}, ${us.total} to ${them.total}`;
  if (us.total === them.total) return `A tie, ${us.total} to ${them.total}`;
  const [w, l] = us.total > them.total ? [us, them] : [them, us];
  return `${teamName(w)} won ${w.total} to ${l.total}`;
}

export { standing };
