/**
 * YouTube game detection (pure — no server-only, so it's unit-testable).
 *
 * YouTube's Data API doesn't expose the specific game for a live broadcast, so
 * we infer it from the broadcast title, matching against the supported
 * randomizer games. Used by the auto-session opener to bind a game (else the
 * session is queue-mode).
 */

import { getChatGame } from "@/lib/twitch/chatGames";

/** Title patterns, most specific first (Mario Kart World before 8 Deluxe, Stadium 2 before Stadium). */
const TITLE_PATTERNS: [RegExp, string][] = [
  [/mario\s*kart\s*world|\bmk\s*world\b|\bmkworld\b|\bmkw\b/, "mario-kart-world"],
  [/mario\s*kart\s*64|\bmk\s*64\b/, "mario-kart-64"],
  [/mario\s*kart\s*8|\bmk8dx\b|\bmk8\b|\bdeluxe\b/, "mario-kart-8-deluxe"],
  [/smash\s*(bros\.?\s*)?ultimate|\bssbu\b/, "super-smash-bros-ultimate"],
  [/jamboree/, "super-mario-party-jamboree"],
  [/mario\s*party\s*superstars/, "mario-party-superstars"],
  [/mario\s*party\s*3\b/, "mario-party-3"],
  [/mario\s*party\s*2\b/, "mario-party-2"],
  [/overwatch/, "overwatch"],
  [/marvel\s*rivals/, "marvel-rivals"],
  [/splatoon\s*3/, "splatoon-3"],
  [/air\s*riders/, "kirby-air-riders"],
  [/goldeneye/, "goldeneye-007"],
  [/perfect\s*dark/, "perfect-dark"],
  [/pok[eé]mon\s*stadium\s*2/, "pokemon-stadium-2"],
  [/pok[eé]mon\s*stadium/, "pokemon-stadium"],
];

/**
 * Best-effort game slug from a YouTube broadcast title. A bare "Mario Kart" or
 * "Mario Party" with no disambiguating token returns null (queue-mode). Only
 * returns a slug that has chat rolls.
 */
export function resolveYouTubeGameFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  const slug = TITLE_PATTERNS.find(([re]) => re.test(t))?.[1] ?? null;
  return slug && getChatGame(slug) ? slug : null;
}
