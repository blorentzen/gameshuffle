import "server-only";

/**
 * Tournament organizer helper (free with a daily cap while Circuit is in
 * preview): from the game, how many players and how long they have, suggest
 * a format we run and draft the description, rules and an announcement. The
 * organizer edits every word before anything is created or posted.
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";

export const AI_FORMATS = ["ffa_points", "single_elim", "double_elim", "heat_mains"] as const;
export type AiFormat = (typeof AI_FORMATS)[number];

export interface TournamentDraft { format: AiFormat; formatWhy: string; description: string; rules: string; announcement: string }

const FORMAT_NOTES = `Formats GameShuffle runs:
- ffa_points: everyone races or plays together each round, points by placement add up. Best for racing and party games, any size.
- single_elim: 1v1 bracket, lose once and you're out. Fast; best for fighting games and 8 to 32 players.
- double_elim: 1v1 bracket with a losers bracket. Fairer, takes about twice as long.
- heat_mains: heats seed a ladder of mains (C, B, A), like sprint car racing. Best for racing games with 12 or more players. Not for Mario Party or Smash.`;

const SYSTEM = `You help people run game tournaments on GameShuffle. Be practical and specific to the game. Rules are short bullet-style lines (one rule per line, no markdown symbols): match length, settings, tie-breaks, conduct, what happens on a disconnect. The organizer is hosting, not GameShuffle: write the description and announcement in their voice ("we", "our"), and only mention GameShuffle as where to sign up. Never invent prizes, dates, sponsors or links; if they matter, write a placeholder like [prize]. Don't use em dashes or en dashes.`;

const schema = z.object({
  format: z.enum(AI_FORMATS),
  formatWhy: z.string().describe("Under 140 characters"),
  description: z.string().describe("2 or 3 sentences for the tournament page, under 400 characters"),
  rules: z.string().describe("5 to 10 lines, one rule per line, under 1200 characters"),
  announcement: z.string().describe("A post for Discord or social, under 500 characters, with [date] and [link] placeholders"),
});

export async function draftTournament(args: { game: string; players: number; minutes: number; notes: string; allowHeat: boolean }): Promise<AiResult<TournamentDraft>> {
  const res = await draftStructured({
    system: SYSTEM,
    prompt: [
      `Game: ${args.game}`,
      `Expected players: ${args.players}. Time available: about ${args.minutes} minutes.`,
      args.notes ? `Organizer notes: ${args.notes.trim()}` : "",
      FORMAT_NOTES,
      args.allowHeat ? "" : "heat_mains isn't available for this game.",
    ].filter(Boolean).join("\n\n"),
    schema,
    effort: "low",
    maxTokens: 2500,
  });
  if (!res.ok) return res;
  const fix = (s: string, max: number) => s.replace(/[–—]/g, "-").trim().slice(0, max);
  const d = res.data;
  return {
    ok: true,
    data: {
      format: !args.allowHeat && d.format === "heat_mains" ? "ffa_points" : d.format,
      formatWhy: fix(d.formatWhy, 200),
      description: fix(d.description, 500),
      rules: fix(d.rules, 1500),
      announcement: fix(d.announcement, 700),
    },
  };
}
