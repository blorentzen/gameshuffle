/**
 * Per-game default templates for module configs.
 *
 * Templates exist so:
 *   1. Chat commands always find a `session_modules.config.per_game[slug]`
 *      slice — the legacy `ensureSessionModule` only writes the registry's
 *      unwrapped default, which leaves multi-game sessions vulnerable to
 *      "config not found" bails when the active slug doesn't match the
 *      legacy first-game alias. The seed helper writes one slice per
 *      configured game so every command lookup hits.
 *   2. Streamers can "reset to default" from the Hub when they want a
 *      clean slate (the UI dispatches the same template here, wrapped
 *      through `updateRaceConfigAction`).
 *
 * Add a new game by registering a slug → template entry in
 * `RACE_RANDOMIZER_TEMPLATES`. The template only needs to match the
 * shape — empty picks/bans pools are fine; the per-game data files
 * (race tracks/modes/items) drive the actual pools at roll time.
 */

import type { RaceRandomizerConfig } from "./types";

/** Baseline template — all pools open, no picks/bans applied, single
 *  race series, no duplicates. Same shape every game can build on. */
const BASE_RACE_TEMPLATE: RaceRandomizerConfig = {
  enabled: true,
  tracks: { enabled: true, picks: [], bans: [] },
  items: {
    modes: { enabled: true, picks: [], bans: [] },
    literal: { enabled: true, picks: [], bans: [] },
  },
  defaultSeriesLength: 1,
  allowSeriesDuplicates: false,
  roomCode: null,
  roomCodeShareMode: "twitch_chat",
  platforms: [],
  fcShareMode: "twitch_chat",
};

/** Mario Kart 8 Deluxe — Nintendo Switch only. */
const MK8DX_TEMPLATE: RaceRandomizerConfig = {
  ...BASE_RACE_TEMPLATE,
  platforms: ["nso"],
};

/** Mario Kart World — Nintendo Switch only (Switch 2). Adds the rally
 *  pool and defaults `rollKind` to "race" so `!gs-race` rolls a track
 *  unless the streamer flips to "rally" or "auto". The rally pool
 *  starts open with no picks/bans. */
const MKWORLD_TEMPLATE: RaceRandomizerConfig = {
  ...BASE_RACE_TEMPLATE,
  rallies: { enabled: true, picks: [], bans: [] },
  rollKind: "race",
  platforms: ["nso"],
};

/** Slug → template lookup. Falls back to the baseline for any slug
 *  not registered here so newly-added games still get a sensible row
 *  before their explicit template lands. */
export const RACE_RANDOMIZER_TEMPLATES: Record<string, RaceRandomizerConfig> = {
  "mario-kart-8-deluxe": MK8DX_TEMPLATE,
  "mario-kart-world": MKWORLD_TEMPLATE,
};

/** Resolve a template for a game slug. Returns the baseline when the
 *  slug isn't explicitly registered so callers can always get a
 *  workable starting config without an `if/else` per game. */
export function getRaceRandomizerTemplate(
  gameSlug: string,
): RaceRandomizerConfig {
  return RACE_RANDOMIZER_TEMPLATES[gameSlug] ?? BASE_RACE_TEMPLATE;
}
