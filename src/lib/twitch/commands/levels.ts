/**
 * The level queue in chat (levels picks 2026-11-11, pick 16A; GS Pro): viewers `!add <code>`, `!position` and
 * `!remove`; mods and the streamer `!level next|random|skip|open|close|clear` (and `!remove @name`). Quiet unless the
 * streamer has GS Pro and has set up the queue (opened it once from the dashboard or chat), so a channel that never
 * uses it keeps its own `!add` (the commands also step aside for a custom command with the same name).
 * Loaded on use from registrations (the store is server-only).
 */

import { addFromChat, chatQueueReady, positionFromChat, queueAct, removeFromChat, removeNamed } from "@/lib/levels/store";
import { levelsReady } from "@/lib/levels/ready";
import { isProUser } from "@/lib/subscription-server";
import { readResult } from "@/lib/levels/rules";

export type LevelCommand = "add" | "position" | "remove" | "level";

export interface LevelChatContext {
  /** The streamer. */
  userId: string;
  platform: "twitch" | "youtube" | "discord";
  senderId: string;
  senderName: string;
  /** The streamer or a mod. */
  canRun: boolean;
  reply: (message: string) => Promise<void>;
}

const LEVEL_HELP = "🎮 !level next · !level random · !level skip · !level open · !level close · !level clear";

export async function handleLevelCommand(ctx: LevelChatContext, which: LevelCommand, args: string): Promise<void> {
  const sender = { platform: ctx.platform === "youtube" ? "youtube" : "twitch", id: ctx.senderId, name: ctx.senderName };
  const a = args.trim();

  if (which === "level") {
    if (!ctx.canRun) return;
    // `!level open` is how a streamer can start from chat, so it only needs the tables and GS Pro, not a queue yet.
    if (!(await levelsReady()) || !(await isProUser(ctx.userId).catch(() => false))) return;
    const [verb, ...rest] = a.toLowerCase().split(/\s+/);
    const result = readResult(rest.join(" "));
    const act =
      verb === "next" ? { action: "next" as const, result } :
      verb === "random" ? { action: "random" as const, result } :
      verb === "skip" ? { action: "skip" as const } :
      verb === "open" ? { action: "open" as const } :
      verb === "close" ? { action: "close" as const } :
      verb === "clear" ? { action: "clear" as const } : null;
    if (!act) {
      await ctx.reply(LEVEL_HELP);
      return;
    }
    const r = await queueAct(ctx.userId, act);
    if (r.ok && r.line) await ctx.reply(r.line);
    return;
  }

  if (!(await chatQueueReady(ctx.userId))) return;
  if (which === "add") {
    await ctx.reply(await addFromChat(ctx.userId, sender, a));
    return;
  }
  if (which === "position") {
    await ctx.reply(await positionFromChat(ctx.userId, sender));
    return;
  }
  // !remove: your own level, or a mod's `!remove @name`.
  if (ctx.canRun && a.startsWith("@")) {
    await ctx.reply(await removeNamed(ctx.userId, a.split(/\s+/)[0]));
    return;
  }
  await ctx.reply(await removeFromChat(ctx.userId, sender));
}
