/**
 * Test persona accounts on dev (menus and account picks 2026-11-05, pick 6A): six accounts with real activity, one
 * per persona, made by `scripts/seed-preview-personas.ts`. Staff on the dev database sign in as one with a tap from
 * the View as control and come back with "Back to my account" (/api/staff/persona-account).
 *
 * Client-safe. Never on production: `devAccountsOn()` needs the dev database AND a deployment that isn't production.
 */

import { isProduction } from "@/lib/env";
import type { Interest } from "@/lib/interests/rules";

/** The dev Supabase project (the seed scripts refuse to run against anything else). */
export const DEV_PROJECT_REF = "rbtdomefinsrclgubpuf";
export const PERSONA_EMAIL_DOMAIN = "seed.gameshuffle.dev";

export interface DevPersonaAccount {
  handle: string;
  name: string;
  /** Who this person is, in a line, for the control. */
  line: string;
  interests: Interest[];
  plan: "free" | "pro";
  favoriteGames: string[];
}

export const DEV_PERSONA_ACCOUNTS: DevPersonaAccount[] = [
  { handle: "pv_kai", name: "Kai", line: "Competitive Mario Kart: lounge, times, MMR card", interests: ["competitive"], plan: "free", favoriteGames: ["Mario Kart 8 Deluxe", "Mario Kart World"] },
  { handle: "pv_sam", name: "Sam", line: "Casual: the dailies and a randomizer now and then", interests: ["daily"], plan: "free", favoriteGames: ["Mario Kart World", "Super Smash Bros. Ultimate"] },
  { handle: "pv_jordan", name: "Jordan", line: "Friends and family: party nights and trivia at home", interests: ["daily", "home"], plan: "free", favoriteGames: ["Super Mario Party Jamboree", "Mario Kart 8 Deluxe"] },
  { handle: "pv_mika", name: "Mika", line: "Pokémon: the Dex, Trainer Road, cards and decks", interests: ["daily", "pokemon"], plan: "free", favoriteGames: ["Pokémon TCG", "Pokémon Scarlet & Violet"] },
  { handle: "pv_rory", name: "Rory", line: "Streamer on GS Pro: streams, overlay, chat games", interests: ["competitive", "stream"], plan: "pro", favoriteGames: ["Mario Kart World", "Super Smash Bros. Ultimate"] },
  { handle: "pv_ana", name: "Ana", line: "Organizer: tournaments, a trivia league, game nights", interests: ["home", "events"], plan: "free", favoriteGames: ["Mario Kart 8 Deluxe", "Super Mario Party Jamboree"] },
];

export const personaEmail = (handle: string) => `${handle}@${PERSONA_EMAIL_DOMAIN}`;

export function devPersonaByHandle(handle: string | null | undefined): DevPersonaAccount | null {
  return DEV_PERSONA_ACCOUNTS.find((a) => a.handle === handle) ?? null;
}

export function devPersonaByEmail(email: string | null | undefined): DevPersonaAccount | null {
  const e = (email ?? "").toLowerCase();
  return DEV_PERSONA_ACCOUNTS.find((a) => personaEmail(a.handle) === e) ?? null;
}

/** True only against the dev database on a deployment that isn't production (localhost, dev.gameshuffle.co). */
export function devAccountsOn(): boolean {
  if (isProduction) return false;
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(`${DEV_PROJECT_REF}.supabase.co`);
}
