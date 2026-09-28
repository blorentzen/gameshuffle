import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Rivalries: head-to-head records between accounts, from live-night results.
 * Two people meet in a game when both had account seats in it; whoever placed
 * higher takes it. Your rival is whoever you've met most (ties go to the
 * closest record). Reads degrade to empty before the migration lands.
 */

export interface HeadToHead { opponentId: string; games: number; wins: number; losses: number }

/** Records for each of `userIds` against everyone they've met (optionally only among `userIds`). */
export async function headToHead(userIds: string[], onlyAmong = false): Promise<Map<string, HeadToHead[]>> {
  const out = new Map<string, HeadToHead[]>();
  if (!userIds.length) return out;
  const svc = createServiceClient();
  const { data: mine } = await svc.from("party_seats").select("night_id").in("user_id", userIds).limit(5000);
  const nights = [...new Set(((mine ?? []) as { night_id: string }[]).map((r) => r.night_id))];
  if (!nights.length) return out;
  const [{ data: seats }, { data: results }] = await Promise.all([
    svc.from("party_seats").select("night_id, seat_index, user_id").in("night_id", nights).not("user_id", "is", null),
    svc.from("party_results").select("night_id, game_id, seat_index, place").in("night_id", nights).limit(20000),
  ]);
  const userAt = new Map(((seats ?? []) as { night_id: string; seat_index: number; user_id: string }[]).map((s) => [`${s.night_id}:${s.seat_index}`, s.user_id]));
  const byGame = new Map<string, { user: string; place: number }[]>();
  for (const r of (results ?? []) as { night_id: string; game_id: string; seat_index: number; place: number }[]) {
    const user = userAt.get(`${r.night_id}:${r.seat_index}`);
    if (!user) continue;
    const list = byGame.get(r.game_id) ?? [];
    list.push({ user, place: r.place });
    byGame.set(r.game_id, list);
  }
  const wanted = new Set(userIds);
  const tally = new Map<string, Map<string, HeadToHead>>();
  for (const players of byGame.values()) {
    for (const me of players) {
      if (!wanted.has(me.user)) continue;
      for (const them of players) {
        if (them.user === me.user || (onlyAmong && !wanted.has(them.user))) continue;
        const mine = tally.get(me.user) ?? new Map<string, HeadToHead>();
        const rec = mine.get(them.user) ?? { opponentId: them.user, games: 0, wins: 0, losses: 0 };
        rec.games++;
        if (me.place < them.place) rec.wins++; else if (me.place > them.place) rec.losses++;
        mine.set(them.user, rec);
        tally.set(me.user, mine);
      }
    }
  }
  for (const [user, recs] of tally) out.set(user, [...recs.values()].sort(byRivalry));
  return out;
}

/** Most games first; ties go to the closer record. */
function byRivalry(a: HeadToHead, b: HeadToHead): number {
  return b.games - a.games || Math.abs(a.wins - a.losses) - Math.abs(b.wins - b.losses);
}

/** Each listed person's rival among the others listed (for dealing {rival} cards at a table). */
export async function rivalsAmong(userIds: string[]): Promise<Map<string, string>> {
  const recs = await headToHead(userIds, true);
  const out = new Map<string, string>();
  for (const [user, list] of recs) if (list[0]) out.set(user, list[0].opponentId);
  return out;
}

export interface RivalView extends HeadToHead { name: string; username: string | null }

/** A profile's top rivals, with names. */
export async function rivalsFor(userId: string, limit = 3): Promise<RivalView[]> {
  const list = ((await headToHead([userId])).get(userId) ?? []).slice(0, limit);
  if (!list.length) return [];
  const { data } = await createServiceClient().from("users").select("id, display_name, username").in("id", list.map((r) => r.opponentId));
  const byId = new Map(((data ?? []) as { id: string; display_name: string | null; username: string | null }[]).map((u) => [u.id, u]));
  return list.map((r) => ({ ...r, name: byId.get(r.opponentId)?.display_name || byId.get(r.opponentId)?.username || "Player", username: byId.get(r.opponentId)?.username ?? null }));
}
