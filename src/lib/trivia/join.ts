import "server-only";

/**
 * Joining a trivia night from a phone. Signed out: type a team name (as
 * before). Signed in: play as yourself, as one of your crews, or on a league
 * night as your league team (or enter one at the door). A crew or league team
 * plays as one team a night, so a member who arrives later joins it with one
 * tap and gets the same key as the phone that started it; anyone else still
 * needs the teammate link.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";
import { MAX_TEAMS } from "./rules";
import { TEAM_COLS, gameByCode, joinTeam, type GameRow, type TeamRow } from "./store";
import { myCrews, playerName } from "./crews";
import { enterTeam, leagueForGame, leagueStandings, myLeagueTeams, settingsOf, teamById, type LeagueRow } from "./leagues";

export type JoinChoice =
  | { kind: "name"; name: string }
  | { kind: "self" }
  | { kind: "crew"; communityId: string }
  | { kind: "league"; teamId: string }
  | { kind: "enter"; communityId: string }
  | { kind: "new_league"; name: string };

export interface JoinOptions {
  signedIn: boolean;
  me: { name: string } | null;
  /** Your crews, and whether each is already playing tonight. */
  crews: { communityId: string; name: string; playing: boolean }[];
  league: {
    title: string;
    slug: string;
    week: number;
    weeks: number;
    teams: { id: string; name: string; rank: number; points: number; playing: boolean }[];
    enter: { communityId: string; name: string }[];
  } | null;
}

type Joined = { ok: true; teamId: string; secret: string; name: string } | { ok: false; error: string };

async function roomTeams(gameId: string): Promise<TeamRow[]> {
  const { data } = await createServiceClient().from("trivia_teams").select(TEAM_COLS).eq("game_id", gameId).not("secret", "like", "v1.%").limit(MAX_TEAMS + 5);
  return (data ?? []) as TeamRow[];
}

/** What a signed-in phone may pick at the door. */
export async function joinOptions(code: string, userId: string | null): Promise<JoinOptions | null> {
  const game = await gameByCode(code);
  if (!game || game.status === "cancelled" || game.status === "draft") return null;
  if (!userId) return { signedIn: false, me: null, crews: [], league: null };
  const [teams, crews, me, league] = await Promise.all([roomTeams(game.id), myCrews(userId), playerName(userId), leagueForGame(game)]);
  const playingCommunities = new Set(teams.map((t) => t.community_id).filter(Boolean));
  const out: JoinOptions = {
    signedIn: true,
    me: { name: me },
    crews: crews.map((c) => ({ communityId: c.communityId, name: c.name, playing: playingCommunities.has(c.communityId) })),
    league: null,
  };
  if (league && league.status === "active") {
    const [mine, table] = await Promise.all([myLeagueTeams(league.id, userId), leagueStandings(league)]);
    const playingTeams = new Set(teams.map((t) => t.league_team_id).filter(Boolean));
    const inLeague = new Set(mine.map((t) => t.community_id).filter(Boolean));
    const { data: all } = await createServiceClient().from("trivia_league_teams").select("community_id").eq("league_id", league.id);
    const taken = new Set(((all ?? []) as { community_id: string | null }[]).map((t) => t.community_id).filter(Boolean));
    out.league = {
      title: league.title,
      slug: league.slug,
      week: game.league_week ?? 1,
      weeks: settingsOf(league).weeks,
      teams: mine.map((t) => {
        const s = table.find((r) => r.teamId === t.id);
        return { id: t.id, name: t.name, rank: s?.rank ?? 0, points: s?.points ?? 0, playing: playingTeams.has(t.id) };
      }),
      enter: crews.filter((c) => c.canEnter && !taken.has(c.communityId) && !inLeague.has(c.communityId)).map((c) => ({ communityId: c.communityId, name: c.name })),
    };
  }
  return out;
}

/** A new team row, or the existing one when a twin beat us to it (the one-per-crew indexes). */
async function insertTeam(game: GameRow, row: { name: string; community_id?: string | null; league_team_id?: string | null; user_id?: string | null }, existing: () => Promise<TeamRow | null>): Promise<Joined> {
  const svc = createServiceClient();
  const teams = await roomTeams(game.id);
  if (teams.length >= MAX_TEAMS) return { ok: false, error: "full" };
  let name = row.name;
  if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) name = `${name.slice(0, 33)} (team)`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const secret = randomBytes(18).toString("base64url");
    const { data, error } = await svc.from("trivia_teams").insert({ game_id: game.id, ...row, name, secret }).select("id, name").single();
    if (!error && data) return { ok: true, teamId: (data as { id: string }).id, secret, name: (data as { name: string }).name };
    if (error?.code !== "23505") return { ok: false, error: "failed" };
    const twin = await existing();
    if (twin) return { ok: true, teamId: twin.id, secret: twin.secret, name: twin.name };
    name = `${row.name.slice(0, 30)} ${attempt + 2}`;
  }
  return { ok: false, error: "name_taken" };
}

async function teamWhere(gameId: string, column: "community_id" | "league_team_id" | "user_id", value: string): Promise<TeamRow | null> {
  const { data } = await createServiceClient().from("trivia_teams").select(TEAM_COLS).eq("game_id", gameId).eq(column, value).limit(1).maybeSingle();
  return (data as TeamRow | null) ?? null;
}

async function playLeagueTeam(game: GameRow, teamId: string): Promise<Joined> {
  const team = await teamById(teamId);
  if (!team || team.league_id !== game.league_id) return { ok: false, error: "not_found" };
  const here = await teamWhere(game.id, "league_team_id", team.id);
  if (here) return { ok: true, teamId: here.id, secret: here.secret, name: here.name };
  return insertTeam(game, { name: team.name, league_team_id: team.id, community_id: team.community_id }, () => teamWhere(game.id, "league_team_id", team.id));
}

/** Join tonight's room the way the phone picked. */
export async function joinAs(code: string, userId: string | null, choice: JoinChoice): Promise<Joined> {
  if (choice.kind === "name") return joinTeam(code, choice.name);
  if (!userId) return { ok: false, error: "sign_in" };
  const game = await gameByCode(code);
  if (!game || game.status === "cancelled") return { ok: false, error: "not_found" };
  if (game.status === "done") return { ok: false, error: "finished" };
  if (game.status !== "live") return { ok: false, error: "not_found" };

  if (choice.kind === "self") {
    const mine = await teamWhere(game.id, "user_id", userId);
    if (mine) return { ok: true, teamId: mine.id, secret: mine.secret, name: mine.name };
    const name = await playerName(userId);
    if (isBlockedText(name)) return { ok: false, error: "blocked" };
    return insertTeam(game, { name, user_id: userId }, () => teamWhere(game.id, "user_id", userId));
  }

  if (choice.kind === "crew") {
    const crew = (await myCrews(userId)).find((c) => c.communityId === choice.communityId);
    if (!crew) return { ok: false, error: "not_your_crew" };
    // On a league night, a crew that's in the league plays as its league team.
    if (game.league_id) {
      const { data: lt } = await createServiceClient().from("trivia_league_teams").select("id").eq("league_id", game.league_id).eq("community_id", crew.communityId).maybeSingle();
      if (lt) return playLeagueTeam(game, (lt as { id: string }).id);
    }
    const here = await teamWhere(game.id, "community_id", crew.communityId);
    if (here) return { ok: true, teamId: here.id, secret: here.secret, name: here.name };
    return insertTeam(game, { name: crew.name.replace(/^@/, "").slice(0, 40), community_id: crew.communityId }, () => teamWhere(game.id, "community_id", crew.communityId));
  }

  const league: LeagueRow | null = await leagueForGame(game);
  if (!league) return { ok: false, error: "not_league" };

  if (choice.kind === "league") {
    const mine = await myLeagueTeams(league.id, userId);
    if (!mine.some((t) => t.id === choice.teamId)) return { ok: false, error: "not_your_team" };
    return playLeagueTeam(game, choice.teamId);
  }

  const entered = await enterTeam(league, userId, choice.kind === "enter" ? { communityId: choice.communityId } : { name: choice.name });
  if (!entered.ok) return entered;
  return playLeagueTeam(game, entered.team.id);
}

/**
 * Tonight's team link for a captain or crew member (the league page's team
 * card): starts the team in tonight's room if it isn't there yet.
 */
export async function tonightLink(league: LeagueRow, userId: string, teamId: string): Promise<{ ok: true; link: string; code: string } | { ok: false; error: string }> {
  const mine = await myLeagueTeams(league.id, userId);
  if (!mine.some((t) => t.id === teamId)) return { ok: false, error: "not_your_team" };
  const { data } = await createServiceClient().from("trivia_games").select("code").eq("league_id", league.id).eq("status", "live").maybeSingle();
  const code = (data as { code: string } | null)?.code;
  if (!code) return { ok: false, error: "no_night" };
  const game = await gameByCode(code);
  if (!game) return { ok: false, error: "no_night" };
  const r = await playLeagueTeam(game, teamId);
  if (!r.ok) return r;
  return { ok: true, code, link: `/trivia/play/${code}?team=${encodeURIComponent(r.teamId)}&key=${encodeURIComponent(r.secret)}` };
}
