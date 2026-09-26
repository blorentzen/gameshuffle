import "server-only";

import { BGG_BASE_URL } from "./config";
import {
  parseBggSearch,
  parseBggThings,
  type BggSearchHit,
  type BggGame,
} from "./parse";

/**
 * Thin BGG XML API2 client (server-only). Callers should go through
 * `catalog.ts`, which is cache-first — this module is the only place that
 * actually reaches out to BGG.
 */
/**
 * Since 2025-10-27 BGG requires a registered application + Bearer token on
 * every XML API request (401 otherwise). Register at
 * boardgamegeek.com/applications and set BGG_API_TOKEN. Without a token we
 * still send the request so the failure is visible in logs, not silent.
 */
function authHeaders(): Record<string, string> {
  const token = process.env.BGG_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function bggFetch(path: string): Promise<string> {
  const res = await fetch(`${BGG_BASE_URL}${path}`, {
    headers: { Accept: "application/xml", ...authHeaders() },
    // BGG data changes slowly; let the platform edge cache brief bursts.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`BGG ${path} → ${res.status}`);
  return res.text();
}

/** Name search → lightweight hits (id + name + year). One BGG call. */
export async function bggSearch(query: string): Promise<BggSearchHit[]> {
  const xml = await bggFetch(
    `/search?type=boardgame,boardgameexpansion&query=${encodeURIComponent(query)}`,
  );
  return parseBggSearch(xml);
}

/** Batched details for the given ids (players, time, weight, art). One call. */
export async function bggThings(ids: number[]): Promise<BggGame[]> {
  if (!ids.length) return [];
  const xml = await bggFetch(`/thing?stats=1&id=${ids.join(",")}`);
  return parseBggThings(xml);
}

/** Current "hot" games — a handy bulk seed source (id + name). One call. */
export async function bggHot(): Promise<BggSearchHit[]> {
  const xml = await bggFetch(`/hot?type=boardgame`);
  return parseBggSearch(xml);
}
