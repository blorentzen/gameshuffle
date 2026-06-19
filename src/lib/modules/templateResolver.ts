/**
 * Server-side template resolution for race_randomizer.
 *
 * Precedence:
 *   1. `streamer_module_defaults` row for this owner + game (set via
 *      `/account?tab=game-modules`).
 *   2. Hardcoded `RACE_RANDOMIZER_TEMPLATES` constant for the slug
 *      (the global baseline; what new streamers see until they save
 *      their own defaults).
 *
 * Used by `ensureRaceRandomizerSlices` so newly-seeded session
 * slices pick up the streamer's preferences automatically.
 */

import "server-only";
import type { RaceRandomizerConfig } from "./types";
import { getRaceRandomizerTemplate } from "./templates";
import { getStreamerModuleDefault } from "./streamerDefaults";

export async function resolveRaceRandomizerTemplate(args: {
  ownerUserId: string;
  gameSlug: string;
}): Promise<RaceRandomizerConfig> {
  const override = await getStreamerModuleDefault({
    ownerUserId: args.ownerUserId,
    moduleId: "race_randomizer",
    gameSlug: args.gameSlug,
  });
  if (override) return override;
  return getRaceRandomizerTemplate(args.gameSlug);
}
