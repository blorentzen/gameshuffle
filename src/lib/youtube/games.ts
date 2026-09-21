/**
 * YouTube game detection (pure — no server-only, so it's unit-testable).
 *
 * YouTube's Data API doesn't expose the specific game for a live broadcast, so
 * we infer it from the broadcast title, matching against the supported
 * randomizer games. Used by the auto-session opener to bind a game (else the
 * session is queue-mode).
 */

import { getTwitchGame } from "@/lib/twitch/games";

/**
 * Best-effort game slug from a YouTube broadcast title. "World" is checked
 * before "8/Deluxe" because both titles contain "Mario Kart"; a bare
 * "Mario Kart" with no disambiguating token returns null (queue-mode). Only
 * returns a slug the game registry actually knows.
 */
export function resolveYouTubeGameFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  let slug: string | null = null;
  if (/mario\s*kart\s*world|\bmk\s*world\b|\bmkworld\b|\bmkw\b/.test(t)) {
    slug = "mario-kart-world";
  } else if (/mario\s*kart\s*8|\bmk8dx\b|\bmk8\b|\bdeluxe\b/.test(t)) {
    slug = "mario-kart-8-deluxe";
  }
  return slug && getTwitchGame(slug) ? slug : null;
}
