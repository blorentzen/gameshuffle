import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/economy/tokens";

/**
 * Read-only profile enrichment for the public /u page: token wallet, the
 * communities the user is active in, config count, and tournaments
 * (organized + joined). Uses the service client so another viewer's RLS
 * doesn't blank the profile owner's data — same pattern as brand-server.
 * Every section degrades to empty/null on error (missing table, no economy
 * identity) so the profile never hard-fails.
 */

export interface TournamentLite {
  id: string;
  title: string;
  game_slug: string | null;
  mode: string | null;
  status: string | null;
  date_time: string | null;
}

export interface ProfileCommunity {
  slug: string;
  name: string;
}

export interface ProfileEnrichment {
  tokenBalance: number | null;
  communities: ProfileCommunity[];
  configCount: number;
  organized: TournamentLite[];
  joined: TournamentLite[];
  isStreamer: boolean;
  isLive: boolean;
  isOnline: boolean;
}

const EMPTY: ProfileEnrichment = {
  tokenBalance: null,
  communities: [],
  configCount: 0,
  organized: [],
  joined: [],
  isStreamer: false,
  isLive: false,
  isOnline: false,
};

function oneTournament(value: unknown): TournamentLite | null {
  // A to-one embed may arrive as an object or a single-element array.
  const t = Array.isArray(value) ? value[0] : value;
  return t && typeof t === "object" ? (t as TournamentLite) : null;
}

export async function getProfileEnrichment(userId: string): Promise<ProfileEnrichment> {
  const admin = createServiceClient();

  try {
    const [identitiesRes, organizedRes, joinedRes, configCountRes, streamerRes, lastSeenRes] =
      await Promise.all([
      admin.from("gs_identities").select("id").eq("gs_account_id", userId),
      admin
        .from("tournaments")
        .select("id, title, game_slug, mode, status, date_time")
        .eq("organizer_id", userId)
        .order("date_time", { ascending: false })
        .limit(24),
      admin
        .from("tournament_participants")
        .select("status, tournaments(id, title, game_slug, mode, status, date_time)")
        .eq("user_id", userId)
        .order("joined_at", { ascending: false })
        .limit(24),
      admin.from("saved_configs").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("twitch_connections").select("id, is_live").eq("user_id", userId).limit(1).maybeSingle(),
      admin.from("users").select("last_seen_at").eq("id", userId).maybeSingle(),
    ]);
    const isStreamer = !!streamerRes.data;
    const isLive = !!(streamerRes.data as { is_live?: boolean } | null)?.is_live;
    const lastSeen = (lastSeenRes.data as { last_seen_at?: string | null } | null)?.last_seen_at ?? null;
    const isOnline = !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;

    const identityIds = ((identitiesRes.data ?? []) as { id: string }[]).map((i) => i.id);

    // Token wallet — sum across the account's platform identities.
    let tokenBalance: number | null = null;
    if (identityIds.length) {
      try {
        const balances = await Promise.all(identityIds.map((id) => getBalance(id)));
        tokenBalance = balances.reduce((a, b) => a + b, 0);
      } catch {
        tokenBalance = null;
      }
    }

    // Communities — distinct communities the user has token activity in.
    const communities: ProfileCommunity[] = [];
    if (identityIds.length) {
      const { data: events } = await admin
        .from("token_events")
        .select("community_id")
        .in("identity_id", identityIds)
        .not("community_id", "is", null)
        .limit(1000);
      const communityIds = [
        ...new Set(((events ?? []) as { community_id: string }[]).map((e) => e.community_id)),
      ];
      if (communityIds.length) {
        const { data: comms } = await admin
          .from("gs_communities")
          .select("slug, display_name")
          .in("id", communityIds);
        for (const c of (comms ?? []) as { slug: string; display_name: string | null }[]) {
          communities.push({ slug: c.slug, name: c.display_name || c.slug });
        }
      }
    }

    const organized = (organizedRes.data ?? []) as TournamentLite[];
    const joined = ((joinedRes.data ?? []) as Array<{ tournaments: unknown }>)
      .map((p) => oneTournament(p.tournaments))
      .filter((t): t is TournamentLite => !!t);

    return {
      tokenBalance,
      communities,
      configCount: configCountRes.count ?? 0,
      organized,
      joined,
      isStreamer,
      isLive,
      isOnline,
    };
  } catch {
    return EMPTY;
  }
}
