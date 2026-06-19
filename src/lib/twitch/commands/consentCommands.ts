/**
 * Consent commands — viewers opt themselves into / out of multi-
 * party events that can take tokens away from them.
 *
 *   - `!opt-in`   grants consent for this community (idempotent)
 *   - `!opt-out`  revokes (soft delete via revoked_at)
 *   - `!consent`  shows current state, no side effects
 *
 * The rule (see consent.ts header and the SQL design note):
 *
 *   Positive-only multi-party events (`!happy_hour`, etc.) fire for
 *   any recently-active viewer — opting in is unnecessary. The opt-
 *   in matters ONLY for events that can subtract tokens from
 *   partners (`!tornado`, `!storm_surge`). Without consent, the
 *   engine's partner resolver filters the viewer out of the
 *   candidate pool for those events.
 *
 * All three commands route through the existing economy context
 * resolver, which creates the caller's identity on first contact —
 * a brand-new chatter can `!opt-in` and immediately be eligible
 * without a prior interaction.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import {
  grantConsent,
  hasConsent,
  revokeConsent,
} from "@/lib/economy/events/consent";
import { resolveEconomyContext } from "./economy";
import { registerCommand, type CmdContext } from "./registry";
import type { ShuffleContext } from "./shuffle";

function asShuffleCtx(cmd: CmdContext): ShuffleContext {
  return {
    userId: cmd.userId,
    broadcasterTwitchId: cmd.broadcasterTwitchId,
    senderTwitchId: cmd.senderTwitchId,
    senderLogin: cmd.senderLogin,
    senderDisplayName: cmd.senderDisplayName,
    isBroadcaster: cmd.isBroadcaster,
    botTwitchId: cmd.botTwitchId,
    overlayToken: cmd.overlayToken ?? null,
  };
}

async function postChat(cmd: CmdContext, message: string): Promise<void> {
  await sendChatMessage({
    broadcasterId: cmd.broadcasterTwitchId,
    senderId: cmd.botTwitchId,
    message,
  });
}

// ---------------------------------------------------------------------------
// !opt-in
// ---------------------------------------------------------------------------

registerCommand({
  name: "opt-in",
  trigger: ["opt-in"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  // No moduleKey — consent commands are foundational, never
  // disable-able by the streamer.
  category: "consent",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 5,
  help: {
    summary: "Opt into multi-party events that can take tokens.",
    usage: "!opt-in",
    detail:
      "Adds you to the pool for events like !tornado that can subtract tokens from partners. Positive-only events fire for any active viewer regardless of opt-in.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const result = await grantConsent({
      identityId: econ.caller.id,
      communityId: econ.community.id,
      source: "chat",
    });
    if (!result.ok) {
      await postChat(
        cmd,
        `🎲 @${cmd.senderDisplayName}, couldn't save opt-in (${result.reason}). Try again?`,
      );
      return { ok: false, reason: result.reason };
    }
    if (result.already) {
      await postChat(
        cmd,
        `✅ @${cmd.senderDisplayName}, you're already opted into multi-party events here.`,
      );
    } else {
      await postChat(
        cmd,
        `✅ @${cmd.senderDisplayName} is now in for multi-party events! Use !opt-out anytime to leave.`,
      );
    }
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// !opt-out
// ---------------------------------------------------------------------------

registerCommand({
  name: "opt-out",
  trigger: ["opt-out"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "consent",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 5,
  help: {
    summary: "Opt out of multi-party events that can take tokens.",
    usage: "!opt-out",
    detail:
      "Removes you from the pool for events like !tornado. Positive-only events still apply to any active viewer.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const result = await revokeConsent({
      identityId: econ.caller.id,
      communityId: econ.community.id,
    });
    if (!result.ok) {
      await postChat(
        cmd,
        `🎲 @${cmd.senderDisplayName}, couldn't save opt-out (${result.reason}). Try again?`,
      );
      return { ok: false, reason: result.reason };
    }
    if (result.already) {
      await postChat(
        cmd,
        `👋 @${cmd.senderDisplayName}, you weren't opted in. Nothing to revoke.`,
      );
    } else {
      await postChat(
        cmd,
        `👋 @${cmd.senderDisplayName} opted out of token-affecting multi-party events. Free-token events still apply.`,
      );
    }
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// !consent — read-only status
// ---------------------------------------------------------------------------

registerCommand({
  name: "consent",
  trigger: ["consent"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "consent",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 15,
  help: {
    summary: "Check your multi-party event opt-in status.",
    usage: "!consent",
    detail:
      "Shows whether you're opted into token-affecting multi-party events for this community. Use !opt-in / !opt-out to change.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const consented = await hasConsent({
      identityId: econ.caller.id,
      communityId: econ.community.id,
    });
    if (consented) {
      await postChat(
        cmd,
        `✅ @${cmd.senderDisplayName} is opted in for multi-party events. Use !opt-out to leave.`,
      );
    } else {
      await postChat(
        cmd,
        `⛔ @${cmd.senderDisplayName} is NOT opted in for token-affecting events. Use !opt-in to join.`,
      );
    }
    return { ok: true };
  },
});

// Side-effect import marker — matches the eventCommands pattern.
export const __CONSENT_COMMANDS_REGISTERED__ = true;
