/**
 * Chat Brain in chat (specs/gs-originals-chat-brain-stream.md).
 *
 *   !a <answer>  (also !answer, or !cb <answer>)   everyone; silent
 *   !cb                                            what's open and how to play
 *   !cb ask [seconds] [category | own question]   mods: open a survey (30-180s,
 *                                                  default 60). A category or
 *                                                  nothing asks a public
 *                                                  question (free); your own
 *                                                  question needs GS Pro
 *   !cb lock  /  !cb end                           mods: close it now
 *
 * On Twitch, answers normally never reach this file: the webhook fast lane
 * (answerFromChat + recordGuess) takes them first, skipping the dispatcher and
 * cooldowns. These handlers cover other platforms and the fallback.
 */

import "server-only";
import { isProUser } from "@/lib/subscription-server";
import {
  SURVEY_SECONDS,
  closeWindow,
  openSurvey,
  openWindowFor,
  recordGuess,
  statusLine,
  tickChannel,
} from "@/lib/chatbrain/stream";
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

function channelOf(cmd: CmdContext): string {
  return cmd.broadcasterTwitchId || cmd.broadcasterPlatformId || "";
}

async function answer(cmd: CmdContext, raw: string): Promise<{ ok: boolean; reason?: string }> {
  const channel = channelOf(cmd);
  if (!channel || !raw.trim()) return { ok: false, reason: "empty" };
  const r = await recordGuess({
    broadcasterId: channel,
    platform: cmd.platform === "youtube" ? "youtube" : "twitch",
    viewer: cmd.senderTwitchId,
    name: cmd.senderDisplayName,
    raw,
  });
  return { ok: r === "saved", reason: r === "saved" ? undefined : r };
}

const isMod = (cmd: CmdContext) => cmd.isBroadcaster || cmd.isModerator;

registerCommand({
  name: "a",
  trigger: ["a", "answer"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "viewer",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 0,
  help: {
    summary: "Answer the open Chat Brain question.",
    usage: "!a <your answer>",
    detail: "Say the first thing that comes to mind. One answer each; answer again to change it while the question is open.",
  },
  handler: async (cmd) => answer(cmd, cmd.args),
});

registerCommand({
  name: "cb",
  trigger: ["cb", "chatbrain"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "viewer",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 3,
  help: {
    summary: "Chat Brain: answer survey questions and guess what most people said.",
    usage: "!cb  ·  !a <answer>  ·  mods: !cb ask [seconds] [category or your own question]  ·  !cb lock",
    detail: `Mods open a survey with !cb ask (${SURVEY_SECONDS.min}-${SURVEY_SECONDS.max} seconds, default ${SURVEY_SECONDS.default}). A category, or nothing, asks a GameShuffle question; your own question needs GS Pro and chat sees its top answers at the end.`,
  },
  handler: async (cmd) => {
    const channel = channelOf(cmd);
    if (!channel) return { ok: false, reason: "no_channel" };
    const arg = cmd.args.trim();
    const [first, ...rest] = arg.split(/\s+/);
    const sub = (first ?? "").toLowerCase();

    if (!arg || sub === "help") {
      await tickChannel(channel);
      await cmd.reply(await statusLine(channel));
      return { ok: true };
    }

    if (sub === "ask") {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      const econ = await resolveEconomyContext(asShuffleCtx(cmd));
      if (!econ) return { ok: false, reason: "no_economy" };
      await tickChannel(channel);
      const r = await openSurvey({
        communityId: econ.community.id,
        broadcasterId: channel,
        ownerUserId: cmd.userId,
        arg: rest.join(" "),
        isPro: await isProUser(cmd.userId),
      });
      if (!r.ok) {
        const why: Record<string, string> = {
          window_open: "🧠 A question is already open. Close it first with !cb lock.",
          no_questions: "🧠 No GameShuffle questions are open right now. Ask your own: !cb ask <your question> (GS Pro).",
          not_pro: "🧠 Asking your own question needs GS Pro. !cb ask on its own (or with a category like food or gaming) asks a GameShuffle question.",
          bad_question: "🧠 Questions need to be 8 to 140 characters.",
          blocked: "🧠 That question can't be used. Try another.",
          not_ready: "🧠 Chat Brain isn't open yet. Check back soon.",
          failed: "🧠 Couldn't open the question. Try again.",
        };
        await cmd.reply(why[r.error]);
        return { ok: false, reason: r.error };
      }
      await cmd.reply(`🧠 Chat Brain survey: ${r.prompt.text}  ▸  answer with !a <your answer>. You have ${r.window.seconds} seconds!`);
      return { ok: true };
    }

    if (sub === "lock" || sub === "end") {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      const open = await openWindowFor(channel, { fresh: true });
      if (!open) {
        await cmd.reply("🧠 Nothing is open.");
        return { ok: true };
      }
      await closeWindow(open.id);
      return { ok: true };
    }

    if (["start", "time", "next", "accept", "reject", "hide", "merge"].includes(sub)) {
      if (isMod(cmd)) await cmd.reply("🧠 Chat Brain games on stream are coming soon. For now: !cb ask to run a survey.");
      return { ok: false, reason: "not_built" };
    }

    // `!cb <answer>` (the fast lane usually takes these first).
    return answer(cmd, arg);
  },
});

export const __CHATBRAIN_COMMANDS_REGISTERED__ = true;
