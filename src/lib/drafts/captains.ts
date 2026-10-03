/**
 * Captain drafts: the pure rules (client-safe). Captains take turns picking
 * players from everyone who signed up. Snake order goes 1-2-2-1 (with three
 * teams 1-2-3-3-2-1); alternating goes 1-2-1-2. The store runs it
 * (src/lib/drafts/store.ts); these decide whose turn it is and who a
 * `!pick` means.
 */

export interface Entrant {
  /** Stable id: "tw:<twitch id>" for chat and lobby players, "m:<slug>" for names added by hand. */
  key: string;
  name: string;
  twitchId?: string | null;
  twitchLogin?: string | null;
  userId?: string | null;
  source: "lobby" | "signup" | "manual";
}

export interface CaptainTeam {
  name: string;
  captain: Entrant;
  players: Entrant[];
}

export type PickOrder = "snake" | "alternate";

export const TEAM_NAMES = ["Red", "Blue", "Green", "Yellow"] as const;
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;
export const MAX_ENTRANTS = 64;

/** Which team picks on this turn (0-based). */
export function teamForTurn(turn: number, teamCount: number, order: PickOrder): number {
  const pos = turn % teamCount;
  if (order === "alternate") return pos;
  return Math.floor(turn / teamCount) % 2 === 0 ? pos : teamCount - 1 - pos;
}

/** How many picks in a row the team on the clock gets from this turn (snake turns come in pairs). */
export function picksInARow(turn: number, teamCount: number, order: PickOrder, remaining: number): number {
  const team = teamForTurn(turn, teamCount, order);
  let n = 0;
  while (n < remaining && teamForTurn(turn + n, teamCount, order) === team) n++;
  return n;
}

/** Players still up for grabs: signed up, not a captain, not picked. */
export function undrafted(entrants: Entrant[], teams: CaptainTeam[]): Entrant[] {
  const taken = new Set(teams.flatMap((t) => [t.captain.key, ...t.players.map((p) => p.key)]));
  return entrants.filter((e) => !taken.has(e.key));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Who `!pick <query>` means: ignores case, a leading @ and punctuation, and
 * matches the display name or Twitch login exactly, else a unique start, else
 * a unique partial. Returns "ambiguous" when several fit.
 */
export function matchEntrant(query: string, pool: Entrant[]): Entrant | "ambiguous" | null {
  const q = norm(query);
  if (!q) return null;
  const names = (e: Entrant) => [norm(e.name), e.twitchLogin ? norm(e.twitchLogin) : ""].filter(Boolean);
  for (const test of [(n: string) => n === q, (n: string) => n.startsWith(q), (n: string) => n.includes(q)]) {
    const hits = pool.filter((e) => names(e).some(test));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return "ambiguous";
  }
  return null;
}

/** A key for a name typed in by hand. */
export function manualKey(name: string): string {
  return `m:${norm(name) || Math.random().toString(36).slice(2, 8)}`;
}

/** Is this person the captain of the team on the clock? */
export function isCaptainOnClock(team: CaptainTeam | undefined, who: { userId?: string | null; twitchId?: string | null }): boolean {
  if (!team) return false;
  const c = team.captain;
  return (!!who.userId && c.userId === who.userId) || (!!who.twitchId && c.twitchId === who.twitchId);
}
