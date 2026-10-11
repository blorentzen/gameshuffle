/**
 * Break mode from chat (GS Pro). Mods and the streamer:
 *
 *   !gs brb [minutes]   start a break (the minutes only set "back in about…")
 *   !gs back [now]      the round in play finishes, then the break ends (now = straight away)
 *   !gs pull            take the round's question out of every channel until staff review it
 *
 * Viewers don't use commands to play: their answers are plain messages ("1",
 * "over", "Peach"), caught by the webhook's fast lane (src/lib/break/store.ts).
 */

import "server-only";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { getRunning, pullRound, requestEnd, startBreak } from "@/lib/break/store";
import { registerCommand } from "./registry";

registerCommand({
  name: "gs.brb",
  trigger: ["gs", "brb"],
  aliases: [["gs-brb"]],
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
    summary: "Start break mode: GameShuffle runs games for chat until you're back.",
    usage: "!gs brb [minutes]",
    detail: "Puts the break screen on your overlay and plays your break lineup. Chat answers by typing (1 or 2, a number, a name). Add minutes to show \"back in about…\" on screen. GS Pro.",
  },
  handler: async (cmd) => {
    const communityId = await resolveCommunityIdForOwner(cmd.userId);
    if (!communityId) return { ok: false, reason: "no_community" };
    const minutes = Number(cmd.args.trim().split(/\s+/)[0]);
    const res = await startBreak({ communityId, ownerUserId: cmd.userId, minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null });
    if (res.ok) return { ok: true };
    const say: Record<typeof res.error, string> = {
      not_pro: "Break mode is part of GS Pro.",
      already_running: "A break is already running. !gs back ends it.",
      not_ready: "Break mode isn't switched on for GameShuffle yet.",
      failed: "Couldn't start the break just now. Try again in a moment.",
    };
    await cmd.reply(say[res.error]);
    return { ok: false, reason: res.error };
  },
});

registerCommand({
  name: "gs.back",
  trigger: ["gs", "back"],
  aliases: [["gs-back"]],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "broadcaster",
  family: "community",
  minAuthority: "mod",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 3,
  help: {
    summary: "End break mode: the round in play finishes, then the champion is named.",
    usage: "!gs back [now]",
    detail: "Lets the current round finish (a minute at most) so nobody loses a round they were winning. Add \"now\" to end straight away.",
  },
  handler: async (cmd) => {
    const communityId = await resolveCommunityIdForOwner(cmd.userId);
    const run = communityId ? await getRunning(communityId) : null;
    if (!run) {
      await cmd.reply("No break is running.");
      return { ok: false, reason: "no_break" };
    }
    const now = /^now\b/i.test(cmd.args.trim());
    const after = await requestEnd(run, { now });
    if (after.status === "running") await cmd.reply("Finishing this round, then we're back.");
    return { ok: true };
  },
});

registerCommand({
  name: "gs.pull",
  trigger: ["gs", "pull"],
  aliases: [["gs-pull"]],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "moderation",
  family: "mod",
  minAuthority: "mod",
  vipOnly: false,
  cooldownSeconds: 3,
  help: {
    summary: "Pull the break round's question: it's skipped and kept off every channel until staff review it.",
    usage: "!gs pull",
    detail: "For a question that's wrong or doesn't sit right. The break moves straight on to the next round.",
  },
  handler: async (cmd) => {
    const communityId = await resolveCommunityIdForOwner(cmd.userId);
    const run = communityId ? await getRunning(communityId) : null;
    const res = run ? await pullRound(run, null) : ({ ok: false, error: "nothing_to_pull" } as const);
    await cmd.reply(res.ok ? "Pulled that one. Staff will take a look." : "There's no break question to pull right now.");
    return res.ok ? { ok: true } : { ok: false, reason: res.error };
  },
});
