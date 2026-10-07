import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendChatMessage } from "@/lib/twitch/client";

/**
 * Posts to a community owner's Twitch chat as the GameShuffle bot. Best-effort:
 * a channel may not be connected, and a failed post never breaks the caller.
 * Used by features that speak up on their own (Stream Bingo wins, chat drafts).
 */
export async function announceToCommunity(communityId: string, message: string): Promise<void> {
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (!botId) return;
  try {
    const admin = createServiceClient();
    const { data: comm } = await admin.from("gs_communities").select("owner_user_id").eq("id", communityId).maybeSingle();
    const owner = (comm as { owner_user_id: string | null } | null)?.owner_user_id;
    if (!owner) return;
    const { data: conn } = await admin.from("twitch_connections").select("twitch_user_id").eq("user_id", owner).maybeSingle();
    const broadcasterId = (conn as { twitch_user_id: string | null } | null)?.twitch_user_id;
    if (!broadcasterId) return;
    await sendChatMessage({ broadcasterId, senderId: botId, message });
  } catch (err) {
    console.error("[announce] chat post failed:", err);
  }
}
