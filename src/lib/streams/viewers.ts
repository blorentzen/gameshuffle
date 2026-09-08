import "server-only";
import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { getStreamsByUserIds } from "@/lib/twitch/client";

/**
 * All-up viewer count across a streamer's platforms. Twitch is wired today;
 * the shape is multi-platform so YouTube / Kick slot in later without changing
 * callers (each contributes a PlatformViewers row; `total` sums the live ones).
 *
 * Cached per owner for a short TTL so the overlay's 2s poll never hits Helix on
 * every tick (Helix app-token rate limits + it barely moves second-to-second).
 */

export type ViewerPlatform = "twitch";

export interface PlatformViewers {
  platform: ViewerPlatform;
  count: number;
  live: boolean;
}

export interface ViewerCounts {
  total: number;
  live: boolean;
  platforms: PlatformViewers[];
}

const TTL_MS = 20_000;
const cache = new Map<string, { data: ViewerCounts; ts: number }>();

async function twitchViewers(ownerUserId: string): Promise<PlatformViewers | null> {
  const admin = createTwitchAdminClient();
  const { data } = await admin
    .from("twitch_connections")
    .select("twitch_user_id")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  const twitchId = (data as { twitch_user_id?: string } | null)?.twitch_user_id;
  if (!twitchId) return null;
  try {
    const streams = await getStreamsByUserIds([twitchId]);
    const s = streams[0];
    return { platform: "twitch", count: s?.viewer_count ?? 0, live: !!s };
  } catch {
    return { platform: "twitch", count: 0, live: false };
  }
}

export async function getViewerCountsForOwner(ownerUserId: string): Promise<ViewerCounts> {
  const cached = cache.get(ownerUserId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  const platforms: PlatformViewers[] = [];
  const twitch = await twitchViewers(ownerUserId);
  if (twitch) platforms.push(twitch);
  // Future: push YouTube / Kick rows here.

  const total = platforms.reduce((sum, p) => sum + (p.live ? p.count : 0), 0);
  const live = platforms.some((p) => p.live);
  const data: ViewerCounts = { total, live, platforms };
  cache.set(ownerUserId, { data, ts: Date.now() });
  return data;
}
