/**
 * Twitch broadcast ↔ economy bootstrap helpers.
 *
 * The Twitch webhook layer is the system's most reliable signal that
 * a streamer is actively broadcasting. This module turns those
 * signals into gs_communities + gs_streams state without the webhook
 * needing to know about identity/community/stream details.
 *
 *   stream.online  → ensureBroadcastActive() — idempotent: opens (or
 *                    recovers from `ending`) the streamer's stream
 *                    row, lazy-creating community + broadcaster
 *                    identity rows as needed.
 *
 *   stream.offline → markBroadcastEnding() — flips the active stream
 *                    to `ending` and starts the grace clock. The cron
 *                    sweep finalizes + refunds; this function does NOT
 *                    refund directly so a quick reconnect can recover
 *                    cleanly.
 */

import "server-only";
import { resolveIdentity } from "@/lib/economy/identity";
import { ensureCommunity } from "@/lib/economy/community";
import {
  ensureActiveStream,
  getActiveStreamForCommunity,
  markStreamEnding,
} from "@/lib/economy/streams";
import { createServiceClient } from "@/lib/supabase/admin";

interface BroadcasterContext {
  twitchUserId: string;
  twitchLogin: string | null;
  displayName: string | null;
  /** GS users.id for this streamer. Used to derive the canonical
   *  community slug (username || twitch_username || twitchLogin). */
  ownerUserId: string;
}

async function resolveSlug(ctx: BroadcasterContext): Promise<string> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("username, twitch_username")
    .eq("id", ctx.ownerUserId)
    .maybeSingle();
  return (
    ((data?.username as string | null) ?? null) ||
    ((data?.twitch_username as string | null) ?? null) ||
    ctx.twitchLogin ||
    ctx.twitchUserId
  );
}

/**
 * Lazy-create / refresh community + open an active stream for this
 * streamer. Idempotent — a reconnect within grace flips `ending` →
 * `open` automatically via `ensureActiveStream`.
 *
 * Best-effort: errors are logged but never rethrown. The broadcast
 * still proceeds — markets just won't open until the next bootstrap
 * call succeeds.
 */
export async function ensureBroadcastActive(
  ctx: BroadcasterContext,
): Promise<void> {
  try {
    const slug = await resolveSlug(ctx);
    const displayName = ctx.displayName ?? ctx.twitchLogin ?? slug;
    const broadcasterIdentity = await resolveIdentity({
      platform: "twitch",
      platformId: ctx.twitchUserId,
      displayName,
    });
    const community = await ensureCommunity({
      ownerIdentityId: broadcasterIdentity.identityId,
      slug,
      displayName,
    });
    await ensureActiveStream({ communityId: community.id });
  } catch (err) {
    console.error("[economy/twitchBootstrap] ensureBroadcastActive failed", {
      twitchUserId: ctx.twitchUserId,
      err: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Stream.offline mirror. Looks up the broadcaster's identity →
 * community → active stream, and flips `open` → `ending`. The cron
 * sweep finalizes + refunds after the grace window.
 *
 * Best-effort. Returns the stream id that entered `ending` (or null)
 * so the caller can correlate with audit logging.
 */
export async function markBroadcastEnding(
  ctx: BroadcasterContext,
): Promise<string | null> {
  try {
    // Skip identity lazy-create here — `stream.offline` for a
    // streamer who never came online (in our economy's view) means
    // there's nothing to mark ending.
    const admin = createServiceClient();
    const { data: identityRow } = await admin
      .from("gs_identities")
      .select("id")
      .eq("platform", "twitch")
      .eq("platform_id", ctx.twitchUserId)
      .maybeSingle();
    if (!identityRow) return null;

    const { data: communityRow } = await admin
      .from("gs_communities")
      .select("id")
      .eq("owner_identity_id", (identityRow as { id: string }).id)
      .maybeSingle();
    if (!communityRow) return null;

    const stream = await getActiveStreamForCommunity(
      (communityRow as { id: string }).id,
    );
    if (!stream) return null;
    if (stream.status !== "open") return stream.id;
    const updated = await markStreamEnding({ streamId: stream.id });
    return updated?.id ?? null;
  } catch (err) {
    console.error("[economy/twitchBootstrap] markBroadcastEnding failed", {
      twitchUserId: ctx.twitchUserId,
      err: err instanceof Error ? err.message : err,
    });
    return null;
  }
}
