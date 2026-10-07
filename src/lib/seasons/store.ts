import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { collectionForUser } from "@/lib/collection/server";
import { nightGame } from "@/lib/nights/games";
import { PARTY_GAMES } from "@/data/party";
import { ULTIMATE } from "@/data/smash/ultimate";
import { rankFor, seasonRange, type SeasonRank } from "@/lib/seasons/ranks";

/**
 * Season standings and the roster race, read from the one points record
 * (party_points) and live-night results. Service role: party tables are
 * closed to browser roles. Every read degrades to empty when the live-nights
 * migration isn't applied yet.
 */

export interface SeasonRow { userId: string; name: string; username: string | null; points: number; rank: SeasonRank }

type PointRow = { user_id: string; points: number; game_slug: string };

/** A host's season (their community): everyone who scored at their nights this month. */
export async function hostSeason(hostUserId: string, key: string, gameSlug: string | null = null, limit = 10): Promise<SeasonRow[]> {
  const { start, end } = seasonRange(key);
  let q = createServiceClient().from("party_points").select("user_id, points, game_slug, party_nights!inner(host_user_id)")
    .eq("party_nights.host_user_id", hostUserId).gte("created_at", start).lt("created_at", end).limit(20000);
  if (gameSlug) q = q.eq("game_slug", gameSlug);
  const { data, error } = await q;
  if (error || !data) return [];
  const totals = new Map<string, number>();
  for (const r of data as unknown as PointRow[]) totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + r.points);
  const top = [...totals].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!top.length) return [];
  const { data: users } = await createServiceClient().from("users").select("id, display_name, username").in("id", top.map(([id]) => id));
  const byId = new Map(((users ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u]));
  return top.map(([userId, points]) => ({ userId, points, rank: rankFor(points), name: byId.get(userId)?.display_name || byId.get(userId)?.username || "Player", username: byId.get(userId)?.username ?? null }));
}

/** The games that have points at a host's nights this season (for the game filter). */
export async function hostSeasonGames(hostUserId: string, key: string): Promise<string[]> {
  const { start, end } = seasonRange(key);
  const { data, error } = await createServiceClient().from("party_points").select("game_slug, party_nights!inner(host_user_id)")
    .eq("party_nights.host_user_id", hostUserId).gte("created_at", start).lt("created_at", end).limit(20000);
  if (error || !data) return [];
  return [...new Set((data as unknown as { game_slug: string }[]).map((r) => r.game_slug))].filter((g) => nightGame(g));
}

export interface RosterRace { gameSlug: string; label: string; kind: "fighters" | "characters" | "boards"; won: string[]; pool: string[] }
export interface UserSeason { points: number; rank: SeasonRank; games: { gameSlug: string; points: number }[]; rosters: RosterRace[] }

/** One person's season everywhere: points per game, their rank, and roster races. */
export async function userSeason(userId: string, key: string): Promise<UserSeason | null> {
  const svc = createServiceClient();
  const { start, end } = seasonRange(key);
  const { data: pts, error } = await svc.from("party_points").select("user_id, points, game_slug").eq("user_id", userId).gte("created_at", start).lt("created_at", end);
  if (error) return null;
  const perGame = new Map<string, number>();
  for (const r of (pts ?? []) as PointRow[]) perGame.set(r.game_slug, (perGame.get(r.game_slug) ?? 0) + r.points);
  const total = [...perGame.values()].reduce((a, b) => a + b, 0);

  // Wins this season: results where this person's seat placed first.
  const { data: seats } = await svc.from("party_seats").select("night_id, seat_index").eq("user_id", userId).limit(2000);
  const mySeat = new Map(((seats ?? []) as { night_id: string; seat_index: number }[]).map((s) => [s.night_id, s.seat_index]));
  const wins: { slug: string; character: string | null; boardId: string | null }[] = [];
  if (mySeat.size) {
    const { data: res } = await svc.from("party_results").select("night_id, seat_index, character, game_id, created_at")
      .in("night_id", [...mySeat.keys()]).eq("place", 1).gte("created_at", start).lt("created_at", end).limit(5000);
    const mine = ((res ?? []) as { night_id: string; seat_index: number; character: string | null; game_id: string }[]).filter((r) => mySeat.get(r.night_id) === r.seat_index);
    if (mine.length) {
      const { data: games } = await svc.from("party_games").select("id, game_slug, config").in("id", [...new Set(mine.map((r) => r.game_id))]);
      const gById = new Map(((games ?? []) as { id: string; game_slug: string; config: { setup?: { boardId?: string } } }[]).map((g) => [g.id, g]));
      for (const r of mine) {
        const g = gById.get(r.game_id);
        if (g) wins.push({ slug: g.game_slug, character: r.character, boardId: g.config?.setup?.boardId ?? null });
      }
    }
  }

  // Roster races: only what the person owns counts, so DLC gaps don't hold anyone back.
  const rosters: RosterRace[] = [];
  const playedSmash = perGame.has(ULTIMATE.slug) || wins.some((w) => w.slug === ULTIMATE.slug);
  if (playedSmash) {
    const col = await collectionForUser(userId, ULTIMATE.slug);
    const off = new Set(col?.enabled ? col.off.fighters ?? [] : ULTIMATE.fighters.filter((f) => f.pack).map((f) => f.name));
    const pool = ULTIMATE.fighters.filter((f) => !off.has(f.name)).map((f) => f.name);
    rosters.push({ gameSlug: ULTIMATE.slug, label: "Smash fighters", kind: "fighters", pool, won: [...new Set(wins.filter((w) => w.slug === ULTIMATE.slug && w.character && pool.includes(w.character)).map((w) => w.character!))] });
  }
  for (const g of Object.values(PARTY_GAMES)) {
    if (!perGame.has(g.slug) && !wins.some((w) => w.slug === g.slug)) continue;
    const col = await collectionForUser(userId, g.slug);
    const offBoards = new Set(col?.enabled ? col.off.boards ?? [] : []);
    const offChars = new Set(col?.enabled ? col.off.characters ?? [] : g.characters.filter((c) => c.unlockable).map((c) => c.name));
    const chars = g.characters.filter((c) => !offChars.has(c.name)).map((c) => c.name);
    rosters.push({ gameSlug: g.slug, label: `${g.shortLabel} characters`, kind: "characters", pool: chars,
      won: [...new Set(wins.filter((w) => w.slug === g.slug && w.character && chars.includes(w.character)).map((w) => w.character!))] });
    const boards = g.boards.filter((b) => !offBoards.has(b.id));
    rosters.push({ gameSlug: g.slug, label: `${g.shortLabel} boards`, kind: "boards", pool: boards.map((b) => b.name),
      won: [...new Set(wins.filter((w) => w.slug === g.slug && w.boardId).map((w) => boards.find((b) => b.id === w.boardId)?.name).filter((n): n is string => !!n))] });
  }

  return { points: total, rank: rankFor(total), games: [...perGame].map(([gameSlug, points]) => ({ gameSlug, points })).sort((a, b) => b.points - a.points), rosters };
}
