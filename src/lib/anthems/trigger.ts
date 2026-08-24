/**
 * Walk-up anthem — first-chat trigger. Called (fire-and-forget) from the Twitch
 * chat webhook for every message. Cheap when the channel hasn't enabled anthems
 * (one policy read → return). When enabled, maps the chatter to their GS
 * account, resolves their anthem against the channel policy (AND-gated,
 * servability + cooldown handled by resolveAnthemForTrigger), and — if one
 * plays — records the play + pushes an overlay event the OBS overlay plays.
 *
 * "First chat" is approximated by the per-viewer cooldown in the resolver
 * (streamer-tunable); serverless webhooks have no cross-invocation memory to
 * track a true per-stream first-seen set.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getChannelPolicy, resolveAnthemForTrigger, recordAnthemPlay } from "./store";
import { recordOverlayEvent } from "@/lib/overlay/events";
import type { AnthemRole } from "./types";

function rolesFromBadges(badges: { set_id?: string }[]): AnthemRole[] {
  const roles: AnthemRole[] = ["everyone"];
  const has = (id: string) => badges.some((b) => b.set_id === id);
  if (has("subscriber") || has("founder")) roles.push("subscriber");
  if (has("vip")) roles.push("vip");
  if (has("moderator") || has("broadcaster")) roles.push("moderator");
  return roles;
}

export async function triggerFirstChatAnthem(args: {
  ownerUserId: string; // streamer GS user id
  senderTwitchId: string; // chatter's Twitch id
  badges: { set_id?: string }[];
  displayName: string;
}): Promise<void> {
  try {
    // Cheap gate first — most channels never enable anthems.
    const policy = await getChannelPolicy(args.ownerUserId);
    if (!policy.enabled || policy.trigger !== "first_chat") return;

    const admin = createServiceClient();
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("twitch_id", args.senderTwitchId)
      .maybeSingle();
    const viewerUserId = (data as { id: string } | null)?.id;
    if (!viewerUserId || viewerUserId === args.ownerUserId) return;

    const resolved = await resolveAnthemForTrigger({
      streamerOwnerId: args.ownerUserId,
      viewerUserId,
      roles: rolesFromBadges(args.badges),
      trigger: "first_chat",
    });
    if (!resolved) return;

    await recordAnthemPlay({
      streamerOwnerId: args.ownerUserId,
      viewerUserId,
      trackId: resolved.trackId,
      trigger: "first_chat",
    });

    await recordOverlayEvent({
      ownerUserId: args.ownerUserId,
      type: "anthem",
      payload: {
        audioUrl: resolved.audioUrl,
        startMs: resolved.startMs,
        durationMs: resolved.durationMs,
        volume: resolved.volume,
        title: resolved.title,
        artist: resolved.artist,
        artworkUrl: resolved.artworkUrl,
        attribution: resolved.attribution,
        viewerName: args.displayName,
      },
      ttlMs: resolved.durationMs + 2000,
    });
  } catch (err) {
    console.error("[anthem] first-chat trigger failed:", err);
  }
}
