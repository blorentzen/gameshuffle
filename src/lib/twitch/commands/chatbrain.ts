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
 *   !cb start [boards] [seconds]                   mods, GS Pro: a game of Chat
 *                                                  plays (1-5 boards, guesses of
 *                                                  15/30/45/60s)
 *   !cb time <15|30|45|60>  ·  !cb next            mods: guess length, next board
 *   !cb accept [answer]  ·  !cb reject             mods: overrule the last result
 *                                                  (within 30s)
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
import {
  endGame,
  gameStatusLine,
  getRunningGame,
  lockWindow,
  nextBoard,
  overrule,
  setGuessTime,
  startGame,
  tickGame,
} from "@/lib/chatbrain/streamGame";
import { BOARDS_PER_GAME, GUESS_SECONDS } from "@/lib/chatbrain/streamRules";
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

/** Why a game control didn't happen, as a chat line. */
const GAME_ERRORS: Record<string, string> = {
  game_running: "🧠 A Chat Brain game is already running. !cb end finishes it.",
  window_open: "🧠 A question is already open. Close it first with !cb lock.",
  no_boards: "🧠 There are no Chat Brain boards to play yet. Run a survey with !cb ask to help build some.",
  not_ready: "🧠 Chat Brain games aren't open yet. Check back soon.",
  no_game: "🧠 No Chat Brain game is running. Start one with !cb start.",
  no_window: "🧠 No guess is running right now.",
  not_started: "🧠 The next guess hasn't started yet.",
  too_late: "🧠 Overrules only work on the last result, within 30 seconds.",
  board_over: "🧠 That board is already over.",
  already_hit: "🧠 That one already counted.",
  not_a_hit: "🧠 Only a hit can be overruled with !cb reject.",
  no_match: "🧠 That isn't one of the hidden answers. Try !cb accept <answer on the board>.",
  bad_time: `🧠 Guess time can be ${GUESS_SECONDS.join(", ")} seconds.`,
  busy: "🧠 One moment, the last guess is still being scored.",
  failed: "🧠 That didn't work. Try again.",
};

/** `!cb start 3 45`, `!cb start boards 3 time 45s`: the board count and the guess time, in any order. */
function parseStart(words: string[]): { boards?: number; seconds?: number } {
  const out: { boards?: number; seconds?: number } = {};
  let expect: "boards" | "seconds" | null = null;
  for (const w of words.map((x) => x.toLowerCase())) {
    if (w === "boards" || w === "board") { expect = "boards"; continue; }
    if (w === "time" || w === "secs" || w === "seconds") { expect = "seconds"; continue; }
    const n = Number(w.replace(/s$/, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (expect === "boards" || (!expect && n <= BOARDS_PER_GAME.max && out.boards === undefined && !w.endsWith("s"))) out.boards = n;
    else out.seconds = n;
    expect = null;
  }
  return out;
}

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
    usage: "!cb  ·  !a <answer>  ·  mods: !cb ask [seconds] [category or your own question]  ·  !cb start [boards] [seconds]  ·  !cb next  ·  !cb lock  ·  !cb end",
    detail: `Mods open a survey with !cb ask (${SURVEY_SECONDS.min}-${SURVEY_SECONDS.max} seconds, default ${SURVEY_SECONDS.default}). A category, or nothing, asks a GameShuffle question; your own question needs GS Pro and chat sees its top answers at the end.`,
  },
  handler: async (cmd) => {
    const channel = channelOf(cmd);
    if (!channel) return { ok: false, reason: "no_channel" };
    const arg = cmd.args.trim();
    const [first, ...rest] = arg.split(/\s+/);
    const sub = (first ?? "").toLowerCase();

    const GAME_SUBS = ["start", "time", "next", "accept", "reject"];
    const needsCommunity = !arg || sub === "help" || sub === "ask" || sub === "lock" || sub === "end" || GAME_SUBS.includes(sub);
    const econ = needsCommunity ? await resolveEconomyContext(asShuffleCtx(cmd)) : null;
    const running = econ ? await getRunningGame(econ.community.id).then((g) => (g ? tickGame(g) : null)).catch(() => null) : null;
    const game = running?.status === "playing" ? running : null;

    if (!arg || sub === "help") {
      await tickChannel(channel);
      await cmd.reply(game ? await gameStatusLine(game.id) : await statusLine(channel));
      return { ok: true };
    }

    if (sub === "ask") {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      if (!econ) return { ok: false, reason: "no_economy" };
      if (game) {
        await cmd.reply("🧠 A Chat Brain game is running. Finish it first with !cb end.");
        return { ok: false, reason: "game_running" };
      }
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

    if (game && (sub === "lock" || sub === "end")) {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      const r = sub === "lock" ? await lockWindow(game.id) : await endGame(game.id);
      if (!r.ok) await cmd.reply(GAME_ERRORS[r.error] ?? GAME_ERRORS.failed);
      return { ok: r.ok, reason: r.ok ? undefined : r.error };
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

    if (sub === "start") {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      if (!econ) return { ok: false, reason: "no_economy" };
      if (!(await isProUser(cmd.userId))) {
        await cmd.reply("🧠 Chat Brain games on stream are part of GS Pro. Surveys (!cb ask) are free.");
        return { ok: false, reason: "not_pro" };
      }
      await tickChannel(channel);
      const r = await startGame({ communityId: econ.community.id, hostUserId: cmd.userId, broadcasterId: channel, ...parseStart(rest) });
      if (!r.ok) await cmd.reply(GAME_ERRORS[r.error] ?? GAME_ERRORS.failed);
      return { ok: r.ok, reason: r.ok ? undefined : r.error };
    }

    if (GAME_SUBS.includes(sub)) {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      if (!game) {
        await cmd.reply(GAME_ERRORS.no_game);
        return { ok: false, reason: "no_game" };
      }
      const r = sub === "time" ? await setGuessTime(game.id, Number((rest[0] ?? "").replace(/s$/i, "")))
        : sub === "next" ? await nextBoard(game.id)
        : await overrule(game.id, sub === "accept" ? "accept" : "reject", rest.join(" ").trim() || undefined);
      if (!r.ok) await cmd.reply(GAME_ERRORS[r.error] ?? GAME_ERRORS.failed);
      else if (r.message && sub === "time") await cmd.reply(`🧠 ${r.message}`);
      return { ok: r.ok, reason: r.ok ? undefined : r.error };
    }

    if (sub === "hide" || sub === "merge") {
      if (isMod(cmd)) await cmd.reply("🧠 Fixing survey groups live is coming soon.");
      return { ok: false, reason: "not_built" };
    }

    // `!cb <answer>` (the fast lane usually takes these first).
    return answer(cmd, arg);
  },
});

export const __CHATBRAIN_COMMANDS_REGISTERED__ = true;
