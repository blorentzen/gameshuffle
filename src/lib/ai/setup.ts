import "server-only";

/**
 * Plain-language setup for randomizers (free with a daily cap): "four of us,
 * chaos night, no Oddjob" or "give me a rain team" becomes the randomizer's
 * own options. AI only sets the rules and any Pokémon someone asked for; the
 * randomizer still does every roll, so results stay random and fair.
 *
 * One entry per randomizer: what its options mean (for the prompt) and a zod
 * schema for the answer. Every field is nullable: null means "not mentioned,
 * leave it as it is".
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { STADIUM_GAMES } from "@/lib/pokemon/stadium";

const summary = z.string().describe("One short sentence saying what you set, e.g. 'Set up 4 players, no Oddjob, team scenarios on.' Mention anything you couldn't do.");

const goldeneye = z.object({
  players: z.number().int().nullable().describe("2 to 4"),
  freshSave: z.boolean().nullable().describe("Only what's open on a new save (6 maps, 8 characters)"),
  noOddjob: z.boolean().nullable().describe("Leave Oddjob out (a common house rule)"),
  allowTeams: z.boolean().nullable().describe("Allow team scenarios"),
  handicaps: z.boolean().nullable().describe("Random health handicaps per player"),
  cheat: z.boolean().nullable().describe("Add one random cheat (DK mode, paintball, turbo...)"),
  cast: z.enum(["main", "additional"]).nullable().describe("main = Bond, Natalya and the named villains; additional = soldiers, guards and extras"),
  summary,
});

const stadiumCups = STADIUM_GAMES.map((g) => `${g.slug} (${g.label}): ${g.cups.map((c) => `${c.id} = ${c.name}`).join(", ")}`).join("\n");
const stadiumSpecies = [...new Set(STADIUM_GAMES.flatMap((g) => g.cups.flatMap((c) => c.rentals.map((r) => r.name.replace(/^Surfing /, "")))))].sort();

const stadium = z.object({
  game: z.string().nullable().describe("A game slug from the list"),
  cup: z.string().nullable().describe("A cup id from that game"),
  players: z.number().int().nullable().describe("1 to 4"),
  noRepeat: z.boolean().nullable().describe("No Pokémon on more than one player's team"),
  pickThree: z.boolean().nullable().describe("Also pick the 3 each player brings into battle"),
  round2: z.boolean().nullable().describe("Include Round 2 rentals (Mew; Celebi)"),
  requests: z.array(z.object({
    player: z.number().int().describe("1-based player number"),
    pokemon: z.array(z.string()).describe("Species names from the allowed list, at most 6"),
  })).describe("Pokémon someone asked for by name or by theme (e.g. a rain team, all Fire types). Empty if none."),
  summary,
});

export const SETUP_GAMES = {
  "goldeneye-007": {
    schema: goldeneye,
    brief: "GoldenEye 007 multiplayer randomizer. It rolls a scenario, map, weapons and game length, and a character per player. Words like chaos, silly or party night mean turn on handicaps and a cheat; serious, competitive or sweaty mean turn them off.",
  },
  "pokemon-stadium": {
    schema: stadium,
    brief: `Pokémon Stadium rental team randomizer. It rolls 6 rentals per player for the chosen cup.\nGames and cups:\n${stadiumCups}\nWhen someone wants a themed team (rain, a type, a favorite), pick fitting species from this list only, at most 6 per player:\n${stadiumSpecies.join(", ")}`,
  },
} as const;

export type SetupGame = keyof typeof SETUP_GAMES;
export function isSetupGame(v: unknown): v is SetupGame {
  return typeof v === "string" && v in SETUP_GAMES;
}

const SYSTEM = `You turn what someone types about their game night into a randomizer's settings. Only set what they asked for or clearly implied; leave everything else null. Never pick results the randomizer should roll (scenarios, maps, characters), except Pokémon someone explicitly asked for. Don't use em dashes or en dashes.`;

export async function readSetup(game: SetupGame, text: string): Promise<AiResult<Record<string, unknown>>> {
  const spec = SETUP_GAMES[game];
  const res = await draftStructured({
    system: SYSTEM,
    prompt: `Randomizer: ${spec.brief}\n\nWhat they typed: ${text.trim()}`,
    schema: spec.schema,
    effort: "low",
    maxTokens: 1500,
  });
  if (!res.ok) return res;
  const data = res.data as Record<string, unknown>;
  if (game === "pokemon-stadium") {
    // Keep only real species names.
    const known = new Set(stadiumSpecies.map((s) => s.toLowerCase()));
    const reqs = (data.requests as { player: number; pokemon: string[] }[] | undefined) ?? [];
    data.requests = reqs.map((r) => ({ player: r.player, pokemon: r.pokemon.filter((p) => known.has(p.toLowerCase())).slice(0, 6) })).filter((r) => r.pokemon.length);
  }
  return { ok: true, data };
}
