/**
 * `!poll` + `!vote` — live polling in Twitch chat (GS Pro).
 *
 *   !poll <question> | option 1 | option 2 [| ...]   (broadcaster / mods)
 *   !poll close                                       (broadcaster / mods)
 *   !vote <number>                                    (everyone)
 *
 * Creating/closing is Pro-gated (silent for non-Pro, like `!spin`). Voting is
 * free and SILENT — a poll can draw a lot of `!vote`s and we won't spam chat;
 * the tally shows on /live + the overlay. One vote per viewer (their
 * gs_identity), changeable while the poll allows it.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  castVote,
  closePoll,
  createPoll,
  getOpenPollForCommunity,
  isPollError,
  tally,
} from "@/lib/polls/store";
import type { PollOption, PollTally } from "@/lib/polls/types";
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

function reply(cmd: CmdContext, message: string): Promise<unknown> {
  return sendChatMessage({
    broadcasterId: cmd.broadcasterTwitchId,
    senderId: cmd.botTwitchId,
    message,
  });
}

async function isProOwner(userId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("users")
    .select("subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  const p = data as { subscription_tier: string | null; role: string | null } | null;
  return effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) === "pro";
}

function winner(options: PollOption[], t: PollTally): { label: string; pct: number } | null {
  let best: PollOption | null = null;
  let bestCount = -1;
  for (const o of options) {
    const c = t.byOption[o.id] ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = o;
    }
  }
  if (!best || bestCount <= 0) return null;
  return { label: best.label, pct: t.total ? Math.round((bestCount / t.total) * 100) : 0 };
}

registerCommand({
  name: "poll",
  trigger: ["poll"],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "broadcaster",
  family: "community",
  minAuthority: "mod",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 5,
  help: {
    summary: "Run a live poll your viewers vote on.",
    usage: "!poll <question> | option 1 | option 2  ·  !poll close",
    detail:
      "Opens a poll (2–8 options, split with |). Viewers vote with !vote <number>. It shows on your /live page and OBS overlay. !poll close ends it and announces the winner. GS Pro.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    // Pro gate — silent for non-Pro so a stray !poll never spams chat.
    if (!(await isProOwner(cmd.userId))) return { ok: false, reason: "not_pro" };

    const arg = cmd.args.trim();
    if (!arg || arg.toLowerCase() === "help") {
      await reply(cmd, "📊 !poll <question> | option 1 | option 2  —  or  !poll close");
      return { ok: true };
    }

    if (arg.toLowerCase() === "close") {
      const open = await getOpenPollForCommunity(econ.community.id);
      if (!open) {
        await reply(cmd, "📊 No open poll to close.");
        return { ok: true };
      }
      const closed = await closePoll(open.id);
      if (isPollError(closed)) {
        await reply(cmd, "📊 Couldn't close the poll — try again.");
        return { ok: false, reason: closed.error };
      }
      const t = await tally(open.id);
      const w = winner(open.options, t);
      await reply(
        cmd,
        w
          ? `📊 Poll closed — winner: ${w.label} (${w.pct}%) from ${t.total} vote${t.total === 1 ? "" : "s"}.`
          : `📊 Poll closed with ${t.total} vote${t.total === 1 ? "" : "s"}.`,
      );
      return { ok: true };
    }

    const parts = arg.split("|").map((s) => s.trim()).filter(Boolean);
    const question = parts[0];
    const options = parts.slice(1);
    if (!question || options.length < 2) {
      await reply(cmd, "📊 Need a question and at least two options: !poll Which track? | Rainbow Road | Baby Park");
      return { ok: true };
    }

    const result = await createPoll({
      communityId: econ.community.id,
      question,
      options,
      open: true,
      sessionId: econ.activeSessionId,
      createdBy: cmd.userId,
    });
    if (isPollError(result)) {
      await reply(cmd, "📊 Couldn't open the poll — try again.");
      return { ok: false, reason: result.error };
    }
    const optList = result.options.map((o) => `${o.id}) ${o.label}`).join("  ");
    await reply(cmd, `📊 Poll open — ${result.question}  ▸  ${optList}  ·  vote with !vote <number>`);
    return { ok: true };
  },
});

registerCommand({
  name: "vote",
  trigger: ["vote"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "viewer",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 2,
  help: {
    summary: "Vote in the current poll.",
    usage: "!vote <number>",
    detail: "Casts your vote for an option number in the open poll. Vote again to change it while the poll is open.",
  },
  handler: async (cmd) => {
    const optionId = cmd.args.trim().replace(/[^0-9]/g, "");
    if (!optionId) return { ok: false, reason: "no_option" };
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const open = await getOpenPollForCommunity(econ.community.id);
    if (!open) return { ok: false, reason: "no_open_poll" }; // silent — nothing to vote on
    const result = await castVote({ pollId: open.id, optionId, gsIdentityId: econ.caller.id });
    // Silent either way — the tally is the feedback, not a chat reply.
    return { ok: result.ok, reason: result.ok ? undefined : result.reason };
  },
});

export const __POLL_COMMANDS_REGISTERED__ = true;
