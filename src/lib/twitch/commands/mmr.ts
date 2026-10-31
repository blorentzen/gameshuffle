/**
 * `!mmr` — the streamer's MMR card in one chat line; `!mmr <lounge name>` looks up any
 * lounge player in the same game. Everyone can use it (cooldown in the registry). The card
 * is free; this answers wherever the GameShuffle bot is in chat. When the streamer's card keeps
 * MMR off (Rank only, studio round 2, 2026-10-30), `!mmr` on its own answers with their division,
 * next division and world rank, no MMR; `!mmr <name>` for anyone else answers as before.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { cardFor, liveFor, pickLook } from "@/lib/mmr/store";
import { LoungeUnavailable, divisionSteps, loungePlayer } from "@/lib/mmr/mkcentral";
import { MMR_GAMES, fmtMmr, placeWord, signed, viewOf, type MmrGame, type MmrSource } from "@/lib/mmr/rules";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { gameForSlug } from "@/lib/mmr/rules";
import { goalChat, goalProgress } from "@/lib/mmr/goal";
import type { ShuffleContext } from "./shuffle";

/** `goal`: tonight's goal (GS Pro), added as "goal 15,500, 184 to go". `noMmr`: the card keeps MMR off, so the line does too. */
export function mmrLine(src: MmrSource, opts: { tonight?: boolean; goal?: number | null; noMmr?: boolean } = {}): string {
  const v = viewOf(src);
  if (opts.noMmr) {
    const parts = [
      v.division,
      v.next ? `next ${v.next.name}` : null,
      v.worldRank ? `#${v.worldRank.toLocaleString("en-US")} world` : null,
      opts.tonight !== false && v.tonight.events ? `tonight ${v.tonight.w}-${v.tonight.l}` : null,
    ].filter(Boolean);
    return `🏁 ${v.name}: ${parts.join(" · ")} · ${MMR_GAMES[v.game].short}`;
  }
  const g = opts.goal != null ? goalProgress(opts.goal, v.mmr, v.mmr != null ? v.mmr - v.tonight.delta : null) : null;
  const parts = [
    v.mmr == null ? "no MMR yet" : `${fmtMmr(v.mmr)} MMR`,
    v.division,
    v.next && v.toNext != null ? `${fmtMmr(v.toNext)} to ${v.next.name}` : null,
    v.worldRank ? `#${v.worldRank.toLocaleString("en-US")} world` : null,
    opts.tonight !== false && v.tonight.events ? `tonight ${signed(v.tonight.delta)} (${v.tonight.w}-${v.tonight.l})` : null,
    g ? goalChat(g) : null,
  ].filter(Boolean);
  return `🏁 ${v.name}: ${parts.join(" · ")} · ${MMR_GAMES[v.game].short}`;
}

export async function handleMmrCommand(ctx: ShuffleContext, args: string): Promise<void> {
  const say = (message: string) => sendChatMessage({ broadcasterId: ctx.broadcasterTwitchId, senderId: ctx.botTwitchId, message });
  const card = await cardFor(ctx.userId);
  const name = args.trim().replace(/^@/, "").slice(0, 40);

  if (name) {
    const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]).catch(() => null);
    const prefer: MmrGame = card ? pickLook(card, null).game : "mkworld12p";
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

  if (!card || (!card.loungeName && !card.loungePlayerId)) {
    await say("🏁 No MMR card here yet. Make one free at gameshuffle.co/mmr-card");
    return;
  }
  const live = await liveFor(card);
  if (live.ok) {
    const p = live.pending;
    const noMmr = live.look.info.hideMmr;
    await say(mmrLine(live.source, { goal: live.goal ?? null, noMmr }) + (p ? (noMmr ? ` · table in: ${placeWord(p.place)}, waiting to verify` : ` · table in: ${placeWord(p.place)}, about ${signed(p.delta)} once verified`) : ""));
  }
  else if (live.reason === "unavailable") await say("🏁 The lounge isn't answering right now. Try again in a minute.");
  else await say("🏁 This channel's lounge name wasn't found. The streamer can fix it at gameshuffle.co/mmr-card");
}
