/**
 * `!engagement` — viewers check their own engagement score in this
 * community / session.
 *
 * Phase 1 keeps the UX simple: post the total + a breakdown by
 * signal type. No tiers, no comparisons to other viewers, no
 * leaderboard. Once we have real signal data flowing, we can layer
 * those views on without changing the command's grammar.
 *
 * Scope: defaults to the active session (the natural "what have I
 * done THIS stream?" frame). When no session is active, falls back
 * to a 60-minute window so the command still returns something
 * meaningful off-stream.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import {
  getEngagementBreakdown,
  type SignalType,
} from "@/lib/engagement/signals";
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

const SIGNAL_LABEL: Record<SignalType, string> = {
  command_fired: "commands",
  event_fired: "events",
  social_action: "social",
  token_earned: "tokens earned",
  token_spent: "tokens spent",
};

/** Format a per-type breakdown into a compact chat line. Skips
 *  zero / missing buckets so the line stays readable. */
function formatBreakdown(
  byType: Partial<Record<SignalType, number>>,
): string {
  const order: SignalType[] = [
    "command_fired",
    "event_fired",
    "social_action",
    "token_earned",
    "token_spent",
  ];
  const parts: string[] = [];
  for (const t of order) {
    const v = byType[t];
    if (typeof v === "number" && v > 0) {
      parts.push(`${SIGNAL_LABEL[t]}: ${v}`);
    }
  }
  return parts.join(" · ");
}

registerCommand({
  name: "engagement",
  trigger: ["engagement"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "engagement",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 30,
  help: {
    summary: "Check your engagement score for this stream.",
    usage: "!engagement",
    detail:
      "Sums your weighted signals (commands, events, social actions) for the active session, or the last hour when off-stream. Higher = more active.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };

    const breakdown = await getEngagementBreakdown({
      identityId: econ.caller.id,
      communityId: econ.community.id,
      sessionId: econ.activeSessionId,
    });

    let message: string;
    if (breakdown.total === 0) {
      message = `📊 @${cmd.senderDisplayName} hasn't logged engagement yet${econ.activeSessionId ? " this session" : " in the last hour"} — fire a command or event to start the meter.`;
    } else {
      const breakdownText = formatBreakdown(breakdown.byType);
      const scope = econ.activeSessionId ? "this session" : "this hour";
      message = `📊 @${cmd.senderDisplayName} engagement (${scope}): ${breakdown.total}${breakdownText ? ` — ${breakdownText}` : ""}`;
    }
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message,
    });
    return { ok: true };
  },
});

export const __ENGAGEMENT_COMMAND_REGISTERED__ = true;
