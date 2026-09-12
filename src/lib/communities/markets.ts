import "server-only";

/**
 * Community-scoped market surfacing (Phase 2, markets — v1).
 *
 * Prediction markets are opened by the system/streamer during a live session
 * and are community-scoped (`gs_markets.community_id`). Here we read a
 * community's currently OPEN markets so the /c home can show "there's a
 * prediction live right now" and route participation to /live, where the
 * viewer-identity pick/bet flow already lives.
 *
 * Deliberately read-only: placing picks/bets from the account wallet is a
 * follow-up (it touches identity resolution + the token spend path), so v1
 * doesn't duplicate or risk the economy's bet path.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getSpectatorTally, type SpectatorTally } from "@/lib/economy/markets/spectator";

export interface CommunityMarket {
  id: string;
  question: string;
  outcomes: SpectatorTally[];
}

/** A community's currently-open prediction markets (usually 0 or 1). */
export async function getOpenMarketsForCommunity(communityId: string): Promise<CommunityMarket[]> {
  if (!communityId) return [];
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_markets")
    .select("id, question")
    .eq("community_id", communityId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(3);
  const markets = (data ?? []) as { id: string; question: string }[];
  return Promise.all(
    markets.map(async (m) => ({
      id: m.id,
      question: m.question,
      outcomes: await getSpectatorTally(m.id),
    })),
  );
}
