import "server-only";

/**
 * Crews at trivia nights (mockups + picks https://claude.ai/artifact/3HUeqLVqr4WV95AR16Ywsp):
 * a signed-in player can play a night as themselves or as one of their crews,
 * the way crews work on tournaments. A crew plays as one team a night (the
 * database holds one team per community per game), and a crew member who
 * arrives later joins that team with one tap. Anyone else still needs the
 * teammate link, so nobody can walk onto a team.
 *
 * "Your crews" = communities where you're in a crew for any game, plus groups
 * you own or moderate. Captains (and the community's owner or mods) can enter
 * a crew in a league; any crew member can play as it on a night.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getUserCrews } from "@/lib/communities/crews";
import { listOrganizableCommunities } from "@/lib/communities/membership";
import { cleanSettings, standings, type LeagueSettings } from "./leagueRules";

export interface MyCrew {
  communityId: string;
  slug: string;
  name: string;
  /** Captain of one of its crews, or the community's owner or a mod: may enter it in a league. */
  canEnter: boolean;
}

/** The crews a player can play as, captains first, then by name. */
export async function myCrews(userId: string): Promise<MyCrew[]> {
  if (!userId) return [];
  const [crews, managed] = await Promise.all([getUserCrews(userId), listOrganizableCommunities(userId)]);
  const out = new Map<string, MyCrew>();
  for (const c of crews) {
    const had = out.get(c.communityId);
    out.set(c.communityId, { communityId: c.communityId, slug: c.communitySlug, name: c.communityName, canEnter: (had?.canEnter ?? false) || c.tier === "captain" });
  }
  // Groups the player runs count even when they aren't on a crew roster themselves.
  if (managed.length) {
    const { data } = await createServiceClient().from("gs_communities").select("id, kind").in("id", managed.map((m) => m.id));
    const groups = new Set(((data ?? []) as { id: string; kind: string | null }[]).filter((c) => c.kind === "group").map((c) => c.id));
    for (const m of managed) {
      const had = out.get(m.id);
      if (had) had.canEnter = true;
      else if (groups.has(m.id)) out.set(m.id, { communityId: m.id, slug: m.slug, name: m.displayName || `@${m.slug}`, canEnter: true });
    }
  }
  return [...out.values()].sort((a, b) => Number(b.canEnter) - Number(a.canEnter) || a.name.localeCompare(b.name));
}

/** The name a player shows as when they play as themselves. */
export async function playerName(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username").eq("id", userId).maybeSingle();
  const u = data as { display_name: string | null; username: string | null } | null;
  return (u?.display_name || u?.username || "Player").trim().slice(0, 40);
}

// ─── the crew's trivia record (its community page) ──────────────────────────

export interface CrewTriviaNight {
  gameId: string;
  title: string;
  date: string;
  place: number;
  teams: number;
  leaguePoints: number | null;
}

export interface CrewTriviaRecord {
  nights: number;
  wins: number;
  bestPlace: number | null;
  lastAt: string | null;
  recent: CrewTriviaNight[];
  /** A league the crew is in, with its place. */
  league: { title: string; slug: string; rank: number | null } | null;
}

/** A place among a night's room teams (stream viewers aren't ranked against the room). */
function placeOf(score: number, scores: number[]): number {
  return 1 + scores.filter((s) => s > score).length;
}

/**
 * Nights the crew played as itself: places, wins and the latest few. Null
 * when it hasn't played one (or trivia isn't set up), so the page can skip
 * the section.
 */
export async function crewTriviaRecord(communityId: string): Promise<CrewTriviaRecord | null> {
  const svc = createServiceClient();
  const { data: mine, error } = await svc.from("trivia_teams").select("id, game_id, score, league_team_id").eq("community_id", communityId).limit(500);
  if (error || !mine?.length) return null;
  const rows = mine as { id: string; game_id: string; score: number; league_team_id: string | null }[];
  const gameIds = [...new Set(rows.map((r) => r.game_id))];
  const [{ data: games }, { data: all }] = await Promise.all([
    svc.from("trivia_games").select("id, title, status, finished_at, league_id").in("id", gameIds).eq("status", "done"),
    svc.from("trivia_teams").select("game_id, score, secret").in("game_id", gameIds).not("secret", "like", "v1.%").limit(20_000),
  ]);
  const done = new Map(((games ?? []) as { id: string; title: string; finished_at: string | null; league_id: string | null }[]).map((g) => [g.id, g]));
  if (!done.size) return null;
  const scoresBy = new Map<string, number[]>();
  for (const t of (all ?? []) as { game_id: string; score: number }[]) (scoresBy.get(t.game_id) ?? scoresBy.set(t.game_id, []).get(t.game_id)!).push(t.score);

  const teamIds = rows.filter((r) => r.league_team_id).map((r) => r.league_team_id as string);
  const { data: results } = teamIds.length
    ? await svc.from("trivia_league_results").select("game_id, points").in("team_id", [...new Set(teamIds)])
    : { data: [] as { game_id: string; points: number }[] };
  const pointsBy = new Map(((results ?? []) as { game_id: string; points: number }[]).map((r) => [r.game_id, r.points]));

  const nights: CrewTriviaNight[] = rows
    .filter((r) => done.has(r.game_id))
    .map((r) => {
      const g = done.get(r.game_id)!;
      const scores = scoresBy.get(r.game_id) ?? [r.score];
      return { gameId: r.game_id, title: g.title, date: g.finished_at ?? "", place: placeOf(r.score, scores), teams: scores.length, leaguePoints: pointsBy.get(r.game_id) ?? null };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!nights.length) return null;

  const { data: entry } = await svc.from("trivia_league_teams").select("id, league_id, trivia_leagues!trivia_league_teams_league_id_fkey(title, slug, status, settings)").eq("community_id", communityId).limit(5);
  type L = { title: string; slug: string; status: string; settings: Partial<LeagueSettings> };
  type Entry = { id: string; league_id: string; trivia_leagues: L | L[] | null };
  const live = ((entry ?? []) as unknown as Entry[])
    .map((e) => ({ teamId: e.id, id: e.league_id, l: Array.isArray(e.trivia_leagues) ? e.trivia_leagues[0] : e.trivia_leagues }))
    .find((e) => e.l && e.l.status !== "archived");
  let rank: number | null = null;
  if (live?.l) {
    const [{ data: lt }, { data: lr }] = await Promise.all([
      svc.from("trivia_league_teams").select("id").eq("league_id", live.id),
      svc.from("trivia_league_results").select("team_id, week, place, score, points").eq("league_id", live.id).limit(5000),
    ]);
    const table = standings(((lt ?? []) as { id: string }[]).map((t) => t.id), ((lr ?? []) as { team_id: string; week: number; place: number; score: number; points: number }[]).map((r) => ({ teamId: r.team_id, week: r.week, place: r.place, score: r.score, points: r.points })), cleanSettings(live.l.settings).bestOf);
    const row = table.find((r) => r.teamId === live.teamId);
    rank = row && row.nights > 0 ? row.rank : null;
  }

  return {
    nights: nights.length,
    wins: nights.filter((n) => n.place === 1).length,
    bestPlace: Math.min(...nights.map((n) => n.place)),
    lastAt: nights[0].date || null,
    recent: nights.slice(0, 5),
    league: live?.l ? { title: live.l.title, slug: live.l.slug, rank } : null,
  };
}
