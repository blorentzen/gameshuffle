import "server-only";

/**
 * Group streaks for the dailies (rules in groupRules.ts): your crews and the
 * people you follow, from the day boards' scores (daily_scores, accounts
 * only). Counts only, never names. Read on the Shuffle's and the Dex's end
 * screens (/api/dailies/groups) and on a crew's community page.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";
import {
  GROUP_LOOKBACK_DAYS, MAX_CREWS, MAX_CREW_MEMBERS, MAX_FOLLOWS, crewStreak, peopleStreak,
  type GroupGame, type GroupStreak, type SolvedDays,
} from "./groupRules";

/** Who solved each day of this daily, among these accounts. */
async function solvedDays(game: GroupGame, users: string[], today: string): Promise<SolvedDays> {
  const days: SolvedDays = new Map();
  if (!users.length) return days;
  const from = gsAddDays(today, -GROUP_LOOKBACK_DAYS);
  const svc = createServiceClient();
  // A few hundred people at most; split the list so the URL stays short.
  for (let i = 0; i < users.length; i += 150) {
    const chunk = users.slice(i, i + 150);
    const { data, error } = await readAllPages<{ user_id: string; day: string }>((a, b) => svc.from("daily_scores").select("user_id, day")
      .eq("game", game).eq("solved", true).in("user_id", chunk).gte("day", from).lte("day", today).order("day").order("player").range(a, b));
    if (error) return days;
    for (const r of data) {
      const set = days.get(r.day) ?? new Set<string>();
      set.add(r.user_id);
      days.set(r.day, set);
    }
  }
  return days;
}

interface CrewGroup { communityId: string; name: string; slug: string; members: string[] }

/** The communities where this account is in a crew (any game), with every crew member there. */
async function crewsOf(userId: string): Promise<CrewGroup[]> {
  const svc = createServiceClient();
  const { data: mine } = await svc.from("community_crew_members").select("community_id").eq("user_id", userId);
  const ids = [...new Set(((mine ?? []) as { community_id: string }[]).map((r) => r.community_id))];
  if (!ids.length) return [];
  const [{ data: rows }, { data: comms }] = await Promise.all([
    svc.from("community_crew_members").select("community_id, user_id, added_at").in("community_id", ids).order("added_at").limit(2000),
    svc.from("gs_communities").select("id, slug, display_name").in("id", ids),
  ]);
  const members = new Map<string, string[]>();
  for (const r of (rows ?? []) as { community_id: string; user_id: string }[]) {
    const list = members.get(r.community_id) ?? [];
    if (!list.includes(r.user_id) && list.length < MAX_CREW_MEMBERS) list.push(r.user_id);
    members.set(r.community_id, list);
  }
  return ((comms ?? []) as { id: string; slug: string; display_name: string | null }[])
    .map((c) => ({ communityId: c.id, slug: c.slug, name: c.display_name || `@${c.slug}`, members: members.get(c.id) ?? [] }))
    // A crew of one is just you.
    .filter((c) => c.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name))
    .slice(0, MAX_CREWS);
}

const cache = new Map<string, { at: number; value: GroupStreak[] }>();

/** Your crews' streaks and your people's streak on one daily (kept 30 seconds per account). */
export async function groupStreaksFor(userId: string, game: GroupGame, today = gsDay()): Promise<GroupStreak[]> {
  const key = `${userId}:${game}:${today}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const svc = createServiceClient();
  const [crews, { data: follows }] = await Promise.all([
    crewsOf(userId),
    svc.from("follows").select("followee_user_id").eq("follower_user_id", userId).limit(MAX_FOLLOWS),
  ]);
  const followIds = ((follows ?? []) as { followee_user_id: string }[]).map((f) => f.followee_user_id).filter((id) => id !== userId);
  const everyone = [...new Set([userId, ...followIds, ...crews.flatMap((c) => c.members)])];
  const days = await solvedDays(game, everyone, today);
  const out: GroupStreak[] = crews.map((c) => crewStreak({ name: c.name, href: `/c/${c.slug}`, members: new Set(c.members), days, today, me: userId }));
  if (followIds.length) out.push(peopleStreak({ me: userId, follows: new Set(followIds), days, today }));
  cache.set(key, { at: Date.now(), value: out });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return out;
}

/** A community's crew streak on each group daily, for its page (null when it has no crew of two or more). */
export async function crewDailies(communityId: string, today = gsDay()): Promise<{ game: GroupGame; streak: GroupStreak }[] | null> {
  const svc = createServiceClient();
  const [{ data: rows }, { data: comm }] = await Promise.all([
    svc.from("community_crew_members").select("user_id, added_at").eq("community_id", communityId).order("added_at").limit(2000),
    svc.from("gs_communities").select("slug, display_name").eq("id", communityId).maybeSingle(),
  ]);
  const members = [...new Set(((rows ?? []) as { user_id: string }[]).map((r) => r.user_id))].slice(0, MAX_CREW_MEMBERS);
  if (members.length < 2) return null;
  const c = comm as { slug: string; display_name: string | null } | null;
  const games: GroupGame[] = ["shuffle", "dex"];
  return Promise.all(games.map(async (game) => ({
    game,
    streak: crewStreak({ name: c?.display_name || `@${c?.slug ?? ""}`, href: c ? `/c/${c.slug}` : null, members: new Set(members), days: await solvedDays(game, members, today), today, me: "" }),
  })));
}
