/**
 * Mention-mode event fallback for the chat dispatcher.
 *
 * When the registry has no command matching `!hug`, this fallback
 * checks the event catalog for a row with `event_key='hug' AND
 * partner_mode='mention'`. If found, it resolves the caller's
 * @mention as the partner and fires the event via the engine.
 *
 * The mention-event pattern is what lets admins add new social
 * commands (like `!hug @user`, `!gift @user 5`) by adding rows to
 * `gs_events` without a code change. The dispatcher hot-loads from
 * DB on every miss, so a freshly-added event works in chat the
 * moment the admin saves it (no TTL).
 *
 * Wired in from `dispatch.ts` right before the "silent ignore" line.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import {
  fireEvent,
  findMentionEventByKey,
} from "@/lib/economy/events/engine";
import {
  resolveEconomyContext,
  lookupIdentityByTwitchLogin,
} from "./economy";
import type { ParsedCommand } from "./parse";
import type { ShuffleContext } from "./shuffle";

interface DispatchInputs {
  command: ParsedCommand;
  userId: string; // streamer's GS user id
  broadcasterTwitchId: string;
  botTwitchId: string;
  senderTwitchId: string;
  senderDisplayName: string;
  senderLogin: string;
  isBroadcaster: boolean;
  overlayToken?: string | null;
}

/**
 * Try to route an unmatched `![command]` as a mention-mode event.
 * Returns `true` when the fallback handled the message (whether
 * successfully or with a rejection chat reply), `false` when no
 * matching catalog row exists — the dispatcher then falls through
 * to its silent-ignore.
 */
export async function tryFireMentionEvent(
  inputs: DispatchInputs,
): Promise<boolean> {
  // Only single-segment commands map to mention events. `!gs foo`
  // shouldn't accidentally hit a mention event called `gs`.
  if (inputs.command.path.length !== 1) return false;
  const eventKey = inputs.command.path[0].toLowerCase();
  if (!eventKey) return false;

  // Two-step lookup: check existence first (cheap, no econ resolve
  // needed), then re-fetch with the community id once econ is
  // resolved to apply per-streamer overrides. Lets us bail fast
  // when the trigger doesn't match any event at all.
  const platformEvent = await findMentionEventByKey(eventKey);
  if (!platformEvent) return false;

  // The mention is the first token in args — strip the leading `@`
  // and lowercase to match the Twitch login format.
  const firstArg = inputs.command.args.trim().split(/\s+/)[0] ?? "";
  const partnerLogin = firstArg.replace(/^@/, "").toLowerCase();
  if (!partnerLogin) {
    await sendChatMessage({
      broadcasterId: inputs.broadcasterTwitchId,
      senderId: inputs.botTwitchId,
      message: `🎲 @${inputs.senderDisplayName}, !${eventKey} needs an @mention (e.g. !${eventKey} @viewer).`,
    });
    return true;
  }

  // Build the economy context (creates identities lazily). This is
  // the same path the !chaos/!random handlers use, so the actor's
  // first-touch grant fires correctly even when their very first
  // command is a mention event.
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
  if (!econ) {
    console.error("[mentionEvent] resolveEconomyContext returned null");
    return true;
  }

  // Re-fetch the event with the community id so any streamer
  // override applies. Returns null if the streamer disabled this
  // event for their community — we claim the chat message silently
  // so it doesn't fall through to a different fallback.
  const event = await findMentionEventByKey(eventKey, econ.community.id);
  if (!event) {
    return true;
  }

  // Self-mention guard — firing on yourself just confuses chat.
  if (partnerLogin === inputs.senderLogin.toLowerCase()) {
    await sendChatMessage({
      broadcasterId: inputs.broadcasterTwitchId,
      senderId: inputs.botTwitchId,
      message: `🎲 @${inputs.senderDisplayName}, can't !${eventKey} yourself.`,
    });
    return true;
  }

  const partner = await lookupIdentityByTwitchLogin(
    partnerLogin,
    inputs.userId,
  );
  if (!partner) {
    await sendChatMessage({
      broadcasterId: inputs.broadcasterTwitchId,
      senderId: inputs.botTwitchId,
      message: `🎲 @${inputs.senderDisplayName}, couldn't find @${partnerLogin}.`,
    });
    return true;
  }

  const fired = await fireEvent({
    surface: "chaos", // surface field is ignored when preselectedEvent is set
    gameKey: econ.activeGameSlug,
    actorIdentityId: econ.caller.id,
    actorDisplayName: econ.caller.display_name ?? inputs.senderDisplayName,
    partners: [
      {
        identityId: partner.id,
        displayName: partner.display_name ?? `@${partnerLogin}`,
      },
    ],
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
