/**
 * `!mmr` — the streamer's MMR card in one chat line; `!mmr <lounge name>` looks up any
 * lounge player in the same game. While the card reads a GameShuffle ladder, `!mmr` answers
 * from the ladder and `!mmr <name>` looks on that ladder first, then the lounge. Everyone can use it (cooldown in the registry). The card
 * is free; this answers wherever the GameShuffle bot is in chat. When the streamer's card keeps
 * MMR off (Rank only, studio round 2, 2026-10-30), `!mmr` on its own answers with their division,
 * next division and world rank, no MMR; `!mmr <name>` for anyone else answers as before.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { cardFor, liveFor, lookInUse } from "@/lib/mmr/store";
import { LoungeUnavailable, divisionSteps, loungePlayer } from "@/lib/mmr/mkcentral";
import { ladderPlayerByName } from "@/lib/mmr/ladderSource";
import { MMR_GAMES, fmtMmr, placeWord, rankText, signed, sourceLabel, viewOf, type MmrGame, type MmrSource, type MmrView } from "@/lib/mmr/rules";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { gameForSlug } from "@/lib/mmr/rules";
import { goalChat, goalProgress } from "@/lib/mmr/goal";
import type { ShuffleContext } from "./shuffle";

/** `goal`: tonight's goal (GS Pro), added as "goal 15,500, 184 to go". `noMmr`: the card keeps MMR off, so the line does too. */
/** "Platinum 1", or "Placement 3 of 5" while a ladder player places. */
const divisionWord = (v: MmrView) => (v.ladder?.placement ? `Placement ${v.ladder.placement.done} of ${v.ladder.placement.of}` : v.division);

export function mmrLine(src: MmrSource, opts: { tonight?: boolean; goal?: number | null; noMmr?: boolean } = {}): string {
  const v = viewOf(src);
  if (opts.noMmr) {
    const parts = [
      divisionWord(v),
      v.next ? `next ${v.next.name}` : null,
      v.worldRank ? rankText(v.worldRank, v.ladder) : null,
      opts.tonight !== false && v.tonight.events ? `tonight ${v.tonight.w}-${v.tonight.l}` : null,
    ].filter(Boolean);
    return `🏁 ${v.name}: ${parts.join(" · ")} · ${sourceLabel(v)}`;
  }
  const g = opts.goal != null ? goalProgress(opts.goal, v.mmr, v.mmr != null ? v.mmr - v.tonight.delta : null) : null;
  const parts = [
    v.mmr == null ? "no MMR yet" : `${fmtMmr(v.mmr)} MMR`,
    divisionWord(v),
    v.next && v.toNext != null ? `${fmtMmr(v.toNext)} to ${v.next.name}` : null,
    v.worldRank ? rankText(v.worldRank, v.ladder) : null,
    opts.tonight !== false && v.tonight.events ? `tonight ${signed(v.tonight.delta)} (${v.tonight.w}-${v.tonight.l})` : null,
    g ? goalChat(g) : null,
  ].filter(Boolean);
  return `🏁 ${v.name}: ${parts.join(" · ")} · ${sourceLabel(v)}`;
}

export async function handleMmrCommand(ctx: ShuffleContext, args: string): Promise<void> {
  const say = (message: string) => sendChatMessage({ broadcasterId: ctx.broadcasterTwitchId, senderId: ctx.botTwitchId, message });
  const card = await cardFor(ctx.userId);
  const name = args.trim().replace(/^@/, "").slice(0, 40);

  if (name) {
    const [session, inUse] = await Promise.all([
      findTwitchSessionForUser(ctx.userId, ["active", "test"]).catch(() => null),
      card ? lookInUse(card) : Promise.resolve(null),
    ]);
    // The card reads a ladder: that ladder's players first.
    if (inUse?.look.ladder) {
      const src = await ladderPlayerByName(inUse.look.ladder, name).catch(() => null);
      if (src) { await say(mmrLine({ ...src, avatar: null }, { tonight: false })); return; }
    }
    const prefer: MmrGame = inUse ? inUse.look.game : "mkworld12p";
    const game = gameForSlug(session?.randomizer_slug ?? null, prefer) ?? prefer;
    try {
      const [player, steps] = await Promise.all([loungePlayer({ name }, game), divisionSteps(game)]);
      if (!player) { await say(`🏁 No lounge player called ${name} in ${MMR_GAMES[game].short}.`); return; }
      await say(mmrLine({
        name: player.name, country: player.country, game, mmr: player.mmr, maxMmr: player.maxMmr, division: player.division,
        worldRank: player.worldRank, steps, changes: player.changes, since: null, avatar: null,
      }, { tonight: false }));
    } catch (err) {
      if (!(err instanceof LoungeUnavailable)) console.error("[mmr] chat lookup:", err);
      await say("🏁 The lounge isn't answering right now. Try again in a minute.");
    }
    return;
  }

  if (!card) {
    await say("🏁 No MMR card here yet. Make one free at gameshuffle.co/mmr-card");
    return;
  }
  const live = await liveFor(card);
  if (live.ok) {
    const p = live.pending;
    const noMmr = live.look.info.hideMmr;
    await say(mmrLine(live.source, { goal: live.goal ?? null, noMmr }) + (p ? (noMmr ? ` · table in: ${placeWord(p.place)}, waiting to verify` : ` · table in: ${placeWord(p.place)}, about ${signed(p.delta)} once verified`) : ""));
  }
  else if (live.reason === "no_name") await say("🏁 No MMR card here yet. Make one free at gameshuffle.co/mmr-card");
  else if (live.reason === "unavailable") await say("🏁 The lounge isn't answering right now. Try again in a minute.");
  else if (live.reason === "not_on_ladder") await say("🏁 This channel's card is set to a GS Ranked lounge the streamer isn't on. They can fix it at gameshuffle.co/mmr-card");
  else await say("🏁 This channel's lounge name wasn't found. The streamer can fix it at gameshuffle.co/mmr-card");
}
