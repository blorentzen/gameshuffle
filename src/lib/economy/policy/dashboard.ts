import "server-only";

/**
 * Token economy ▸ Streamers and ▸ History extras (staff): each community's
 * allowance use this month and latest snapshot, the 7-day streamer engagement
 * leaderboard, 14 days of event velocity and 30 days of new-community bonuses.
 * Moved here from the old /staff/economy page so Platform admin can show it.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsMonthStart } from "@/lib/time/gsClock";
import {
  eventsVelocity, newCommunityBonusTrend, recentSnapshots, streamerEngagementLeaderboard,
  type NewCommunityBonusRow, type SnapshotRow, type StreamerEngagementRow, type VelocityRow,
} from "./snapshot";

export interface CommunityEconomyRow {
  id: string;
  slug: string;
  displayName: string | null;
  latestSnapshot: (SnapshotRow & { taken_at: string }) | null;
  allowance: { ceiling: number; consumed: number; periodMonth: string } | null;
}

export interface EconomyDashboard {
  communities: CommunityEconomyRow[];
  streamerBoard: StreamerEngagementRow[];
  velocity: VelocityRow[];
  newCommunityBonus: NewCommunityBonusRow[];
}

async function communityRows(): Promise<CommunityEconomyRow[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("gs_communities").select("id, slug, display_name").order("created_at", { ascending: false });
  const communities = (data ?? []) as { id: string; slug: string; display_name: string | null }[];
  const periodMonth = gsMonthStart();
  const rows: CommunityEconomyRow[] = [];
  for (const c of communities) {
    const [recent, { data: allowance }] = await Promise.all([
      recentSnapshots({ communityId: c.id, limit: 1 }),
      admin.from("gs_streamer_allowance").select("ceiling, consumed, period_month").eq("community_id", c.id).eq("period_month", periodMonth).maybeSingle(),
    ]);
    rows.push({
      id: c.id, slug: c.slug, displayName: c.display_name,
      latestSnapshot: (recent[0] as (SnapshotRow & { taken_at: string }) | undefined) ?? null,
      allowance: allowance ? { ceiling: Number(allowance.ceiling), consumed: Number(allowance.consumed), periodMonth: String(allowance.period_month) } : null,
    });
  }
  return rows;
}

export async function economyDashboard(): Promise<EconomyDashboard> {
  const [communities, streamerBoard, velocity, newCommunityBonus] = await Promise.all([
    communityRows(),
    streamerEngagementLeaderboard({ daysBack: 7, limit: 10 }),
    eventsVelocity({ daysBack: 14 }),
    newCommunityBonusTrend({ daysBack: 30 }),
  ]);
  return { communities, streamerBoard, velocity, newCommunityBonus };
}
