/**
 * Chat Brain in chat (specs/gs-originals-chat-brain-stream.md).
 *
 *   !a <answer>  (also !answer, or !cb <answer>)   everyone; silent
 *   !cb                                            what's open and how to play
 *   !cb ask [seconds] [hidden] [category | own question]
 *                                                  mods: open a survey (30-180s,
 *                                                  default 60). A category or
 *                                                  nothing asks a public
 *                                                  question (free); your own
 *                                                  question needs GS Pro, shows
 *                                                  its answers live unless
 *                                                  "hidden", and becomes a board
 *   !cb hide <n>  ·  !cb merge <n> <m>             mods: fix a survey's groups by
 *                                                  their numbers on stream
 *   !cb lock  /  !cb end                           mods: close it now
 *   !cb start [boards] [seconds] [survey] [speed]  mods, GS Pro: a game of Chat
 *                                                  plays (1-5 boards, guesses of
 *                                                  15/30/45/60s; "survey" starts
 *                                                  with the board chat just made;
 *                                                  "speed" = the speed round: the
 *                                                  first to find each answer takes
 *                                                  it, 20s between finds)
 *   !cb time <15|30|45|60>  ·  !cb next            mods: guess length, next board
 *   !cb accept [answer]  ·  !cb reject             mods: overrule the last result
 *                                                  (within 30s)
 *   1v1 and Teams (started from the dashboard), mods:
 *   !cb play [side] <answer>                       enter what a side said (the
 *                                                  side only for the first
 *                                                  face-off answer)
 *   !cb trust chat|team  ·  !cb control <side>     "Trust chat?", who plays
 *   !cb undo                                       take back the last answer
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
import { hideSurveyGroup, latestSurveyBoard, mergeSurveyGroups } from "@/lib/chatbrain/survey";
import { controlFromChat, playFromChat, trustFromChat, undoLast } from "@/lib/chatbrain/streamVersus";
import { costreamControlFromChat } from "@/lib/chatbrain/streamCostream";
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
  use_undo: "🧠 In 1v1 and Teams, take back the last answer with !cb undo.",
  not_versus: "🧠 That's for 1v1 and Teams games. Start one from the Chat Brain tab.",
  round_over: "🧠 This round is over. !cb next starts the next one.",
  no_turn: "🧠 Nobody's answering right now.",
  chat_turn: "🧠 It's chat's last steal: chat answers with !a.",
  choose_first: "🧠 Trust chat? Pick first: !cb trust chat or !cb trust team.",
  pick_side: "🧠 Who answered first? !cb play <side> <answer>, with the side's name or 1 or 2.",
  empty_answer: "🧠 Add the answer: !cb play <answer>.",
  blocked: "🧠 That answer can't be used.",
  no_choice: "🧠 There's nothing to choose between right now.",
  has_control: "🧠 Someone already has control this round.",
  nothing_to_undo: "🧠 There's no answer to take back.",
  use_next: "🧠 Not in a co-stream. !cb next moves on to the next round.",
  speed_round: "🧠 Not in a speed round: answers count the moment someone finds them. !cb next moves on, !cb end finishes.",
};

/** `!cb start 3 45`, `!cb start boards 3 time 45s`, `!cb start survey`, `!cb start speed 3`: board count, guess time, whether to start on the survey's board and the speed round, in any order. */
function parseStart(words: string[]): { boards?: number; seconds?: number; survey?: boolean; speed?: boolean } {
  const out: { boards?: number; seconds?: number; survey?: boolean; speed?: boolean } = {};
  let expect: "boards" | "seconds" | null = null;
  for (const w of words.map((x) => x.toLowerCase())) {
    if (w === "survey" || w === "ours") { out.survey = true; continue; }
    if (w === "speed" || w === "fast") { out.speed = true; continue; }
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
  // One word plus an alias: as ["a","answer"] it was a two-word path that
  // `!a <answer>` never matched (Twitch only worked through the fast lane).
  trigger: ["a"],
  aliases: [["answer"]],
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
  // Was ["cb","chatbrain"], a two-word path, so `!cb ask/start/next` never reached here.
  trigger: ["cb"],
  aliases: [["chatbrain"]],
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
    usage: "!cb  ·  !a <answer>  ·  mods: !cb ask [seconds] [category or your own question]  ·  !cb start [boards] [seconds] [speed]  ·  !cb next  ·  !cb lock  ·  !cb end",
    detail: `Mods open a survey with !cb ask (${SURVEY_SECONDS.min}-${SURVEY_SECONDS.max} seconds, default ${SURVEY_SECONDS.default}). A category, or nothing, asks a GameShuffle question; your own question needs GS Pro and chat sees its top answers at the end.`,
  },
  handler: async (cmd) => {
    const channel = channelOf(cmd);
    if (!channel) return { ok: false, reason: "no_channel" };
    const arg = cmd.args.trim();
    const [first, ...rest] = arg.split(/\s+/);
    const sub = (first ?? "").toLowerCase();

    const GAME_SUBS = ["start", "time", "next", "accept", "reject", "play", "trust", "control", "undo"];
    const needsCommunity = !arg || sub === "help" || sub === "ask" || sub === "lock" || sub === "end" || sub === "hide" || sub === "merge" || GAME_SUBS.includes(sub);
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
      await cmd.reply(`🧠 Chat Brain survey: ${r.prompt.text}  ▸  answer with !a <your answer>. You have ${r.window.seconds} seconds!${r.prompt.own && r.style === "hidden" ? " Answers stay secret until we play the board." : ""}`);
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
      // A co-stream guest's chat sees the host's window, but only the host sets the pace.
      if (open && open.broadcasterId !== channel) {
        await cmd.reply("🧠 This is a co-stream: the host runs the game.");
        return { ok: false, reason: "costream_guest" };
      }
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
      const { survey, ...opts } = parseStart(rest);
      const first = survey ? await latestSurveyBoard(econ.community.id) : null;
      if (survey && !first) {
        await cmd.reply("🧠 There's no board from a survey yet. Ask your own question with !cb ask <question>, and with 10 or more answers it becomes a board.");
        return { ok: false, reason: "no_survey_board" };
      }
      const r = await startGame({ communityId: econ.community.id, hostUserId: cmd.userId, broadcasterId: channel, ...opts, first });
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
        : sub === "play" ? await playFromChat(game.id, rest.join(" "))
        : sub === "trust" ? await trustFromChat(game.id, rest[0] ?? "")
        : sub === "control" ? game.mode === "costream" ? await costreamControlFromChat(game.id, rest[0] ?? "") : await controlFromChat(game.id, rest[0] ?? "")
        : sub === "undo" ? await undoLast(game.id)
        : await overrule(game.id, sub === "accept" ? "accept" : "reject", rest.join(" ").trim() || undefined);
      if (!r.ok) await cmd.reply(GAME_ERRORS[r.error] ?? GAME_ERRORS.failed);
      else if (r.message && sub === "time") await cmd.reply(`🧠 ${r.message}`);
      return { ok: r.ok, reason: r.ok ? undefined : r.error };
    }

    if (sub === "hide" || sub === "merge") {
      if (!isMod(cmd)) return { ok: false, reason: "not_mod" };
      if (!econ) return { ok: false, reason: "no_economy" };
      const nums = rest.map((w) => Number(w.replace(/^#/, ""))).filter((n) => Number.isInteger(n) && n > 0);
      const why: Record<string, string> = {
        no_survey: "🧠 No survey is open.",
        closed: "🧠 That survey has closed.",
        not_found: "🧠 There's no group with that number on stream right now.",
        pick_two: "🧠 Merge needs two different groups: !cb merge <n> <m>.",
      };
      if (sub === "hide" ? nums.length !== 1 : nums.length < 2) {
        await cmd.reply(sub === "hide" ? "🧠 Hide a group by its number on stream: !cb hide 3" : "🧠 Merge groups by their numbers on stream: !cb merge 1 4 (4 goes into 1).");
        return { ok: false, reason: "usage" };
      }
      const r = sub === "hide"
        ? await hideSurveyGroup(econ.community.id, { n: nums[0] }, true)
        : await mergeSurveyGroups(econ.community.id, nums.map((n) => ({ n })));
      if (!r.ok) await cmd.reply(why[r.error] ?? GAME_ERRORS.failed);
      return { ok: r.ok, reason: r.ok ? undefined : r.error };
    }

    // `!cb <answer>` (the fast lane usually takes these first).
    return answer(cmd, arg);
  },
});

export const __CHATBRAIN_COMMANDS_REGISTERED__ = true;
