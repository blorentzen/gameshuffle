/**
 * What the stream page offers for the game on stream right now (just in
 * time: a Smash stream gets fighter, stage-and-rules and battle buttons, a
 * Mario Kart stream gets race rolls and picks and bans, a queue gets none).
 * Server-only because the chat game registry imports every game's data; the
 * result is plain data the client controls render.
 */

import "server-only";
import { getChatGame } from "@/lib/twitch/chatGames";
import { CHAT_SETUPS } from "@/lib/twitch/chatSetups";
import { getGameName } from "@/data/game-registry";

export interface HubChoice {
  label: string;
  arg: string;
}

export interface HubGameActions {
  slug: string;
  name: string;
  /** "Roll my fighter": what the streamer's own roll is called. */
  noun: string;
  pickChoices: HubChoice[];
  /** Null when the game has no match roll. */
  setup: { choices: HubChoice[] } | null;
  /** Viewer battles roll everyone in the lobby at once. */
  battle: boolean;
  /** Mario Kart 8 Deluxe / World: the race module's rolls and picks and bans. */
  race: { rally: boolean } | null;
  /** Prediction markets have templates for this game (Mario Kart only so far). */
  markets: boolean;
}

const RACE_GAMES: Record<string, { rally: boolean }> = {
  "mario-kart-8-deluxe": { rally: false },
  "mario-kart-world": { rally: true },
};

/** Null for a queue (no game, or one GameShuffle can't roll for). */
export function hubGameActions(slug: string | null | undefined): HubGameActions | null {
  if (!slug) return null;
  const game = getChatGame(slug);
  if (!game) return null;
  const setup = CHAT_SETUPS[game.slug];
  return {
    slug: game.slug,
    name: getGameName(game.slug),
    noun: game.noun ?? "pick",
    pickChoices: game.choices ?? [],
    setup: setup ? { choices: setup.choices ?? [] } : null,
    battle: !game.streamerOnly,
    race: RACE_GAMES[game.slug] ?? null,
    markets: !!RACE_GAMES[game.slug],
  };
}
