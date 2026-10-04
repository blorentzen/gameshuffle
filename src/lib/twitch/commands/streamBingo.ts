/**
 * Stream Bingo in chat (GS Pro). Rides on the existing `!bingo` command: the
 * shared event board keeps `new` / `mark` / `clear`, and these subcommands run
 * the number game (broadcaster + mods):
 *
 *   !bingo start [pattern|series] [tokens] [prize text]
 *   !bingo call            call the next number
 *   !bingo auto <30-600>   call on a timer  ·  !bingo auto off
 *   !bingo end             end it with no winner
 *   !bingo status
 *
 * Viewers take cards and claim on /live; `!bingocard` links them there.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { isProUser } from "@/lib/subscription-server";
import { createServiceClient } from "@/lib/supabase/admin";
import { letterFor, type Pattern } from "@/lib/originals/bingo";
import { callNext, closeGame, getCurrentGame, getOpenGame, openGame, patternLabel, setAutoCall, tickAuto } from "@/lib/bingo/stream";
import { resolveEconomyContext } from "./economy";
import { registerCommand, type CmdContext } from "./registry";
import type { ShuffleContext } from "./shuffle";

export const STREAM_BINGO_SUBCOMMANDS = new Set(["start", "call", "auto", "end", "stop", "status"]);

const PATTERN_WORDS: Record<string, Pattern | "series"> = {
  line: "line", corners: "corners", corner: "corners", x: "x", frame: "frame", blackout: "blackout", full: "blackout", series: "series",
};

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
  return sendChatMessage({ broadcasterId: cmd.broadcasterTwitchId, senderId: cmd.botTwitchId, message });
}

async function liveLink(ownerUserId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("username").eq("id", ownerUserId).maybeSingle();
  const slug = (data as { username: string | null } | null)?.username;
  return slug ? `gameshuffle.co/live/${slug}` : "the GameShuffle live page";
}

/** Parses `[pattern|series] [tokens] [prize text]`. */
export function parseStart(rest: string[]): { pattern: Pattern | "series"; tokens: number; prizeText: string | null } {
  const words = [...rest];
  let pattern: Pattern | "series" = "line";
  if (words[0] && PATTERN_WORDS[words[0].toLowerCase()]) pattern = PATTERN_WORDS[words.shift()!.toLowerCase()];
  let tokens = 0;
  if (words[0] && /^\d+$/.test(words[0])) tokens = Math.min(100000, Number(words.shift()));
  const prizeText = words.join(" ").trim().slice(0, 140) || null;
  return { pattern, tokens, prizeText };
}

export async function handleStreamBingo(cmd: CmdContext): Promise<{ ok: boolean; reason?: string }> {
  const econ = await resolveEconomyContext(asShuffleCtx(cmd));
  if (!econ) return { ok: false, reason: "no_economy" };
  if (!(await isProUser(cmd.userId))) return { ok: false, reason: "not_pro" };
  const [sub, ...rest] = cmd.args.trim().split(/\s+/);
  const action = sub.toLowerCase();
  const communityId = econ.community.id;

  if (action === "start") {
    const { pattern, tokens, prizeText } = parseStart(rest);
    const r = await openGame({ communityId, createdBy: cmd.userId, pattern, prizeTokens: tokens, prizeText, sessionId: econ.activeSessionId });
    if (!r.ok) {
      await reply(cmd, r.error === "already_open" ? "🔢 A bingo game is already running. !bingo end first." : "🔢 Couldn't start bingo. Try again.");
      return { ok: false, reason: r.error };
    }
    const g = r.value;
    const prize = [g.prizeTokens ? `${g.prizeTokens} tokens` : null, g.prizeText].filter(Boolean).join(" + ");
    const series = g.seriesStep ? ` (series game ${g.seriesStep})` : "";
    await reply(cmd, `🔢 Bingo is on! To win: ${patternLabel(g.pattern)}${series}.${prize ? ` Prize: ${prize}.` : ""} Grab a card at ${await liveLink(cmd.userId)}`);
    return { ok: true };
  }

  const open = await getOpenGame(communityId);
  if (action === "status") {
    const g = open ? await tickAuto(open) : await getCurrentGame(communityId);
    if (!g) await reply(cmd, "🔢 No bingo game running. Start one with !bingo start [pattern] [tokens] [prize]");
    else if (g.status === "won") await reply(cmd, `🔢 Last game won by ${g.winnerName ?? "someone"} after ${g.called.length} calls.`);
    else await reply(cmd, `🔢 Bingo: ${patternLabel(g.pattern)} to win, ${g.called.length} of 75 called${g.callInterval ? `, a call every ${g.callInterval}s` : ""}.`);
    return { ok: true };
  }
  if (!open) {
    await reply(cmd, "🔢 No bingo game running. Start one with !bingo start [pattern] [tokens] [prize]");
    return { ok: true };
  }

  if (action === "call") {
    const next = await callNext(open);
    if (!next) {
      await reply(cmd, open.called.length >= 75 ? "🔢 All 75 numbers are out. !bingo end to finish." : "🔢 That call didn't go through. Try again.");
      return { ok: true };
    }
    const n = next.called[next.called.length - 1];
    await reply(cmd, `🔢 ${letterFor(n)} ${n}  (${next.called.length} of 75)`);
    return { ok: true };
  }
  if (action === "auto") {
    const arg = (rest[0] ?? "").toLowerCase();
    const seconds = arg === "off" || arg === "0" ? null : Number(arg);
    if (seconds !== null && !(seconds >= 30 && seconds <= 600)) {
      await reply(cmd, "🔢 !bingo auto <30-600> for a call every so many seconds, or !bingo auto off");
      return { ok: true };
    }
    const r = await setAutoCall(open.id, seconds);
    await reply(cmd, !r.ok ? "🔢 Couldn't change the timer." : seconds ? `🔢 Calling a number every ${seconds}s. Calls show on the live page and overlay.` : "🔢 Timer off. Call numbers with !bingo call");
    return { ok: r.ok };
  }
  // end / stop
  const r = await closeGame(open.id);
  await reply(cmd, r.ok ? `🔢 Bingo ended with no winner after ${open.called.length} calls.` : "🔢 Couldn't end the game. Try again.");
  return { ok: r.ok };
}

registerCommand({
  name: "bingocard",
  trigger: ["bingocard"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "viewer",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 15,
  help: {
    summary: "Where to get a Stream Bingo card.",
    usage: "!bingocard",
    detail: "Links the live page, where you take a card, mark your numbers and call Bingo!",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const open = await getOpenGame(econ.community.id);
    if (!open) return { ok: false, reason: "no_game" }; // silent: nothing running
    await reply(cmd, `🔢 Get your card at ${await liveLink(cmd.userId)} (${patternLabel(open.pattern)} to win)`);
    return { ok: true };
  },
});

