import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { canManageCrew } from "@/lib/communities/crews";
import { reportBattle } from "@/lib/communities/battles";
import { loadCompetitiveConfig, pointsForPosition } from "./config";

/**
 * A crew battle that is actually PLAYED.
 *
 * `community_crew_battles` has always been a result record: two communities, a
 * date, and a score somebody typed in afterwards. The lounge is the live scoring
 * engine that record was missing, so binding the two turns an honor-system
 * result into one the engine reports itself.
 *
 * Side convention: `lounge_players.team` 0 = HOME community, 1 = AWAY. A crew
 * battle only ever has two sides.
 */

export const HOME_TEAM = 0;
export const AWAY_TEAM = 1;

interface BattleRow {
  id: string; game: string; status: string;
  home_community_id: string; away_community_id: string;
  lounge_session_id: string | null;
}

async function loadBattleRow(battleId: string): Promise<BattleRow | null> {
  const { data } = await createServiceClient()
    .from("community_crew_battles")
    .select("id, game, status, home_community_id, away_community_id, lounge_session_id")
    .eq("id", battleId).maybeSingle();
  return (data as BattleRow | null) ?? null;
}

/**
 * Open the live match for an accepted battle. Either side's captain can start
 * it, and starting twice returns the existing match rather than creating a
 * second one that would overwrite the first one's score.
 */
export async function startBattleLounge(args: { actorId: string; battleId: string }): Promise<{ ok: true; sessionId: string; game: string } | { ok: false; reason: string }> {
  const battle = await loadBattleRow(args.battleId);
  if (!battle) return { ok: false, reason: "not_found" };
  if (battle.status !== "accepted") return { ok: false, reason: "not_accepted" };

  const canHome = await canManageCrew(args.actorId, battle.home_community_id, battle.game);
  const canAway = canHome ? true : await canManageCrew(args.actorId, battle.away_community_id, battle.game);
  if (!canHome && !canAway) return { ok: false, reason: "forbidden" };

  if (battle.lounge_session_id) return { ok: true, sessionId: battle.lounge_session_id, game: battle.game };

  const svc = createServiceClient();
  const config = await loadCompetitiveConfig(svc as never, battle.game);
  if (!config) return { ok: false, reason: "game_not_competitive" };

  const { data, error } = await svc.from("lounge_sessions").insert({
    game_slug: battle.game,
    organizer_id: args.actorId,
    status: "waiting",
    race_count: config.defaultRaceCount,
    scoring_table: config.pointsTable,
    players: [], races: [],
    crew_battle_id: battle.id,
    settings: { mode: "crew", teams: 2, perTeam: null, crewBattleId: battle.id },
  }).select("id").single();
  if (error || !data) return { ok: false, reason: error?.message ?? "create_failed" };

  await svc.from("community_crew_battles").update({ lounge_session_id: data.id as string }).eq("id", battle.id);
  return { ok: true, sessionId: data.id as string, game: battle.game };
}

export interface BattleScore { homeScore: number; awayScore: number; winnerCommunityId: string | null }

/** Add up a bound lounge by side, using the game's own points table. */
export async function scoreBattleLounge(sessionId: string): Promise<{ ok: true; battleId: string; score: BattleScore } | { ok: false; reason: string }> {
  const svc = createServiceClient();
  const { data: session } = await svc.from("lounge_sessions").select("id, game_slug, crew_battle_id").eq("id", sessionId).maybeSingle();
  if (!session) return { ok: false, reason: "not_found" };
  const battleId = session.crew_battle_id as string | null;
  if (!battleId) return { ok: false, reason: "not_a_battle" };

  const battle = await loadBattleRow(battleId);
  if (!battle) return { ok: false, reason: "battle_not_found" };
  const config = await loadCompetitiveConfig(svc as never, session.game_slug as string);
  if (!config) return { ok: false, reason: "game_not_competitive" };

  const [{ data: players }, { data: placements }] = await Promise.all([
    svc.from("lounge_players").select("id, team").eq("session_id", sessionId),
    svc.from("lounge_placements").select("player_id, position").eq("session_id", sessionId),
  ]);
  const teamOf = new Map(((players ?? []) as { id: string; team: number | null }[]).map((p) => [p.id, p.team]));

  let homeScore = 0, awayScore = 0;
  for (const p of (placements ?? []) as { player_id: string; position: number | null }[]) {
    if (!p.position) continue;
    const pts = pointsForPosition(config, p.position);
    const team = teamOf.get(p.player_id);
    if (team === HOME_TEAM) homeScore += pts;
    else if (team === AWAY_TEAM) awayScore += pts;
  }

  const winnerCommunityId = homeScore === awayScore
    ? null
    : homeScore > awayScore ? battle.home_community_id : battle.away_community_id;
  return { ok: true, battleId, score: { homeScore, awayScore, winnerCommunityId } };
}

/**
 * Score a finished battle lounge and write the result back to the battle.
 *
 * A draw is NOT auto-reported: `community_crew_battles` requires a winner, and
 * inventing one (or defaulting to home) would silently falsify a record that
 * feeds the crew's win/loss. The organizer is told to settle it instead.
 */
export async function reportBattleFromLounge(sessionId: string, actorId: string): Promise<{ ok: boolean; reason?: string; score?: BattleScore }> {
  const scored = await scoreBattleLounge(sessionId);
  if (!scored.ok) return { ok: false, reason: scored.reason };
  const { score, battleId } = scored;
  if (!score.winnerCommunityId) return { ok: false, reason: "tie", score };

  const res = await reportBattle({
    actorId, battleId,
    winnerCommunityId: score.winnerCommunityId,
    homeScore: score.homeScore, awayScore: score.awayScore,
  });
  return res.ok ? { ok: true, score } : { ok: false, reason: res.reason, score };
}
