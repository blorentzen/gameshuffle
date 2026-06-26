/**
 * Anthem provider registry — central list of music sources.
 *
 * Add a provider here and the catalog/store/feature gate pick it up. The
 * registry is the single place that answers "may we serve tracks from X?".
 */

import type { MusicProvider } from "./provider";
import { isServable } from "./provider";
import { streamBeatsProvider } from "./streambeats";

const PROVIDERS: Record<string, MusicProvider> = {
  [streamBeatsProvider.id]: streamBeatsProvider,
  // monstercat (bring_your_own), lickd (B2B) slot in here later.
};

export function getProvider(id: string): MusicProvider | undefined {
  return PROVIDERS[id];
}

export function listProviders(): MusicProvider[] {
  return Object.values(PROVIDERS);
}

/** Provider ids whose catalog may currently be served platform-wide. */
export function servableProviderIds(): string[] {
  return listProviders().filter(isServable).map((p) => p.id);
}

/** Is a persisted track's provider currently servable platform-wide? */
export function isProviderServable(providerId: string): boolean {
  const p = getProvider(providerId);
  return p ? isServable(p) : false;
}
