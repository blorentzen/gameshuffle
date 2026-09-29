/**
 * `!whosaid` — Who Said It? (a GameShuffle Original, GS Pro).
 *
 *   !whosaid          (broadcaster / mods) a quote goes up with the speaker hidden
 *   !whosaid reveal   (broadcaster / mods) close it and announce who said it
 *   !vote <number>    (everyone) the normal poll vote
 *
 * Built on the polls engine: a round is a poll with kind "whosaid" and a right
 * answer, so it shows on /live and the overlay like any poll. Quotes come from
 * the channel's !quote pool; only ones with a speaker (`!quote add <text> - Name`)
 * are used.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { isProUser } from "@/lib/subscription-server";
import { createServiceClient } from "@/lib/supabase/admin";
import { closePoll, createPoll, getOpenPollForCommunity, isPollError, tally } from "@/lib/polls/store";
import { buildRound, type SpeakerQuote } from "@/lib/originals/whoSaid";
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
  return sendChatMessage({ broadcasterId: cmd.broadcasterTwitchId, senderId: cmd.botTwitchId, message });
}

/** The channel's quotes that know who said them. Null before whosaid-m1 is applied. */
async function speakerQuotes(communityId: string): Promise<SpeakerQuote[] | null> {
  const admin = createServiceClient();
  const { data: cmdRow } = await admin.from("gs_default_commands").select("id").eq("trigger", "quote").maybeSingle();
  if (!cmdRow) return [];
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .select("id, response, said_by")
    .eq("command_id", (cmdRow as { id: string }).id)
    .eq("enabled", true)
    .eq("community_id", communityId)
    .not("said_by", "is", null)
    .limit(500);
  if (error) return null;
  return ((data ?? []) as { id: string; response: string; said_by: string }[]).map((r) => ({
    id: r.id,
    // Hide the "- Name" tail so the quote doesn't give itself away.
    text: r.response.replace(/\s+(?:-|–|—|~)\s*[^-–—~]{1,60}$/, "").replace(/^["“]|["”]$/g, "").trim(),
    saidBy: r.said_by,
  }));
}

/** The answer line for a closed Who Said It? round. */
export async function whoSaidReveal(pollId: string, options: { id: string; label: string }[], answerId: string | null): Promise<string> {
  const t = await tally(pollId);
  const answer = options.find((o) => o.id === answerId)?.label ?? "someone";
  const right = answerId ? t.byOption[answerId] ?? 0 : 0;
  return t.total
    ? `🗨️ It was ${answer}! ${right} of ${t.total} got it right.`
    : `🗨️ It was ${answer}! Nobody voted this time.`;
}

registerCommand({
  name: "whosaid",
  trigger: ["whosaid", "whosaidit"],
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
    summary: "Who Said It? Chat guesses who said a quote.",
    usage: "!whosaid  ·  !whosaid reveal",
    detail:
      "Posts a quote from your !quote pool with the speaker hidden; chat votes with !vote <number>. !whosaid reveal closes it and announces the answer. Uses quotes added as !quote add <text> - Name. GS Pro.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    if (!(await isProUser(cmd.userId))) return { ok: false, reason: "not_pro" };

    const arg = cmd.args.trim().toLowerCase();
    if (arg === "reveal" || arg === "close") {
      const open = await getOpenPollForCommunity(econ.community.id);
      if (!open || open.kind !== "whosaid") {
        await reply(cmd, "🗨️ No Who Said It? round is open. Start one with !whosaid");
        return { ok: true };
      }
      const closed = await closePoll(open.id);
      if (isPollError(closed)) {
        await reply(cmd, "🗨️ Couldn't close the round. Try again.");
        return { ok: false, reason: closed.error };
      }
      await reply(cmd, await whoSaidReveal(open.id, open.options, open.answerOptionId));
      return { ok: true };
    }

    const quotes = await speakerQuotes(econ.community.id);
    if (quotes === null) {
      await reply(cmd, "🗨️ Who Said It? needs a quick update on GameShuffle before it can run.");
      return { ok: false, reason: "not_migrated" };
    }
    const round = buildRound(quotes);
    if (!round) {
      await reply(cmd, "🗨️ Who Said It? needs quotes from at least two people. Add them with !quote add <text> - Name");
      return { ok: true };
    }
    const result = await createPoll({
      communityId: econ.community.id,
      question: `Who said: "${round.quote.text}"`,
      options: round.options,
      open: true,
      sessionId: econ.activeSessionId,
      createdBy: cmd.userId,
      kind: "whosaid",
      answerOptionId: String(round.answerIndex + 1),
    });
    if (isPollError(result)) {
      await reply(cmd, "🗨️ Couldn't start the round. Try again.");
      return { ok: false, reason: result.error };
    }
    const optList = result.options.map((o) => `${o.id}) ${o.label}`).join("  ");
    await reply(cmd, `🗨️ Who said it? "${round.quote.text}"  ▸  ${optList}  ·  vote with !vote <number>`);
    return { ok: true };
  },
});

export const __WHOSAID_COMMAND_REGISTERED__ = true;
