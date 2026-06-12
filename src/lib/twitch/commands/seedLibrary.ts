/**
 * Built-in seed library — Spec 03 §2.1.
 *
 * Trivial commands that every community ships with by default:
 *
 *   - !roll [min-max]   → random integer in range (default 1-100)
 *   - !choose a | b | c → pick one
 *   - !8ball <q>        → canned answer
 *
 * The streamer-overridable seeds (`!socials`, `!discord`, `!youtube`,
 * `!so`, `!uptime`, `!followage`, `!accountage`) are loaded per-
 * community from `gs_custom_commands` because their response is
 * stream-state-aware (uptime, followage) or community-configurable
 * (socials URL). The custom-commands engine (M2's other half) ships
 * them as defaults at community-creation time.
 *
 * The three commands HERE are pure — no DB, no Helix, no community
 * state — so they live as built-in registrations.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { registerCommand } from "./registry";

const EIGHTBALL_ANSWERS = [
  "It is certain.",
  "Without a doubt.",
  "You may rely on it.",
  "Yes, definitely.",
  "Most likely.",
  "Outlook good.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful.",
] as const;

// ---------------------------------------------------------------------------
// !roll
// ---------------------------------------------------------------------------

registerCommand({
  name: "roll",
  trigger: ["roll"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  moduleKey: "seed_library",
  category: "social",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 3,
  help: {
    summary: "Roll a random integer.",
    usage: "!roll [min-max]",
    detail: "Defaults to 1-100. Pass `!roll 1-6` for a die.",
  },
  handler: async (cmd) => {
    const range = parseRollArgs(cmd.args);
    const result = randomInt(range.min, range.max);
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: `🎲 @${cmd.senderDisplayName} rolled ${result} (${range.min}-${range.max}).`,
    });
    return { ok: true };
  },
});

function parseRollArgs(args: string): { min: number; max: number } {
  const trimmed = args.trim();
  if (!trimmed) return { min: 1, max: 100 };

  // Accept "N-M", "N M", or single "M" (1..M).
  const dash = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (dash) {
    return normalizeRange(Number(dash[1]), Number(dash[2]));
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return normalizeRange(Number(parts[0]), Number(parts[1]));
  }
  if (/^\d+$/.test(trimmed)) {
    return normalizeRange(1, Number(trimmed));
  }
  return { min: 1, max: 100 };
}

function normalizeRange(a: number, b: number): { min: number; max: number } {
  const min = Math.max(0, Math.min(a, b));
  const max = Math.max(0, Math.max(a, b));
  return min === max ? { min, max: min + 1 } : { min, max };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// !choose
// ---------------------------------------------------------------------------

registerCommand({
  name: "choose",
  trigger: ["choose"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  moduleKey: "seed_library",
  category: "social",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 3,
  help: {
    summary: "Pick one option at random.",
    usage: "!choose a | b | c",
  },
  handler: async (cmd) => {
    const options = cmd.args
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length < 2) {
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: `🎲 @${cmd.senderDisplayName} usage: !choose a | b | c`,
      });
      return { ok: false, reason: "too_few_options" };
    }
    const pick = options[randomInt(0, options.length - 1)];
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: `🎲 @${cmd.senderDisplayName} I choose: ${pick}`,
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// !8ball
// ---------------------------------------------------------------------------

registerCommand({
  name: "8ball",
  trigger: ["8ball"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  moduleKey: "seed_library",
  category: "social",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 3,
  help: {
    summary: "Ask the magic 8-ball a question.",
    usage: "!8ball <question>",
  },
  handler: async (cmd) => {
    if (!cmd.args.trim()) {
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: `🎲 @${cmd.senderDisplayName} ask a question after !8ball.`,
      });
      return { ok: false, reason: "missing_question" };
    }
    const answer = EIGHTBALL_ANSWERS[randomInt(0, EIGHTBALL_ANSWERS.length - 1)];
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: `🎱 @${cmd.senderDisplayName} ${answer}`,
    });
    return { ok: true };
  },
});

export const __SEEDED__ = true;
