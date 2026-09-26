import "server-only";

/**
 * Crew battles — cross-community 1v1 matches in a shared game. A community's game
 * crew challenges another's; the match moves proposed → accepted → completed
 * (with a result), or declined/cancelled. Read is public; writes require the
 * actor to be a captain of that game's crew or an owner/mod of the community on
 * whose behalf they act. See `supabase/crew-battles-m1.sql`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { canManageCrew } from "@/lib/communities/crews";
import { getCommunityBySlug, getCommunityById } from "@/lib/communities/membership";
import { createNotification } from "@/lib/social/notifications";

export type BattleStatus = "proposed" | "accepted" | "completed" | "declined" | "cancelled";

export interface BattleSide { communityId: string; slug: string; name: string }
export interface CrewBattle {
  id: string;
  game: string;
  home: BattleSide;
  away: BattleSide;
  status: BattleStatus;
  scheduledAt: string | null;
  winnerCommunityId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** The live lounge this battle is played in, once one has been opened. */
  loungeSessionId: string | null;
}

interface RawBattle {
  id: string; game: string; home_community_id: string; away_community_id: string;
  status: BattleStatus; scheduled_at: string | null; winner_community_id: string | null;
  home_score: number | null; away_score: number | null; lounge_session_id?: string | null;
}

async function hydrate(rows: RawBattle[]): Promise<CrewBattle[]> {
  if (rows.length === 0) return [];
  const admin = createServiceClient();
  const ids = [...new Set(rows.flatMap((r) => [r.home_community_id, r.away_community_id]))];
  const { data: comms } = await admin.from("gs_communities").select("id, slug, display_name").in("id", ids);
  const byId = new Map<string, BattleSide>();
  for (const c of (comms ?? []) as Array<{ id: string; slug: string; display_name: string | null }>) {
    byId.set(c.id, { communityId: c.id, slug: c.slug, name: c.display_name || `@${c.slug}` });
  }
  const side = (id: string): BattleSide => byId.get(id) ?? { communityId: id, slug: "", name: "Community" };
  return rows.map((r) => ({
    id: r.id,
    game: r.game,
    home: side(r.home_community_id),
    away: side(r.away_community_id),
    status: r.status,
    scheduledAt: r.scheduled_at,
    winnerCommunityId: r.winner_community_id,
    loungeSessionId: r.lounge_session_id ?? null,
    homeScore: r.home_score,
    awayScore: r.away_score,
  }));
}

/** Battles involving a community (either side), newest first. */
export async function listCommunityBattles(communityId: string): Promise<CrewBattle[]> {
  if (!communityId) return [];
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_crew_battles")
    .select("id, game, home_community_id, away_community_id, status, scheduled_at, winner_community_id, home_score, away_score, lounge_session_id")
    .or(`home_community_id.eq.${communityId},away_community_id.eq.${communityId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  return hydrate((data ?? []) as RawBattle[]);
}

/** Win/loss record per game for a community, from completed battles. */
export async function getCrewRecord(communityId: string): Promise<Record<string, { wins: number; losses: number }>> {
  if (!communityId) return {};
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_crew_battles")
    .select("game, winner_community_id")
    .eq("status", "completed")
    .or(`home_community_id.eq.${communityId},away_community_id.eq.${communityId}`);
  const rec: Record<string, { wins: number; losses: number }> = {};
  for (const r of (data ?? []) as Array<{ game: string; winner_community_id: string | null }>) {
    const g = (rec[r.game] ??= { wins: 0, losses: 0 });
    if (r.winner_community_id === communityId) g.wins += 1;
    else if (r.winner_community_id) g.losses += 1;
  }
  return rec;
}

async function loadBattle(id: string): Promise<RawBattle | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("community_crew_battles")
    .select("id, game, home_community_id, away_community_id, status, scheduled_at, winner_community_id, home_score, away_score, lounge_session_id")
    .eq("id", id)
    .maybeSingle();
  return (data as RawBattle | null) ?? null;
}

/**
 * Promotion-by-results (v1: SUGGEST). After a crew wins, nudge the community
 * owner + that game's captains to review promotions if the crew has prospects.
 * Deduped per recipient (one unread nudge per community+game until read), so
 * repeated wins don't spam. Best-effort — never blocks the result write.
 */
async function suggestPromotionsForWin(communityId: string, game: string, actorId: string): Promise<void> {
  const admin = createServiceClient();
  const { data: prospects } = await admin
    .from("community_crew_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("game", game)
    .eq("tier", "prospect");
  const n = (prospects ?? []).length;
  if (n === 0) return; // nothing to promote

  const community = await getCommunityById(communityId);
  if (!community) return;

  const recipients = new Set<string>();
  if (community.ownerUserId) recipients.add(community.ownerUserId);
  const { data: captains } = await admin
    .from("community_crew_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("game", game)
    .eq("tier", "captain");
  for (const c of (captains ?? []) as Array<{ user_id: string }>) recipients.add(c.user_id);
  recipients.delete(actorId); // don't self-notify the reporter

  const link = `/c/${community.slug}`;
  for (const userId of recipients) {
    const { data: dupe } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "crew_promotion")
      .eq("read", false)
      .eq("link", link)
      .maybeSingle();
    if (dupe) continue;
    await createNotification({
      userId,
      type: "crew_promotion",
      title: `Your ${game} crew won — ${n} prospect${n === 1 ? "" : "s"} ready to promote`,
      actorUserId: actorId,
      link,
      data: { communityId, game },
    });
  }
}

/** Propose a battle vs another community's crew in a game (home-side captain/owner). */
export async function proposeBattle(args: {
  actorId: string;
  homeCommunityId: string;
  game: string;
  opponentSlug: string;
  scheduledAt?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const game = args.game.trim().slice(0, 80);
  if (!game) return { ok: false, reason: "invalid_game" };
  if (!(await canManageCrew(args.actorId, args.homeCommunityId, game))) return { ok: false, reason: "forbidden" };
  const opponent = await getCommunityBySlug(args.opponentSlug.trim().toLowerCase());
  if (!opponent) return { ok: false, reason: "opponent_not_found" };
  if (opponent.id === args.homeCommunityId) return { ok: false, reason: "cannot_challenge_self" };
  const admin = createServiceClient();
  const { error } = await admin.from("community_crew_battles").insert({
    game,
    home_community_id: args.homeCommunityId,
    away_community_id: opponent.id,
    status: "proposed",
    scheduled_at: args.scheduledAt || null,
    proposed_by: args.actorId,
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/** Away-side captain/owner accepts or declines a proposed battle. */
export async function respondBattle(actorId: string, battleId: string, accept: boolean): Promise<{ ok: boolean; reason?: string }> {
  const b = await loadBattle(battleId);
  if (!b) return { ok: false, reason: "not_found" };
  if (b.status !== "proposed") return { ok: false, reason: "not_proposed" };
  if (!(await canManageCrew(actorId, b.away_community_id, b.game))) return { ok: false, reason: "forbidden" };
  const admin = createServiceClient();
  const { error } = await admin
    .from("community_crew_battles")
    .update({ status: accept ? "accepted" : "declined", updated_at: new Date().toISOString() })
    .eq("id", battleId);
  return error ? { ok: false, reason: error.message } : { ok: true };
}

/** Either side's captain/owner reports the result of an accepted battle. */
export async function reportBattle(args: {
  actorId: string;
  battleId: string;
  winnerCommunityId: string;
  homeScore?: number | null;
  awayScore?: number | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const b = await loadBattle(args.battleId);
  if (!b) return { ok: false, reason: "not_found" };
  if (b.status !== "accepted") return { ok: false, reason: "not_accepted" };
  if (![b.home_community_id, b.away_community_id].includes(args.winnerCommunityId)) return { ok: false, reason: "invalid_winner" };
  const canHome = await canManageCrew(args.actorId, b.home_community_id, b.game);
  const canAway = canHome ? true : await canManageCrew(args.actorId, b.away_community_id, b.game);
  if (!canHome && !canAway) return { ok: false, reason: "forbidden" };
  const admin = createServiceClient();
  const { error } = await admin
    .from("community_crew_battles")
    .update({
      status: "completed",
      winner_community_id: args.winnerCommunityId,
      home_score: args.homeScore ?? null,
      away_score: args.awayScore ?? null,
      reported_by: args.actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.battleId);
  if (error) return { ok: false, reason: error.message };
  // Promotion-by-results — nudge the winning crew to review promotions.
  await suggestPromotionsForWin(args.winnerCommunityId, b.game, args.actorId).catch(() => {});
  return { ok: true };
}

/** Cancel a proposed/accepted battle (either side's captain/owner). */
export async function cancelBattle(actorId: string, battleId: string): Promise<{ ok: boolean; reason?: string }> {
  const b = await loadBattle(battleId);
  if (!b) return { ok: false, reason: "not_found" };
  if (b.status !== "proposed" && b.status !== "accepted") return { ok: false, reason: "not_cancellable" };
  const canHome = await canManageCrew(actorId, b.home_community_id, b.game);
  const canAway = canHome ? true : await canManageCrew(actorId, b.away_community_id, b.game);
  if (!canHome && !canAway) return { ok: false, reason: "forbidden" };
  const admin = createServiceClient();
  const { error } = await admin
    .from("community_crew_battles")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", battleId);
  return error ? { ok: false, reason: error.message } : { ok: true };
}
