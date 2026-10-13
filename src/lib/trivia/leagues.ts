import "server-only";

/**
 * Trivia leagues (phase 3, mockups + picks https://claude.ai/artifact/9S5kJoWxcTHjLG4373J7iJ
 * and https://claude.ai/artifact/3HUeqLVqr4WV95AR16Ywsp; tables from
 * supabase/trivia-leagues-m1.sql, service role only).
 *
 * A league is a season of weekly trivia nights. The schedule and the venue are
 * a game night series, so every week is a real public game night page. Each
 * week's night is a normal trivia night that knows its league and week; when
 * it finishes, its places become league points (rules in leagueRules.ts).
 * Teams that come back are league teams: a crew (community) with a captain who
 * has an account. Standings are worked out from the results, never stored.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { createSeries, materializeSeries, type NightSeries } from "@/lib/game-nights/series";
import { createGroupCommunity, isCommunitySlugAvailable } from "@/lib/communities/membership";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";
import { organizerHasPaidFeatures } from "@/lib/tournaments/circuit-resolve";
import { isBlockedText } from "@/lib/text/filter";
import { SITE_URL } from "@/lib/seo";
import { TEMPLATES } from "./rules";
import { createGame, fillFromPack, GAME_COLS, type GameRow } from "./store";
import { myCrews, playerName } from "./crews";
import {
  MAX_LEAGUE_TEAMS,
  champion,
  cleanSettings,
  leagueSlug,
  nextWeek,
  nightResults,
  standings,
  type LeagueSettings,
  type ResultRow,
  type StandingRow,
} from "./leagueRules";

const notReady = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "42703";

export interface LeagueRow {
  id: string; owner_user_id: string; slug: string; title: string; series_id: string | null;
  settings: Partial<LeagueSettings> & { description?: string | null };
  status: "active" | "finished" | "archived"; champion_team_id: string | null; created_at: string; updated_at: string;
}
export interface LeagueTeamRow { id: string; league_id: string; community_id: string | null; name: string; captain_user_id: string | null; created_at: string }
interface ResultDbRow { league_id: string; game_id: string; team_id: string; week: number; place: number; score: number; points: number }

const LEAGUE_COLS = "id, owner_user_id, slug, title, series_id, settings, status, champion_team_id, created_at, updated_at";
const TEAM_COLS = "id, league_id, community_id, name, captain_user_id, created_at";

export const leagueUrl = (slug: string) => `/trivia/leagues/${slug}`;
export const settingsOf = (l: LeagueRow) => cleanSettings(l.settings);

/** False until supabase/trivia-leagues-m1.sql has run, so the league screens stay hidden. */
export async function leaguesReady(): Promise<boolean> {
  const { error } = await createServiceClient().from("trivia_leagues").select("id").limit(1);
  return !notReady(error);
}

export async function getLeague(id: string): Promise<LeagueRow | null> {
  const { data } = await createServiceClient().from("trivia_leagues").select(LEAGUE_COLS).eq("id", id).maybeSingle();
  return (data as LeagueRow | null) ?? null;
}

export async function leagueBySlug(slug: string): Promise<LeagueRow | null> {
  const { data } = await createServiceClient().from("trivia_leagues").select(LEAGUE_COLS).eq("slug", slug.toLowerCase()).maybeSingle();
  return (data as LeagueRow | null) ?? null;
}

export async function listMyLeagues(ownerId: string): Promise<LeagueRow[]> {
  const { data } = await createServiceClient().from("trivia_leagues").select(LEAGUE_COLS).eq("owner_user_id", ownerId).neq("status", "archived").order("created_at", { ascending: false }).limit(50);
  return (data ?? []) as LeagueRow[];
}

/** Public leagues for the sitemap. */
export async function listPublicLeagues(): Promise<{ slug: string; updated_at: string }[]> {
  const { data, error } = await createServiceClient().from("trivia_leagues").select("slug, updated_at").neq("status", "archived").limit(1000);
  return error ? [] : ((data ?? []) as { slug: string; updated_at: string }[]);
}

async function teamsOf(leagueId: string): Promise<LeagueTeamRow[]> {
  const { data } = await createServiceClient().from("trivia_league_teams").select(TEAM_COLS).eq("league_id", leagueId).order("created_at").limit(MAX_LEAGUE_TEAMS * 2);
  return (data ?? []) as LeagueTeamRow[];
}

async function resultsOf(leagueId: string): Promise<ResultDbRow[]> {
  const { data } = await createServiceClient().from("trivia_league_results").select("league_id, game_id, team_id, week, place, score, points").eq("league_id", leagueId).limit(5000);
  return (data ?? []) as ResultDbRow[];
}

async function gamesOf(leagueId: string): Promise<GameRow[]> {
  const { data } = await createServiceClient().from("trivia_games").select(GAME_COLS).eq("league_id", leagueId).neq("status", "cancelled").order("league_week").limit(100);
  return (data ?? []) as GameRow[];
}

const toResult = (r: ResultDbRow): ResultRow => ({ teamId: r.team_id, week: r.week, place: r.place, score: r.score, points: r.points });

export async function leagueStandings(league: LeagueRow, teams?: LeagueTeamRow[], results?: ResultDbRow[]): Promise<StandingRow[]> {
  const t = teams ?? (await teamsOf(league.id));
  const r = results ?? (await resultsOf(league.id));
  return standings(t.map((x) => x.id), r.map(toResult), settingsOf(league).bestOf, new Map(t.map((x) => [x.id, x.name])));
}

// ─── creating a league ───────────────────────────────────────────────────────

export interface CreateLeagueInput {
  title: string;
  description?: string | null;
  online: boolean;
  place?: string | null;
  /** The first night, as an ISO instant. */
  firstAt: string;
  timezone?: string | null;
  weeks: number;
  teamSize: number;
  scoring: "place" | "total";
  bestOf?: number;
  template?: string;
}

async function freeSlug(title: string): Promise<string> {
  const base = leagueSlug(title);
  const svc = createServiceClient();
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 58)}-${i + 1}`;
    const { data } = await svc.from("trivia_leagues").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`;
}

/**
 * Leagues are part of GS Circuit once billing is on (free while it's in
 * preview; staff and the launch grace count). Players never see the check.
 */
export async function canStartLeague(userId: string): Promise<boolean> {
  return organizerHasPaidFeatures(createServiceClient(), userId);
}

/** Start a league: the weekly game night series, then the league. Runs as the signed-in host (createSeries uses their session). */
export async function createLeague(ownerId: string, input: CreateLeagueInput): Promise<{ ok: true; league: LeagueRow } | { ok: false; error: string }> {
  const title = input.title.trim().replace(/\s+/g, " ").slice(0, 80);
  if (title.length < 2) return { ok: false, error: "bad_title" };
  if (isBlockedText(title) || (input.description && isBlockedText(input.description))) return { ok: false, error: "blocked" };
  const first = new Date(input.firstAt);
  if (Number.isNaN(first.getTime()) || first.getTime() < Date.now() - 6 * 3600_000) return { ok: false, error: "bad_date" };
  const place = input.online ? null : (input.place ?? "").trim().slice(0, 200) || null;
  if (!input.online && !place) return { ok: false, error: "place_required" };
  if (!(await canStartLeague(ownerId))) return { ok: false, error: "circuit_required" };

  const template = TEMPLATES.some((t) => t.id === input.template) ? input.template! : "bar";
  const settings = cleanSettings({ weeks: input.weeks, teamSize: input.teamSize, scoring: input.scoring, bestOf: input.bestOf, template, online: input.online });
  const description = (input.description ?? "").trim().slice(0, 600) || null;

  const series = await createSeries({
    name: title,
    cadence: "weekly",
    anchor_at: first.toISOString(),
    timezone: input.timezone ?? null,
    data: {
      title,
      description: description ?? `A weekly trivia league on GameShuffle: ${settings.weeks} weeks, teams of up to ${settings.teamSize}.`,
      place: place ?? "Online",
      visibility: "public",
      locationType: input.online ? "online" : "in_person",
    },
  });
  if ("error" in series) return { ok: false, error: "series_failed" };

  const { data, error } = await createServiceClient().from("trivia_leagues").insert({
    owner_user_id: ownerId, slug: await freeSlug(title), title, series_id: series.id, settings: { ...settings, description },
  }).select(LEAGUE_COLS).single();
  if (notReady(error)) return { ok: false, error: "not_ready" };
  if (error || !data) return { ok: false, error: "failed" };

  // The first night shows up straight away; the series cron keeps the next one after that.
  const { data: s } = await createServiceClient().from("board_game_night_series").select("id, host_id, name, cadence, anchor_at, timezone, data, active, created_at").eq("id", series.id).maybeSingle();
  if (s) await materializeSeries({ ...(s as NightSeries), data: (s as NightSeries).data ?? {} }).catch(() => null);
  return { ok: true, league: data as LeagueRow };
}

// ─── the season ─────────────────────────────────────────────────────────────

export interface NextNight { id: string; startsAt: string; timezone: string | null; place: string | null; online: boolean }

/** The league's next game night (or tonight's, until a few hours after it starts). */
export async function nextNight(league: LeagueRow): Promise<NextNight | null> {
  if (!league.series_id || league.status !== "active") return null;
  const { data } = await createServiceClient().from("board_game_nights")
    .select("id, starts_at, timezone, place, location_type, status")
    .eq("series_id", league.series_id).neq("status", "cancelled")
    .gte("starts_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("starts_at", { ascending: true }).limit(1).maybeSingle();
  const n = data as { id: string; starts_at: string; timezone: string | null; place: string | null; location_type: string | null } | null;
  return n ? { id: n.id, startsAt: n.starts_at, timezone: n.timezone, place: n.place, online: n.location_type === "online" } : null;
}

/** The week's night that's being built or played, if any. */
export function openGame(games: GameRow[]): GameRow | null {
  return games.find((g) => g.status === "live") ?? games.find((g) => g.status === "draft") ?? null;
}

/**
 * Start this week's night: a normal trivia night from the league's template,
 * named for the week, linked to that week's game night page and filled from
 * the question pack. A night already being built or played is returned instead.
 */
export async function startLeagueNight(ownerId: string, leagueId: string): Promise<{ ok: true; gameId: string; week: number } | { ok: false; error: string }> {
  const league = await getLeague(leagueId);
  if (!league || league.owner_user_id !== ownerId) return { ok: false, error: "not_found" };
  if (league.status !== "active") return { ok: false, error: "season_over" };
  const games = await gamesOf(league.id);
  const open = openGame(games);
  if (open) return { ok: true, gameId: open.id, week: open.league_week ?? 1 };
  const s = settingsOf(league);
  const week = nextWeek(games.filter((g) => g.status === "done").map((g) => g.league_week ?? 0), s.weeks);
  if (!week) return { ok: false, error: "season_over" };
  const made = await createGame(ownerId, { templateId: s.template, title: `${league.title} · Week ${week}` });
  if (!made.ok) return made;
  const night = await nextNight(league);
  await createServiceClient().from("trivia_games").update({ league_id: league.id, league_week: week, event_id: night?.id ?? null }).eq("id", made.game.id);
  await fillFromPack(ownerId, made.game.id).catch(() => null);
  return { ok: true, gameId: made.game.id, week };
}

/**
 * A league night finished: its league teams' places become league points
 * (other teams played just tonight). The last week names the champion,
 * stops the series and tells Discord. Safe to run twice (results upsert).
 */
export async function recordLeagueNight(gameId: string): Promise<{ recorded: number; champion: string | null } | null> {
  const svc = createServiceClient();
  const { data: g } = await svc.from("trivia_games").select(GAME_COLS).eq("id", gameId).maybeSingle();
  const game = g as GameRow | null;
  if (!game?.league_id || game.status !== "done" || !game.league_week) return null;
  const league = await getLeague(game.league_id);
  if (!league || league.status === "archived") return null;
  const s = settingsOf(league);
  const { data: teamRows } = await svc.from("trivia_teams").select("league_team_id, score").eq("game_id", game.id).not("league_team_id", "is", null);
  const night = nightResults(((teamRows ?? []) as { league_team_id: string; score: number }[]).map((t) => ({ teamId: t.league_team_id, score: t.score })), s.scoring);
  if (night.length) {
    await svc.from("trivia_league_results").upsert(
      night.map((r) => ({ league_id: league.id, game_id: game.id, team_id: r.teamId, week: game.league_week, place: r.place, score: r.score, points: r.points })),
      { onConflict: "game_id,team_id" },
    );
  }
  await svc.from("trivia_leagues").update({ updated_at: new Date().toISOString() }).eq("id", league.id);

  let champ: string | null = null;
  if (game.league_week >= s.weeks && league.status === "active") {
    const teams = await teamsOf(league.id);
    const table = await leagueStandings(league, teams);
    champ = champion(table);
    await svc.from("trivia_leagues").update({ status: "finished", champion_team_id: champ, updated_at: new Date().toISOString() }).eq("id", league.id).eq("status", "active");
    if (league.series_id) await svc.from("board_game_night_series").update({ active: false, updated_at: new Date().toISOString() }).eq("id", league.series_id);
    const name = teams.find((t) => t.id === champ)?.name;
    await postAnnouncementToCategory({
      ownerUserId: league.owner_user_id,
      category: "trivia",
      requireRoute: true,
      title: name ? `${name} win ${league.title}` : `${league.title} is over`,
      body: name ? `After ${s.weeks} weeks, ${name} finish top of the standings. See the final table.` : `The season ended level at the top. See the final table.`,
      url: `${SITE_URL}${leagueUrl(league.slug)}`,
    }).catch(() => null);
  }
  return { recorded: night.length, champion: champ };
}

/** Take a night's league points back out (a night that went wrong). Reopens a season it had finished. */
export async function undoLeagueNight(ownerId: string, leagueId: string, gameId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const league = await getLeague(leagueId);
  if (!league || league.owner_user_id !== ownerId) return { ok: false, error: "not_found" };
  const svc = createServiceClient();
  const { error } = await svc.from("trivia_league_results").delete().eq("league_id", league.id).eq("game_id", gameId);
  if (error) return { ok: false, error: "failed" };
  // Undoing a night means it no longer counts as played: drop it from the season too.
  await svc.from("trivia_games").update({ league_id: null, league_week: null }).eq("id", gameId).eq("league_id", league.id);
  if (league.status === "finished") {
    await svc.from("trivia_leagues").update({ status: "active", champion_team_id: null, updated_at: new Date().toISOString() }).eq("id", league.id);
    if (league.series_id) await svc.from("board_game_night_series").update({ active: true, updated_at: new Date().toISOString() }).eq("id", league.series_id);
  } else {
    await svc.from("trivia_leagues").update({ updated_at: new Date().toISOString() }).eq("id", league.id);
  }
  return { ok: true };
}

// ─── teams ──────────────────────────────────────────────────────────────────

const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ").slice(0, 40);

/** A free group slug for a new crew made from a team name. */
async function crewSlug(name: string): Promise<string | null> {
  const base = leagueSlug(name).replace(/-/g, "").slice(0, 20) || "trivia";
  for (let i = 0; i < 12; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 18)}${i + 1}`;
    if (slug.length < 3) continue;
    const check = await isCommunitySlugAvailable(slug).catch(() => ({ available: false }));
    if (check.available) return slug;
  }
  return null;
}

/**
 * Make a crew for a brand-new league team (picked 2026-10-13: a new team
 * becomes a crew right away, so its roster and record carry over). A group
 * community named for the team, with a Trivia crew and its maker as captain.
 * Null when it can't (the maker already owns five groups, or no free handle):
 * the team then stays league-only.
 */
async function makeCrew(userId: string, name: string): Promise<string | null> {
  const slug = await crewSlug(name);
  if (!slug) return null;
  const made = await createGroupCommunity(userId, { name, slug, subtype: "friends" });
  if (!made.ok) return null;
  const svc = createServiceClient();
  const { data } = await svc.from("gs_communities").select("id").eq("slug", made.slug ?? slug).maybeSingle();
  const id = (data as { id: string } | null)?.id ?? null;
  if (id) await svc.from("community_crew_members").insert({ community_id: id, game: "Trivia", user_id: userId, tier: "captain" }).then(undefined, () => {});
  return id;
}

export type EnterChoice = { communityId: string } | { name: string };

/**
 * Enter a team in the league (from the league page ahead of time, or at the
 * door). A crew: its captains and the community's owner or mods (picked
 * 2026-10-13). A new name: becomes a crew with you as captain when it can.
 */
export async function enterTeam(league: LeagueRow, userId: string, choice: EnterChoice): Promise<{ ok: true; team: LeagueTeamRow; crewMade?: boolean } | { ok: false; error: string }> {
  if (league.status !== "active") return { ok: false, error: "season_over" };
  const svc = createServiceClient();
  const existing = await teamsOf(league.id);
  if (existing.length >= MAX_LEAGUE_TEAMS) return { ok: false, error: "league_full" };

  if ("communityId" in choice) {
    const crew = (await myCrews(userId)).find((c) => c.communityId === choice.communityId);
    if (!crew) return { ok: false, error: "not_your_crew" };
    if (!crew.canEnter) return { ok: false, error: "captains_only" };
    const already = existing.find((t) => t.community_id === crew.communityId);
    if (already) return { ok: true, team: already };
    let name = cleanName(crew.name.replace(/^@/, ""));
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) name = cleanName(`${name} (crew)`);
    const { data, error } = await svc.from("trivia_league_teams").insert({ league_id: league.id, community_id: crew.communityId, name, captain_user_id: userId }).select(TEAM_COLS).single();
    if (error?.code === "23505") return { ok: false, error: "name_taken" };
    if (error || !data) return { ok: false, error: "failed" };
    return { ok: true, team: data as LeagueTeamRow };
  }

  const name = cleanName(choice.name);
  if (name.length < 2) return { ok: false, error: "bad_name" };
  if (isBlockedText(name)) return { ok: false, error: "blocked" };
  if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "name_taken" };
  const communityId = await makeCrew(userId, name);
  const { data, error } = await svc.from("trivia_league_teams").insert({ league_id: league.id, community_id: communityId, name, captain_user_id: userId }).select(TEAM_COLS).single();
  if (error?.code === "23505") return { ok: false, error: "name_taken" };
  if (error || !data) return { ok: false, error: "failed" };
  return { ok: true, team: data as LeagueTeamRow, crewMade: !!communityId };
}

/** The league teams a player can play for: ones they captain, or whose crew they're in. */
export async function myLeagueTeams(leagueId: string, userId: string): Promise<LeagueTeamRow[]> {
  const [teams, crews] = await Promise.all([teamsOf(leagueId), myCrews(userId)]);
  const mine = new Set(crews.map((c) => c.communityId));
  return teams.filter((t) => t.captain_user_id === userId || (t.community_id && mine.has(t.community_id)));
}

export async function teamById(teamId: string): Promise<LeagueTeamRow | null> {
  const { data } = await createServiceClient().from("trivia_league_teams").select(TEAM_COLS).eq("id", teamId).maybeSingle();
  return (data as LeagueTeamRow | null) ?? null;
}

/** A captain leaving before their team has played. After that, the host removes it. */
export async function leaveLeague(userId: string, teamId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await teamById(teamId);
  if (!team || team.captain_user_id !== userId) return { ok: false, error: "not_found" };
  const svc = createServiceClient();
  const { count } = await svc.from("trivia_league_results").select("game_id", { count: "exact", head: true }).eq("team_id", team.id);
  if ((count ?? 0) > 0) return { ok: false, error: "has_played" };
  const { error } = await svc.from("trivia_league_teams").delete().eq("id", team.id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

// ─── the host's team controls ───────────────────────────────────────────────

async function ownedLeague(ownerId: string, leagueId: string): Promise<LeagueRow | null> {
  const league = await getLeague(leagueId);
  return league && league.owner_user_id === ownerId ? league : null;
}

export async function renameTeam(ownerId: string, leagueId: string, teamId: string, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await ownedLeague(ownerId, leagueId))) return { ok: false, error: "not_found" };
  const name = cleanName(raw);
  if (name.length < 2) return { ok: false, error: "bad_name" };
  if (isBlockedText(name)) return { ok: false, error: "blocked" };
  const { error } = await createServiceClient().from("trivia_league_teams").update({ name }).eq("id", teamId).eq("league_id", leagueId);
  if (error?.code === "23505") return { ok: false, error: "name_taken" };
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/**
 * Merge a duplicate into the right team: its nights move over; when both
 * played the same night, the better result stays. The duplicate is removed.
 */
export async function mergeTeams(ownerId: string, leagueId: string, fromId: string, intoId: string): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  if (fromId === intoId) return { ok: false, error: "same_team" };
  if (!(await ownedLeague(ownerId, leagueId))) return { ok: false, error: "not_found" };
  const svc = createServiceClient();
  const [from, into] = await Promise.all([teamById(fromId), teamById(intoId)]);
  if (!from || !into || from.league_id !== leagueId || into.league_id !== leagueId) return { ok: false, error: "not_found" };
  const results = await resultsOf(leagueId);
  const intoGames = new Map(results.filter((r) => r.team_id === intoId).map((r) => [r.game_id, r]));
  let moved = 0;
  for (const r of results.filter((x) => x.team_id === fromId)) {
    const clash = intoGames.get(r.game_id);
    if (!clash) {
      await svc.from("trivia_league_results").update({ team_id: intoId }).eq("game_id", r.game_id).eq("team_id", fromId);
      moved += 1;
    } else if (r.points > clash.points || (r.points === clash.points && r.score > clash.score)) {
      await svc.from("trivia_league_results").update({ place: r.place, score: r.score, points: r.points }).eq("game_id", r.game_id).eq("team_id", intoId);
      moved += 1;
    }
  }
  await svc.from("trivia_teams").update({ league_team_id: intoId }).eq("league_team_id", fromId).then(undefined, () => {});
  if (!into.community_id && from.community_id) await svc.from("trivia_league_teams").update({ community_id: from.community_id }).eq("id", intoId).then(undefined, () => {});
  const { error } = await svc.from("trivia_league_teams").delete().eq("id", fromId);
  return error ? { ok: false, error: "failed" } : { ok: true, moved };
}

export async function removeTeam(ownerId: string, leagueId: string, teamId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await ownedLeague(ownerId, leagueId))) return { ok: false, error: "not_found" };
  const { error } = await createServiceClient().from("trivia_league_teams").delete().eq("id", teamId).eq("league_id", leagueId);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/** Hand a team to another captain: one of its crew's members with an account. */
export async function setCaptain(ownerId: string, leagueId: string, teamId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await ownedLeague(ownerId, leagueId))) return { ok: false, error: "not_found" };
  const team = await teamById(teamId);
  if (!team || team.league_id !== leagueId || !team.community_id) return { ok: false, error: "not_found" };
  const { data } = await createServiceClient().from("community_crew_members").select("user_id").eq("community_id", team.community_id).eq("user_id", userId).limit(1);
  if (!data?.length) return { ok: false, error: "not_in_crew" };
  const { error } = await createServiceClient().from("trivia_league_teams").update({ captain_user_id: userId }).eq("id", team.id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

/** Change how the season scores. Weeks can't drop below the weeks already played. */
export async function updateLeague(ownerId: string, leagueId: string, patch: Partial<LeagueSettings> & { title?: string; description?: string | null }): Promise<{ ok: true; league: LeagueRow } | { ok: false; error: string }> {
  const league = await ownedLeague(ownerId, leagueId);
  if (!league) return { ok: false, error: "not_found" };
  const played = (await gamesOf(league.id)).filter((g) => g.status === "done").map((g) => g.league_week ?? 0);
  const top = played.length ? Math.max(...played) : 0;
  const current = settingsOf(league);
  const next = cleanSettings({ ...current, ...patch, online: current.online });
  if (next.weeks < top) return { ok: false, error: "weeks_played" };
  const title = patch.title !== undefined ? cleanName(patch.title.slice(0, 80)) : league.title;
  if (title.length < 2) return { ok: false, error: "bad_title" };
  if (isBlockedText(title) || (patch.description && isBlockedText(patch.description))) return { ok: false, error: "blocked" };
  const description = patch.description !== undefined ? (patch.description ?? "").trim().slice(0, 600) || null : league.settings.description ?? null;
  const { data, error } = await createServiceClient().from("trivia_leagues")
    .update({ title, settings: { ...next, description }, updated_at: new Date().toISOString() })
    .eq("id", league.id).select(LEAGUE_COLS).single();
  return error || !data ? { ok: false, error: "failed" } : { ok: true, league: data as LeagueRow };
}

export async function archiveLeague(ownerId: string, leagueId: string, archived: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const league = await ownedLeague(ownerId, leagueId);
  if (!league) return { ok: false, error: "not_found" };
  const svc = createServiceClient();
  const status = archived ? "archived" : league.champion_team_id || league.status === "finished" ? "finished" : "active";
  await svc.from("trivia_leagues").update({ status, updated_at: new Date().toISOString() }).eq("id", league.id);
  if (league.series_id) await svc.from("board_game_night_series").update({ active: status === "active", updated_at: new Date().toISOString() }).eq("id", league.series_id);
  return { ok: true };
}

// ─── views ──────────────────────────────────────────────────────────────────

export interface LeagueTeamView {
  id: string;
  name: string;
  rank: number;
  points: number;
  nights: number;
  wins: number;
  previousRank: number | null;
  /** Place each week played: { week, place }. */
  weeks: { week: number; place: number }[];
  crew: { slug: string; name: string } | null;
  captain: string | null;
}

export interface PastNight { gameId: string; week: number; date: string | null; teams: number; winner: string | null; recorded: boolean }

export interface LeagueView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: LeagueRow["status"];
  settings: LeagueSettings;
  owner: { id: string; name: string };
  teams: LeagueTeamView[];
  champion: string | null;
  weeksPlayed: number;
  next: NextNight | null;
  /** Tonight's room while it's open. */
  live: { code: string; week: number } | null;
  past: PastNight[];
}

/** Everything the league page shows. */
export async function leagueView(league: LeagueRow): Promise<LeagueView> {
  const svc = createServiceClient();
  const [teams, results, games, next] = await Promise.all([teamsOf(league.id), resultsOf(league.id), gamesOf(league.id), nextNight(league)]);
  const table = await leagueStandings(league, teams, results);
  const communityIds = [...new Set(teams.map((t) => t.community_id).filter((x): x is string => !!x))];
  const people = [...new Set([league.owner_user_id, ...teams.map((t) => t.captain_user_id).filter((x): x is string => !!x)])];
  const [{ data: comms }, { data: users }] = await Promise.all([
    communityIds.length ? svc.from("gs_communities").select("id, slug, display_name").in("id", communityIds) : Promise.resolve({ data: [] }),
    svc.from("users").select("id, display_name, username").in("id", people),
  ]);
  const commBy = new Map(((comms ?? []) as { id: string; slug: string; display_name: string | null }[]).map((c) => [c.id, { slug: c.slug, name: c.display_name || `@${c.slug}` }]));
  const nameBy = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u.display_name || u.username || "Player"]));
  const teamBy = new Map(teams.map((t) => [t.id, t]));

  const rows: LeagueTeamView[] = table.map((s) => {
    const t = teamBy.get(s.teamId)!;
    return {
      id: t.id,
      name: t.name,
      rank: s.rank,
      points: s.points,
      nights: s.nights,
      wins: s.wins,
      previousRank: s.previousRank,
      weeks: results.filter((r) => r.team_id === t.id).map((r) => ({ week: r.week, place: r.place })).sort((a, b) => a.week - b.week),
      crew: t.community_id ? commBy.get(t.community_id) ?? null : null,
      captain: t.captain_user_id ? nameBy.get(t.captain_user_id) ?? null : null,
    };
  });

  const done = games.filter((g) => g.status === "done" && g.league_week);
  const past: PastNight[] = await Promise.all(done.map(async (g) => {
    const mine = results.filter((r) => r.game_id === g.id);
    const { count } = await svc.from("trivia_teams").select("id", { count: "exact", head: true }).eq("game_id", g.id).not("secret", "like", "v1.%");
    const top = mine.filter((r) => r.place === 1).map((r) => teamBy.get(r.team_id)?.name).filter(Boolean) as string[];
    return { gameId: g.id, week: g.league_week ?? 0, date: g.finished_at, teams: count ?? mine.length, winner: top.length ? top.join(" and ") : null, recorded: mine.length > 0 };
  }));
  const live = games.find((g) => g.status === "live");

  return {
    id: league.id,
    slug: league.slug,
    title: league.title,
    description: league.settings.description ?? null,
    status: league.status,
    settings: settingsOf(league),
    owner: { id: league.owner_user_id, name: nameBy.get(league.owner_user_id) ?? "The host" },
    teams: rows,
    champion: league.champion_team_id ? teamBy.get(league.champion_team_id)?.name ?? null : null,
    weeksPlayed: done.length ? Math.max(...done.map((g) => g.league_week ?? 0)) : 0,
    next,
    live: live ? { code: live.code, week: live.league_week ?? 1 } : null,
    past: past.sort((a, b) => b.week - a.week),
  };
}

export interface CaptainCard {
  teamId: string;
  isCaptain: boolean;
  canLeave: boolean;
  roster: { name: string; captain: boolean }[];
  /** Tonight's team link, once the team has a phone in tonight's room. */
  link: string | null;
}

/** What a signed-in viewer can do on the league page: their teams, and crews they could enter. */
export async function viewerOnLeague(league: LeagueRow, view: LeagueView, userId: string): Promise<{ cards: CaptainCard[]; canEnter: { communityId: string; name: string }[]; isOwner: boolean }> {
  const svc = createServiceClient();
  const [mine, crews] = await Promise.all([myLeagueTeams(league.id, userId), myCrews(userId)]);
  const live = view.live ? (await svc.from("trivia_games").select("id, code").eq("league_id", league.id).eq("status", "live").maybeSingle()).data as { id: string; code: string } | null : null;
  const cards: CaptainCard[] = await Promise.all(mine.map(async (t) => {
    let roster: { name: string; captain: boolean }[] = [];
    if (t.community_id) {
      const { data } = await svc.from("community_crew_members").select("user_id, tier").eq("community_id", t.community_id).limit(60);
      const rows = (data ?? []) as { user_id: string; tier: string }[];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: us } = ids.length ? await svc.from("users").select("id, display_name, username").in("id", ids) : { data: [] };
      const nameBy = new Map(((us ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u.display_name || u.username || "Player"]));
      const best = new Map<string, boolean>();
      for (const r of rows) best.set(r.user_id, (best.get(r.user_id) ?? false) || r.tier === "captain" || r.user_id === t.captain_user_id);
      roster = [...best.entries()].map(([id, captain]) => ({ name: nameBy.get(id) ?? "Player", captain })).sort((a, b) => Number(b.captain) - Number(a.captain) || a.name.localeCompare(b.name));
    } else if (t.captain_user_id) {
      roster = [{ name: await playerName(t.captain_user_id), captain: true }];
    }
    let link: string | null = null;
    if (live) {
      const { data: gt } = await svc.from("trivia_teams").select("id, secret").eq("game_id", live.id).eq("league_team_id", t.id).maybeSingle();
      const row = gt as { id: string; secret: string } | null;
      if (row) link = `${SITE_URL}/trivia/play/${live.code}?team=${encodeURIComponent(row.id)}&key=${encodeURIComponent(row.secret)}`;
    }
    const played = view.teams.find((x) => x.id === t.id)?.nights ?? 0;
    return { teamId: t.id, isCaptain: t.captain_user_id === userId, canLeave: t.captain_user_id === userId && played === 0, roster, link };
  }));
  const teamCommunities = new Set((await teamsOf(league.id)).map((t) => t.community_id).filter(Boolean));
  return {
    cards,
    canEnter: crews.filter((c) => c.canEnter && !teamCommunities.has(c.communityId)).map((c) => ({ communityId: c.communityId, name: c.name })),
    isOwner: league.owner_user_id === userId,
  };
}

export interface ManageNight { week: number; gameId: string | null; status: GameRow["status"] | "not_started"; teams: number; winner: string | null; recorded: boolean; date: string | null; code: string | null }

export interface ManageView extends LeagueView {
  nights: ManageNight[];
  manageTeams: { id: string; name: string; captain: string | null; captainId: string | null; crew: { slug: string; name: string } | null; nights: number; points: number; members: { id: string; name: string }[] }[];
  nextWeek: number | null;
  openGameId: string | null;
}

/** The host's manage page: every week, every team. */
export async function manageView(ownerId: string, leagueId: string): Promise<ManageView | null> {
  const league = await ownedLeague(ownerId, leagueId);
  if (!league) return null;
  const svc = createServiceClient();
  const [view, games, teams] = await Promise.all([leagueView(league), gamesOf(league.id), teamsOf(league.id)]);
  const s = settingsOf(league);
  const nights: ManageNight[] = [];
  for (let w = 1; w <= s.weeks; w++) {
    const g = games.filter((x) => x.league_week === w).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const past = view.past.find((p) => p.week === w);
    nights.push(g
      ? { week: w, gameId: g.id, status: g.status, teams: past?.teams ?? 0, winner: past?.winner ?? null, recorded: past?.recorded ?? false, date: g.finished_at ?? g.started_at ?? g.created_at, code: g.status === "live" ? g.code : null }
      : { week: w, gameId: null, status: "not_started", teams: 0, winner: null, recorded: false, date: null, code: null });
  }
  const communityIds = teams.map((t) => t.community_id).filter((x): x is string => !!x);
  const { data: crewRows } = communityIds.length ? await svc.from("community_crew_members").select("community_id, user_id").in("community_id", communityIds).limit(2000) : { data: [] };
  const memberIds = [...new Set(((crewRows ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  const { data: us } = memberIds.length ? await svc.from("users").select("id, display_name, username").in("id", memberIds) : { data: [] };
  const nameBy = new Map(((us ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u.display_name || u.username || "Player"]));
  const open = openGame(games);
  return {
    ...view,
    nights,
    manageTeams: teams.map((t) => {
      const row = view.teams.find((x) => x.id === t.id);
      const members = [...new Set(((crewRows ?? []) as { community_id: string; user_id: string }[]).filter((r) => r.community_id === t.community_id).map((r) => r.user_id))]
        .map((id) => ({ id, name: nameBy.get(id) ?? "Player" }));
      return { id: t.id, name: t.name, captain: row?.captain ?? null, captainId: t.captain_user_id, crew: row?.crew ?? null, nights: row?.nights ?? 0, points: row?.points ?? 0, members };
    }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    nextWeek: nextWeek(games.filter((g) => g.status === "done").map((g) => g.league_week ?? 0), s.weeks),
    openGameId: open?.id ?? null,
  };
}

/** The league a game belongs to (for the phone's join screen and the console). */
export async function leagueForGame(game: GameRow): Promise<LeagueRow | null> {
  return game.league_id ? getLeague(game.league_id) : null;
}

export interface ConsoleLeague {
  id: string;
  slug: string;
  title: string;
  week: number;
  weeks: number;
  recorded: boolean;
  rows: { name: string; place: number; score: number; points: number; rank: number | null; previousRank: number | null }[];
  /** Teams that played just tonight (no league team). */
  tonightOnly: string[];
}

/** The league side of the host's console: tonight's league points and how the table moved. */
export async function consoleLeague(game: GameRow): Promise<ConsoleLeague | null> {
  if (!game.league_id) return null;
  const league = await getLeague(game.league_id);
  if (!league) return null;
  const svc = createServiceClient();
  const [teams, results] = await Promise.all([teamsOf(league.id), resultsOf(league.id)]);
  const tonight = results.filter((r) => r.game_id === game.id);
  const now = await leagueStandings(league, teams, results);
  const before = await leagueStandings(league, teams, results.filter((r) => r.game_id !== game.id));
  const nameBy = new Map(teams.map((t) => [t.id, t.name]));
  const { data: room } = await svc.from("trivia_teams").select("name, league_team_id").eq("game_id", game.id).not("secret", "like", "v1.%");
  return {
    id: league.id,
    slug: league.slug,
    title: league.title,
    week: game.league_week ?? 1,
    weeks: settingsOf(league).weeks,
    recorded: tonight.length > 0,
    rows: tonight.sort((a, b) => a.place - b.place).map((r) => ({
      name: nameBy.get(r.team_id) ?? "Team",
      place: r.place,
      score: r.score,
      points: r.points,
      rank: now.find((s) => s.teamId === r.team_id)?.rank ?? null,
      previousRank: before.find((s) => s.teamId === r.team_id && s.nights > 0)?.rank ?? null,
    })),
    tonightOnly: ((room ?? []) as { name: string; league_team_id: string | null }[]).filter((t) => !t.league_team_id).map((t) => t.name),
  };
}

/** The league a game night belongs to (its series), and tonight's join code while the room is open. */
export async function leagueForNight(nightId: string): Promise<{ title: string; slug: string; code: string | null } | null> {
  const svc = createServiceClient();
  const { data: n } = await svc.from("board_game_nights").select("series_id").eq("id", nightId).maybeSingle();
  const seriesId = (n as { series_id: string | null } | null)?.series_id;
  if (!seriesId) return null;
  const { data: l, error } = await svc.from("trivia_leagues").select("id, title, slug, status").eq("series_id", seriesId).neq("status", "archived").maybeSingle();
  if (error || !l) return null;
  const league = l as { id: string; title: string; slug: string };
  const { data: g } = await svc.from("trivia_games").select("code").eq("league_id", league.id).eq("event_id", nightId).eq("status", "live").maybeSingle();
  return { title: league.title, slug: league.slug, code: (g as { code: string } | null)?.code ?? null };
}
