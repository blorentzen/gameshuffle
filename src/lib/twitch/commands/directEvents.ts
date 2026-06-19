/**
 * Direct-event dispatcher fallback.
 *
 * Last fallback in the chain (default-commands → mention-events →
 * direct-events → silent ignore). Handles non-mention events that
 * a streamer has flipped on for direct invocation — e.g. a `!tornado`
 * event the streamer enabled as a Mod+ chat command, separately
 * from any draw via `!chaos`.
 *
 * Resolution:
 *   1. Quick existence check (no community) — bail if no event with
 *      this key exists at all.
 *   2. Resolve econ → community + caller.
 *   3. Re-fetch with community id; engine applies the streamer
 *      override (enabled, trigger_directly, flavor_tmpl).
 *   4. Authority gate using the per-event `min_authority` (viewer /
 *      vip / mod / host). VIP+ semantic = "has VIP badge OR mod OR
 *      host".
 *   5. Fire the event through the engine. Partner resolution happens
 *      inside fireEvent — for non-mention modes it walks the
 *      `partner_mode` strategy (none / random_active / random_n /
 *      all_active) just like a draw.
 *
 * Authority and partner_mode interact deliberately:
 *   - `partner_mode=none` direct-fire: caller is the only target.
 *     A streamer could enable `!bless` as a Viewer-tier event so
 *     anyone can fire it on themselves.
 *   - `partner_mode=random_n` / `all_active` direct-fire: caller
 *     triggers a fanout to the consenting/active pool. Usually
 *     Mod+ since it can mass-affect tokens — but not enforced;
 *     admins/streamers set the gate.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { fireEvent, findDirectEventByKey } from "@/lib/economy/events/engine";
import { resolveEconomyContext } from "./economy";
import { checkChatAuthority } from "./authority";
import type { ParsedCommand } from "./parse";
import type { ShuffleContext } from "./shuffle";

interface DispatchInputs {
  command: ParsedCommand;
  userId: string;
  broadcasterTwitchId: string;
  botTwitchId: string;
  senderTwitchId: string;
  senderDisplayName: string;
  senderLogin: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  isVIP?: boolean;
  overlayToken?: string | null;
}

export async function tryFireDirectEvent(
  inputs: DispatchInputs,
): Promise<boolean> {
  if (inputs.command.path.length !== 1) return false;
  const eventKey = inputs.command.path[0].toLowerCase();
  if (!eventKey) return false;

  // Quick existence check — bail fast on triggers that don't match
  // any event in the catalog, regardless of the override layer.
  const platformEvent = await findDirectEventByKey(eventKey);
  if (!platformEvent) return false;

  const shuffleCtx: ShuffleContext = {
    userId: inputs.userId,
    broadcasterTwitchId: inputs.broadcasterTwitchId,
    botTwitchId: inputs.botTwitchId,
    senderTwitchId: inputs.senderTwitchId,
    senderDisplayName: inputs.senderDisplayName,
    senderLogin: inputs.senderLogin,
    isBroadcaster: inputs.isBroadcaster,
    overlayToken: inputs.overlayToken ?? null,
  };
  const econ = await resolveEconomyContext(shuffleCtx);
  if (!econ) return true;

  // Re-fetch with the community id so the streamer override is
  // applied. Returns null when the streamer turned `trigger_directly`
  // off for their community (or disabled the event entirely).
  const event = await findDirectEventByKey(eventKey, econ.community.id);
  if (!event) {
    // Streamer disabled — claim the chat message silently.
    return true;
  }

  if (
    !checkChatAuthority(event.min_authority, {
      isBroadcaster: inputs.isBroadcaster,
      isModerator: inputs.isModerator,
      isVIP: inputs.isVIP,
    })
  ) {
    return true; // silent — matches the registry-path auth gate UX
  }

  const fired = await fireEvent({
    surface: "chaos", // ignored when preselectedEvent is set
    gameKey: econ.activeGameSlug,
    actorIdentityId: econ.caller.id,
    actorDisplayName: econ.caller.display_name ?? inputs.senderDisplayName,
    streamerDisplayName: econ.streamerDisplayName,
    communityId: econ.community.id,
    streamId: econ.activeStreamId,
    sessionId: econ.activeSessionId,
    trigger: "chat",
    preselectedEvent: event,
    chatContext: {
      streamerUserId: inputs.userId,
      senderTwitchId: inputs.senderTwitchId,
      broadcasterTwitchId: inputs.broadcasterTwitchId,
      rawArgs: inputs.command.args,
    },
  });
  if (!fired.ok) {
    await sendChatMessage({
      broadcasterId: inputs.broadcasterTwitchId,
      senderId: inputs.botTwitchId,
      message: `🎲 !${eventKey} couldn't fire (${fired.reason}).`,
    });
    return true;
  }
  await sendChatMessage({
    broadcasterId: inputs.broadcasterTwitchId,
    senderId: inputs.botTwitchId,
    message: fired.flavor,
  });
  return true;
}
