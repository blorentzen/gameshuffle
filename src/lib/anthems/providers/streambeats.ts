/**
 * StreamBeats (Harris Heller) — V1 anthem provider.
 *
 * Why first: free, no-attribution, perpetual sync + master-use license, and
 * every track is registered with Twitch's Audible Magic + YouTube Content ID,
 * so it's strike-proof by construction — the safest possible source for a
 * feature that plays audio on someone's stream.
 *
 * Status `pending`: StreamBeats' license is written for the end *creator's*
 * content. GS re-serving the catalog as a platform feature is redistribution —
 * a short, friendly conversation with Harris Heller's team (his business model
 * is "more plays = good"). Until that's confirmed, the registry refuses to
 * SERVE these tracks; we can still ingest + build the whole system against them.
 *
 * Flip `redistribution` to "cleared" once the platform license is confirmed.
 */

import type { MusicProvider, ProviderTrack } from "./provider";

export const STREAMBEATS_PROVIDER_ID = "streambeats";

/**
 * Catalog ingestion. The real implementation will read the StreamBeats public
 * drive/manifest and mirror cleared files into R2 (gameshuffle-ugc). For the
 * bones we return an empty list — ingestion is a separate ops job, and nothing
 * is servable yet anyway (redistribution: "pending"), so there's no catalog to
 * fake. Wire this to the manifest once the platform license lands.
 */
async function fetchCatalog(): Promise<ProviderTrack[]> {
  return [];
}

export const streamBeatsProvider: MusicProvider = {
  id: STREAMBEATS_PROVIDER_ID,
  displayName: "StreamBeats",
  licenseTag: "streambeats-sync-master",
  redistribution: "pending",
  fetchCatalog,
};
