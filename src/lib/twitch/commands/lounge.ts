/**
 * Lounge chat commands (competitive dashboard picks, 2026-10-20): `!last10`, `!tonight`,
 * `!compare`, `!lounge`, `!h2h` and `!odds` (the match read; `!room` is the lobby code). Each reads the streamer's MMR card for whose numbers to show,
 * or a lounge name typed after the command, in the game on stream. Free; answers
 * wherever the GameShuffle bot is in chat.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { cardFor, liveFor, pickLook } from "@/lib/mmr/store";
import { LoungeUnavailable, divisionSteps, loungePlayer, type LoungePlayer } from "@/lib/mmr/mkcentral";
import { MMR_GAMES, gameForSlug, isEvent, type MmrGame } from "@/lib/mmr/rules";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { compareLine, last10Line, loungePagePath, tonightLine } from "@/lib/lounge/lines";
import { h2hLine, headToHead } from "@/lib/lounge/h2h";
import { placeWord, signed } from "@/lib/mmr/rules";
import type { ShuffleContext } from "./shuffle";

// ── Handlers ─────────────────────────────────────────────────────────────

type Kind = "last10" | "tonight" | "compare" | "lounge" | "h2h" | "odds";

async function gameFor(ctx: ShuffleContext, preferred: MmrGame): Promise<MmrGame> {
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]).catch(() => null);
  return gameForSlug(session?.randomizer_slug ?? null, preferred) ?? preferred;
}

export async function handleLoungeCommand(ctx: ShuffleContext, kind: Kind, args: string): Promise<void> {
  const say = (message: string) => sendChatMessage({ broadcasterId: ctx.broadcasterTwitchId, senderId: ctx.botTwitchId, message });
  const names = args.trim().split(/\s+/).map((n) => n.replace(/^@/, "").slice(0, 40)).filter(Boolean);
  const card = await cardFor(ctx.userId);
  const hasCard = !!card && !!(card.loungeName || card.loungePlayerId);
  const game = await gameFor(ctx, card ? pickLook(card, null).game : "mkworld12p");
  const noCard = "🏁 No MMR card here yet, so add a lounge name after the command. Streamers: gameshuffle.co/mmr-card";

  try {
    // The streamer, from their card (tonight's run counts from going live).
    const streamer = async () => {
      if (!hasCard) return null;
      const live = await liveFor(card!);
      return live.ok ? live.source : null;
    };
    const byName = async (name: string) => loungePlayer({ name }, game);

    if (kind === "odds") {
      // GS Pro: the room the streamer last checked on gameshuffle.co/lounge tonight.
      const [{ isProUser }, { tonightsRoom }] = await Promise.all([import("@/lib/subscription-server"), import("@/lib/lounge/roomServer")]);
      if (!(await isProUser(ctx.userId))) { await say("🏁 !odds is part of GS Pro for this channel."); return; }
      const room = await tonightsRoom(ctx.userId);
      const me = room?.read.me;
      if (!room || !me) { await say("🏁 No room checked tonight. Streamers check one at gameshuffle.co/lounge"); return; }
      const n = me.pay.length;
      const places = [...new Set([1, me.breakEven ?? Math.round(me.likely), n])].sort((a, b) => a - b);
      const fav = room.read.favorite != null ? room.read.teams[room.read.favorite].players.map((p) => p.name).join(" & ") : null;
      await say(`🏁 ${room.me}'s room: average ${room.read.average?.toLocaleString("en-US") ?? "?"}, ${room.me} ${placeWord(me.seed)} of ${n} by MMR. ${places.map((p) => `${placeWord(p)} ${signed(me.pay[p - 1])}`).join(" · ")}.${fav ? ` Favorite: ${fav}.` : ""}`);
      return;
    }

    if (kind === "h2h") {
      if (!names.length) { await say("🏁 Try !h2h <name>, or !h2h <name> <name>."); return; }
      let a: LoungePlayer | null, b: LoungePlayer | null;
      if (names.length >= 2) [a, b] = await Promise.all([byName(names[0]), byName(names[1])]);
      else {
        const s = await streamer();
        if (!s) { await say("🏁 Head-to-head needs two names here: !h2h <name> <name>."); return; }
        [a, b] = await Promise.all([byName(s.name), byName(names[0])]);
      }
      if (!a || !b) { await say(`🏁 No lounge player called ${!a ? names[0] : names[names.length >= 2 ? 1 : 0]} in ${MMR_GAMES[game].short}.`); return; }
      await say(h2hLine(a.name, b.name, headToHead({ id: a.playerId, changes: a.changes }, { id: b.playerId, changes: b.changes }), placeWord));
      return;
    }

    if (kind === "lounge") {
      const name = names[0] ?? (await streamer())?.name;
      if (!name) { await say(noCard); return; }
      const p = await byName(name);
      await say(p ? `🏁 ${p.name}'s lounge page: gameshuffle.co${loungePagePath(p.name, game)}` : `🏁 No lounge player called ${name} in ${MMR_GAMES[game].short}.`);
      return;
    }

    if (kind === "compare") {
      if (!names.length) { await say("🏁 Try !compare <name>, or !compare <name> <name>."); return; }
      let a: Pick<LoungePlayer, "name" | "mmr" | "division" | "eventsPlayed"> | null;
      let b: LoungePlayer | null;
      if (names.length >= 2) {
        [a, b] = await Promise.all([byName(names[0]), byName(names[1])]);
        if (!a) { await say(`🏁 No lounge player called ${names[0]} in ${MMR_GAMES[game].short}.`); return; }
      } else {
        const s = await streamer();
        if (!s) { await say("🏁 Compare needs two names here: !compare <name> <name>."); return; }
        a = { name: s.name, mmr: s.mmr, division: s.division, eventsPlayed: s.changes.filter(isEvent).length };
        b = await byName(names[0]);
      }
      if (!b) { await say(`🏁 No lounge player called ${names[names.length >= 2 ? 1 : 0]} in ${MMR_GAMES[game].short}.`); return; }
      await say(compareLine(a, b));
      return;
    }

    // last10 and tonight: a name, else the streamer.
    if (names[0]) {
      const p = await byName(names[0]);
      if (!p) { await say(`🏁 No lounge player called ${names[0]} in ${MMR_GAMES[game].short}.`); return; }
      if (kind === "last10") await say(last10Line(p.name, p.changes));
      else {
        // Someone else's "tonight" is since midnight Pacific.
        const { gsDayStart, gsDay } = await import("@/lib/time/gsClock");
        await say(tonightLine(p.name, p.changes, gsDayStart(gsDay()).toISOString(), await divisionSteps(game)));
      }
      return;
    }
    const s = await streamer();
    if (!s) { await say(noCard); return; }
    await say(kind === "last10" ? last10Line(s.name, s.changes) : tonightLine(s.name, s.changes, s.since, s.steps));
  } catch (err) {
    if (!(err instanceof LoungeUnavailable)) console.error(`[lounge] !${kind}:`, err);
    await say("🏁 The lounge isn't answering right now. Try again in a minute.");
  }
}
