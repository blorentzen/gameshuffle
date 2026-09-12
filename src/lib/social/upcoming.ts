import "server-only";

/**
 * "Upcoming" for the social home — the events worth surfacing to a user:
 *   • tournaments they organize or joined that aren't finished
 *   • game-night posts from their communities + the people they follow
 *
 * Read-only, best-effort, small result set for a sidebar widget.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export interface UpcomingItem {
  kind: "tournament" | "game_night";
  id: string;
  title: string;
  subtitle: string | null;
  /** ISO start time when known (for ordering + display). */
  whenIso: string | null;
  url: string;
}

export async function getUpcomingForUser(userId: string, limit = 6): Promise<UpcomingItem[]> {
  if (!userId) return [];
  const admin = createServiceClient();
  const items: UpcomingItem[] = [];

  // --- Tournaments: organized OR joined, not complete ----------------------
  const [{ data: joinedRows }] = await Promise.all([
    admin.from("tournament_participants").select("tournament_id").eq("user_id", userId),
  ]);
  const joinedIds = ((joinedRows ?? []) as { tournament_id: string }[]).map((r) => r.tournament_id);
  const orClauses = [`organizer_id.eq.${userId}`];
  if (joinedIds.length) orClauses.push(`id.in.(${joinedIds.join(",")})`);
  const { data: tourneys } = await admin
    .from("tournaments")
    .select("id, title, status, date_time, game_slug")
    .or(orClauses.join(","))
    .neq("status", "complete")
    .limit(20);
  for (const t of (tourneys ?? []) as { id: string; title: string; status: string; date_time: string | null; game_slug: string | null }[]) {
    const statusLabel = t.status === "in_progress" ? "Live now" : t.status === "open" ? "Open to join" : t.status.replace("_", " ");
    items.push({
      kind: "tournament",
      id: t.id,
      title: t.title,
      subtitle: statusLabel,
      whenIso: t.date_time,
      url: `/tournament/${t.id}`,
    });
  }

  // --- Game nights from joined communities + followed authors --------------
  const [{ data: memberRows }, { data: followRows }] = await Promise.all([
    admin.from("community_members").select("community_id").eq("user_id", userId),
    admin.from("follows").select("followee_user_id").eq("follower_user_id", userId),
  ]);
  const communityIds = ((memberRows ?? []) as { community_id: string }[]).map((r) => r.community_id);
  const authorIds = [userId, ...((followRows ?? []) as { followee_user_id: string }[]).map((r) => r.followee_user_id)];

  const orGn: string[] = [`author_id.in.(${authorIds.join(",")})`];
  if (communityIds.length) orGn.push(`community_id.in.(${communityIds.join(",")})`);
  const { data: gnPosts } = await admin
    .from("gs_posts")
    .select("id, body, meta, created_at")
    .eq("kind", "game_night")
    .is("deleted_at", null)
    .or(orGn.join(","))
    .order("created_at", { ascending: false })
    .limit(20);
  const now = Date.now();
  for (const p of (gnPosts ?? []) as { id: string; body: string; meta: { game?: string; startAt?: string | null } | null; created_at: string }[]) {
    const startAt = p.meta?.startAt ?? null;
    // Keep future or open (null start) game nights; drop clearly-past ones.
    if (startAt && new Date(startAt).getTime() < now) continue;
    items.push({
      kind: "game_night",
      id: p.id,
      title: p.meta?.game ? `Game Night: ${p.meta.game}` : "Game Night",
      subtitle: p.body.slice(0, 60),
      whenIso: startAt,
      url: `/community/post/${p.id}`,
    });
  }

  // Order: soonest known time first, timeless (open) items after.
  items.sort((a, b) => {
    if (a.whenIso && b.whenIso) return a.whenIso < b.whenIso ? -1 : 1;
    if (a.whenIso) return -1;
    if (b.whenIso) return 1;
    return 0;
  });
  return items.slice(0, limit);
}
