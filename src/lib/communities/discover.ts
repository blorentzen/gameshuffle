import "server-only";

/**
 * Discovery data for the Community Hub:
 *   • listDiscoverCommunities — the browsable community rail (member count,
 *     platforms, top topics derived from recent post hashtags, join state)
 *   • listHubTournaments      — public tournaments split into Live vs Upcoming,
 *     with cancelled / complete / draft excluded
 *
 * Read-only, best-effort, service-role. Topics are derived from activity rather
 * than a manual setting so a community's card reflects what it's actually about;
 * a curated-topics override could layer on later as a community setting.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { listCommunities, type CommunityCard } from "@/lib/communities/membership";

export interface DiscoverCommunity extends CommunityCard {
  topics: string[];
  /** Games this community fields crews in (distinct), most-repped first. */
  crewGames: string[];
  isMember: boolean;
  /** channel (Twitch-auto) vs group (general). Defaults to channel pre-migration. */
  kind: "channel" | "group";
  subtype: string | null;
}

export async function listDiscoverCommunities(viewerId: string | null, limit = 40): Promise<DiscoverCommunity[]> {
  const admin = createServiceClient();
  const cards = await listCommunities(limit).catch(() => [] as CommunityCard[]);
  if (cards.length === 0) return [];
  const ids = cards.map((c) => c.id);

  // Top topics per community, tallied from recent posts' hashtags.
  const topicsByCommunity = new Map<string, string[]>();
  try {
    const { data: posts } = await admin
      .from("gs_posts")
      .select("id, community_id")
      .in("community_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(600);
    const postToCommunity = new Map<string, string>();
    for (const p of (posts ?? []) as { id: string; community_id: string | null }[]) {
      if (p.community_id) postToCommunity.set(p.id, p.community_id);
    }
    const postIds = [...postToCommunity.keys()];
    if (postIds.length) {
      const { data: tags } = await admin.from("gs_post_hashtags").select("post_id, tag").in("post_id", postIds);
      const counts = new Map<string, Map<string, number>>();
      for (const r of (tags ?? []) as { post_id: string; tag: string }[]) {
        const cid = postToCommunity.get(r.post_id);
        if (!cid) continue;
        const m = counts.get(cid) ?? new Map<string, number>();
        m.set(r.tag, (m.get(r.tag) ?? 0) + 1);
        counts.set(cid, m);
      }
      for (const [cid, m] of counts) {
        topicsByCommunity.set(
          cid,
          [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag]) => tag),
        );
      }
    }
  } catch { /* topics are best-effort */ }

  // Which of these the viewer already belongs to.
  const memberIds = new Set<string>();
  if (viewerId) {
    try {
      const { data } = await admin.from("community_members").select("community_id").eq("user_id", viewerId).in("community_id", ids);
      for (const r of (data ?? []) as { community_id: string }[]) memberIds.add(r.community_id);
    } catch { /* fall through: default not-member */ }
  }

  // Games each community fields crews in (distinct, ordered by roster size).
  const crewGamesByCommunity = new Map<string, string[]>();
  try {
    const { data: crew } = await admin
      .from("community_crew_members")
      .select("community_id, game")
      .in("community_id", ids);
    const counts = new Map<string, Map<string, number>>();
    for (const r of (crew ?? []) as { community_id: string; game: string }[]) {
      const m = counts.get(r.community_id) ?? new Map<string, number>();
      m.set(r.game, (m.get(r.game) ?? 0) + 1);
      counts.set(r.community_id, m);
    }
    for (const [cid, m] of counts) {
      crewGamesByCommunity.set(cid, [...m.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g));
    }
  } catch { /* crews table may not be migrated yet → no crew games */ }

  // Kind + subtype (channel vs group). Guarded — pre-migration → all channel.
  const kindById = new Map<string, { kind: "channel" | "group"; subtype: string | null }>();
  try {
    const { data: kinds } = await admin.from("gs_communities").select("id, kind, subtype").in("id", ids);
    for (const r of (kinds ?? []) as { id: string; kind: string | null; subtype: string | null }[]) {
      kindById.set(r.id, { kind: r.kind === "group" ? "group" : "channel", subtype: r.subtype ?? null });
    }
  } catch { /* columns not migrated → default channel */ }

  return cards.map((c) => ({
    ...c,
    topics: topicsByCommunity.get(c.id) ?? [],
    crewGames: crewGamesByCommunity.get(c.id) ?? [],
    isMember: memberIds.has(c.id),
    kind: kindById.get(c.id)?.kind ?? "channel",
    subtype: kindById.get(c.id)?.subtype ?? null,
  }));
}

export interface HubTournament {
  id: string;
  title: string;
  gameSlug: string | null;
  mode: string | null;
  whenIso: string | null;
  participantCount: number;
  maxParticipants: number | null;
  headerImageUrl: string | null;
  organizerName: string | null;
}

export interface HubTournaments { live: HubTournament[]; upcoming: HubTournament[] }

export async function listHubTournaments(limit = 12): Promise<HubTournaments> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("tournaments")
    .select("id, title, game_slug, mode, status, date_time, max_participants, header_image_url, users!tournaments_organizer_id_fkey(display_name), tournament_participants(count)")
    .in("status", ["open", "in_progress"])
    .order("date_time", { ascending: true, nullsFirst: false })
    .limit(limit * 2);

  const rows = (data ?? []) as Array<{
    id: string; title: string; game_slug: string | null; mode: string | null; status: string;
    date_time: string | null; max_participants: number | null; header_image_url: string | null;
    users: { display_name: string | null } | { display_name: string | null }[] | null;
    tournament_participants: { count: number }[] | null;
  }>;

  const map = (r: (typeof rows)[number]): HubTournament => {
    const org = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      title: r.title,
      gameSlug: r.game_slug,
      mode: r.mode,
      whenIso: r.date_time,
      participantCount: r.tournament_participants?.[0]?.count ?? 0,
      maxParticipants: r.max_participants,
      headerImageUrl: r.header_image_url,
      organizerName: org?.display_name ?? null,
    };
  };

  return {
    live: rows.filter((r) => r.status === "in_progress").map(map).slice(0, limit),
    upcoming: rows.filter((r) => r.status === "open").map(map).slice(0, limit),
  };
}
