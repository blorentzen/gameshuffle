import "server-only";

/**
 * Whether the speedrun overlay is listed in the menus, the footer, the For streamers pages and the chat games guide
 * (launch picks 2026-11-10): /speedrun itself is live from the release, the listings wait for a quiet week of real
 * runs and the speedrun_listed switch (Platform ▸ Switches). Off production it's always listed, for checking.
 */

import { getPlatformFlag } from "@/lib/platform/flags";
import { isProduction } from "@/lib/env";
import { speedrunShown } from "@/lib/games-visibility";

export async function speedrunListed(): Promise<boolean> {
  if (!speedrunShown()) return false;
  if (!isProduction) return true;
  return getPlatformFlag("speedrun_listed", false);
}
