/**
 * Resolve a streamer's public `gameshuffle.co/live/<slug>` URL from
 * their user_id. Mirrors the `/live/[streamer-slug]` page's resolver
 * (`users.username` first, `users.twitch_username` fallback) so the
 * URL we send into chat always lands on the correct live page.
 *
 * Used by chat-command handlers that surface the live URL to viewers
 * (join confirmation, picks/bans events, channel-point rerolls,
 * !gs-live). Process-local LRU cache keeps the per-message lookup
 * cheap during a chat burst; cache size capped so it can't grow
 * unbounded across many tenants.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

const CACHE_MAX = 256;
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  slug: string | null;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function getCached(userId: string): string | null | undefined {
  const entry = cache.get(userId);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return undefined;
  }
  return entry.slug;
}

function putCached(userId: string, slug: string | null) {
  if (cache.size >= CACHE_MAX) {
    // Trim oldest entry by insertion order — Map preserves it.
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(userId, { slug, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Returns the canonical streamer slug for the live page URL, or null
 *  when neither `username` nor `twitch_username` is set on the user
 *  row (extremely rare — only freshly-created accounts that haven't
 *  finished onboarding). */
export async function getLiveSlugForUser(userId: string): Promise<string | null> {
  const cached = getCached(userId);
  if (cached !== undefined) return cached;
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("username, twitch_username")
    .eq("id", userId)
    .maybeSingle();
  const slug =
    (data?.username as string | null) ??
    (data?.twitch_username as string | null) ??
    null;
  putCached(userId, slug);
  return slug;
}

const LIVE_BASE = "gameshuffle.co/live";

/** Build the live URL for a user. Returns null when no slug is
 *  available — callers that want to suffix chat messages should omit
 *  the suffix in that case rather than emit a broken link. */
export async function getLiveUrlForUser(userId: string): Promise<string | null> {
  const slug = await getLiveSlugForUser(userId);
  if (!slug) return null;
  return `${LIVE_BASE}/${encodeURIComponent(slug)}`;
}
