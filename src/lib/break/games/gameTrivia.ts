/**
 * Game Trivia: questions about the game on stream, from the per-game packs
 * staff draft with AI and approve in Platform ▸ Trivia
 * (src/lib/trivia/gamePacks.ts). With no pack for the game yet (or no game
 * on stream) it asks the pack's general Video games questions instead, so
 * the slot still plays. Judged exactly like Trivia (same answer lines, A to
 * D for choices), and both share the `trivia:` no-repeat keys so neither
 * asks what the other asked lately. Skips itself until there's something to
 * ask.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { CHAT_GAMES } from "@/lib/twitch/chatGames";
import type { BreakGame } from "./common";
import { triviaRounds } from "./trivia";

const COLS = "id, prompt, answer, accept, ask_about, reject, kind, options, category";

export const gameTrivia: BreakGame = {
  ...triviaRounds,
  id: "game-trivia",
  load: async (ctx) => {
    const svc = createServiceClient();
    const base = () => svc.from("trivia_questions").select(COLS).is("owner_user_id", null).eq("status", "approved").eq("family_safe", true).in("kind", ["text", "number", "choice"]);
    const slug = ctx.gameOnStream;
    if (slug) {
      const { data, error } = await base().eq("game_slug", slug).limit(400);
      // Before trivia-game-packs-m1.sql there's no game_slug: fall through to the general questions.
      if (!error && data?.length) return { rows: data, tag: CHAT_GAMES[slug]?.title ?? "The game on stream" };
    }
    const { data } = await base().eq("category", "Video games").limit(400);
    return data?.length ? { rows: data, tag: "Video games" } : null;
  },
  make: (ctx) => {
    const loaded = ctx.data as { rows: unknown[]; tag: string } | undefined;
    if (!loaded) return null;
    const draft = triviaRounds.make({ ...ctx, data: loaded.rows });
    if (!draft) return null;
    return { ...draft, round: { ...draft.round, tag: loaded.tag } };
  },
};
