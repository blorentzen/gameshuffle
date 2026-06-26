/**
 * MusicProvider — source-agnostic catalog abstraction for walk-up anthems.
 *
 * Same spirit as the PlatformAdapter pattern: the anthem system never branches
 * on a specific music source. Each provider (StreamBeats, Monstercat, Lickd…)
 * implements this interface; the registry exposes them and, crucially, gates
 * whether a provider's tracks may actually be SERVED.
 *
 * The `redistribution` field encodes our real licensing posture: a streamer
 * playing a track on their own channel ("creator use") is a different license
 * from GS, as a platform, serving that catalog to all users ("redistribution").
 * Until that platform-level question is confirmed with a provider, it stays
 * `pending` and the feature gate refuses to serve it — so we can ingest +
 * design against a catalog without shipping anything we're not cleared for.
 */

import type { AnthemTrack } from "../types";

/**
 * Platform-level serve status for a provider's catalog:
 *  - cleared:       GS is licensed to serve this catalog to users. Servable.
 *  - pending:       creator-safe, but platform redistribution not yet confirmed.
 *                   Ingestible + designable, NOT servable. (StreamBeats today.)
 *  - bring_your_own: only servable for streamers who hold their own license
 *                   (e.g. a linked Monstercat Gold sub). Gated per-streamer.
 */
export type RedistributionStatus = "cleared" | "pending" | "bring_your_own";

/** A track as returned by a provider's catalog fetch (pre-persistence shape). */
export interface ProviderTrack {
  providerTrackId: string;
  title: string;
  artist?: string | null;
  genre?: string | null;
  durationMs?: number | null;
  audioUrl: string;
  artworkUrl?: string | null;
  license?: string | null;
  attribution?: string | null;
  suggestedStartMs?: number;
}

export interface MusicProvider {
  /** Stable id; matches gs_anthem_tracks.provider. */
  readonly id: string;
  readonly displayName: string;
  /** License tag stamped onto ingested tracks. */
  readonly licenseTag: string;
  /** Platform serve status — drives whether tracks are playable. */
  readonly redistribution: RedistributionStatus;
  /**
   * Pull the provider's catalog for ingestion into gs_anthem_tracks. May be a
   * static seed, a drive manifest, or a real API call depending on the source.
   */
  fetchCatalog(): Promise<ProviderTrack[]>;
}

/** True when a provider's catalog may be served platform-wide (no BYO needed). */
export function isServable(p: MusicProvider): boolean {
  return p.redistribution === "cleared";
}

/** Convenience: is this persisted track from a currently-servable provider? */
export type TrackServability = (track: Pick<AnthemTrack, "provider">) => boolean;
