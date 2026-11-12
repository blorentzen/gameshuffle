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
  // Wii first: "MKW" stays Mario Kart World, but "Mario Kart Wii" and "MKWii" are Wii.
  [/mario\s*kart\s*wii\b|\bmk\s*wii\b|\bmkwii\b/, "mario-kart-wii"],
  [/mario\s*kart\s*world|\bmk\s*world\b|\bmkworld\b|\bmkw\b/, "mario-kart-world"],
  [/mario\s*kart\s*64|\bmk\s*64\b/, "mario-kart-64"],
  [/double\s*dash|\bmkdd\b/, "mario-kart-double-dash"],
  // "Mario Kart DS" / "MKDS" before "Mario Kart 8 Deluxe" (whose pattern takes a bare "deluxe").
  [/mario\s*kart\s*ds\b|\bmk\s*ds\b|\bmkds\b/, "mario-kart-ds"],
  // "Super Mario Kart" before the bare Mario Kart patterns; "Mario Kart 7" before 8 Deluxe.
  [/super\s*mario\s*kart|\bsmk\b/, "super-mario-kart"],
  [/mario\s*kart\s*7\b|\bmk\s*7\b|\bmk7\b/, "mario-kart-7"],
  [/mario\s*kart\s*8|\bmk8dx\b|\bmk8\b|\bdeluxe\b/, "mario-kart-8-deluxe"],
  [/smash\s*(bros\.?\s*)?ultimate|\bssbu\b/, "super-smash-bros-ultimate"],
  [/smash\s*(bros\.?\s*)?melee|\bssbm\b/, "super-smash-bros-melee"],
  [/jamboree/, "super-mario-party-jamboree"],
  [/mario\s*party\s*superstars/, "mario-party-superstars"],
  [/mario\s*party\s*3\b/, "mario-party-3"],
  [/mario\s*party\s*2\b/, "mario-party-2"],
  [/overwatch/, "overwatch"],
  [/marvel\s*rivals/, "marvel-rivals"],
  [/splatoon\s*3/, "splatoon-3"],
  [/air\s*riders/, "kirby-air-riders"],
  [/cross\s*worlds/, "sonic-racing-crossworlds"],
  [/mario\s*(bros\.?\s*)?wonder|\bsmbw\b/, "super-mario-bros-wonder"],
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
