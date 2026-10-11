/**
 * Stream Bingo on autopilot: a break game that runs a real Stream Bingo game
 * (src/lib/bingo/stream.ts). Cards for a minute on the live page, a number
 * every 10 seconds, first line wins; the round ends early on a bingo, and the
 * winner scores 5 break points (Stream Bingo announces the win in chat itself).
 * If the streamer already has a bingo game going, this game steps aside.
 *
 * Hosted (it needs the database), so it isn't part of the pure game tests.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { closeGame, getGame, getOpenGame, openGame, viewOf } from "@/lib/bingo/stream";
import type { BreakGame } from "./common";

export const streamBingo: BreakGame = {
  id: "stream-bingo",
  make: () => null,
  accept: () => null,
  judge: () => ({ awards: [], reveal: { text: "", answered: 0, right: 0 }, line: null }),
  hosted: {
    open: async (ctx) => {
      if (await getOpenGame(ctx.communityId)) return null;
      const res = await openGame({ communityId: ctx.communityId, createdBy: ctx.ownerUserId, pattern: "line", doorsSeconds: 60, callInterval: 10, prizeTokens: 0 });
      if (!res.ok) return null;
      const url = ctx.liveSlug ? `gameshuffle.co/live/${ctx.liveSlug}` : null;
      return {
        key: null,
        round: { layout: "bingo", prompt: "Stream Bingo: first line wins", hint: url ? `Get a card at ${url}` : "Get a card on the live page", url },
        secret: { bingoId: res.value.id },
      };
    },
    finished: async (secret) => {
      const g = await getGame(String(secret.bingoId));
      return !g || g.status !== "open";
    },
    close: async ({ secret }) => {
      const id = String(secret.bingoId);
      let g = await getGame(id);
      if (g?.status === "open") {
        const closed = await closeGame(id);
        g = closed.ok ? closed.value : g;
      }
      if (!g || g.status !== "won" || !g.winnerUserId) {
        return { awards: [], reveal: { text: "No bingo this time. Cards are closed.", answered: 0, right: 0 }, line: null };
      }
      // The winner plays as their Twitch account when it's linked, like everywhere else in a break.
      const { data } = await createServiceClient().from("users").select("twitch_id").eq("id", g.winnerUserId).maybeSingle();
      const twitchId = (data as { twitch_id: string | null } | null)?.twitch_id;
      const award = twitchId
        ? { platform: "twitch", viewer: twitchId, name: g.winnerName, points: 5 }
        : { platform: "site", viewer: g.winnerUserId, name: g.winnerName, points: 5 };
      return { awards: [award], reveal: { text: `${g.winnerName ?? "Someone"} got a bingo! +5`, answered: 1, right: 1 }, line: null };
    },
    progress: async (secret) => {
      const g = await getGame(String(secret.bingoId));
      if (!g) return null;
      const v = await viewOf(g);
      return { called: v.called.length, last: v.last, pattern: v.patternLabel, doorsCloseAt: v.doorsCloseAt, players: v.players, winner: v.winnerName };
    },
  },
};
