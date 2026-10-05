import "server-only";

/**
 * Game night planner (free with a daily cap): from how many are playing, how
 * long they have, the console games they own and the vibe, suggest a lineup
 * of games a live night can run (console games plus our phone games) and,
 * optionally, one Jackbox game that fits. Every pick comes from our own lists,
 * so the lineup can start as a live night in one tap.
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { NIGHT_GAMES, nightGame } from "@/lib/nights/games";
import { JACKBOX_GAMES } from "@/data/jackbox";

export interface PlanStep { slug: string; label: string; length: number; unit: string; why: string }
export interface NightPlan { title: string; steps: PlanStep[]; jackbox: { name: string; pack: string; why: string } | null; summary: string }

const schema = z.object({
  title: z.string().describe("A short, fun name for the night, under 40 characters"),
  steps: z.array(z.object({
    slug: z.string().describe("A slug from the allowed list"),
    length: z.number().int().describe("How many of the game's units to play (races, turns, rounds, games)"),
    why: z.string().describe("Under 90 characters: why it fits here"),
  })).describe("2 to 5 games in play order"),
  jackbox: z.object({ name: z.string(), why: z.string() }).nullable().describe("One Jackbox game from the list that fits, or null"),
  summary: z.string().describe("One sentence on how the night flows"),
});

const SYSTEM = `You plan game nights for GameShuffle. Pick only from the lists you're given. Fit the time: a Mario Kart race is about 3 minutes, a Mario Party turn about 3 minutes (so 10 turns is 30 minutes), a Smash game about 4 minutes, a phone game round about 3 minutes. Open with something everyone can jump into, put the longest game in the middle, and close with a social phone game when there's time. Respect player counts: Mario Kart and Mario Party take up to 4 locally, phone games need at least 3 people. Keep it varied. Don't use em dashes or en dashes.`;

export async function planNight(args: { players: number; minutes: number; own: string[]; vibe: string }): Promise<AiResult<NightPlan>> {
  const ownSet = new Set(args.own);
  const allowed = NIGHT_GAMES.filter((g) => g.kind === "activity" ? args.players >= 3 : ownSet.has(g.slug));
  if (!allowed.length) return { ok: false, error: "failed" };
  const jackbox = JACKBOX_GAMES.filter((g) => args.players >= g.minPlayers && args.players <= g.maxPlayers && !g.adultsOnly);
  const prompt = [
    `Players: ${args.players}. Time: about ${args.minutes} minutes.`,
    args.vibe ? `What they said about the night: ${args.vibe.trim()}` : "",
    `Allowed games (slug: name, unit, usual length):\n${allowed.map((g) => `${g.slug}: ${g.label}, ${g.unit}s, usually ${g.defaultLength}${g.kind === "activity" ? " (phone game, GameShuffle Original)" : ""}`).join("\n")}`,
    jackbox.length ? `Jackbox games that fit ${args.players} players:\n${jackbox.map((g) => `${g.name} (${g.packs[0]})`).join("; ")}` : "No Jackbox game fits this player count, so jackbox must be null.",
  ].filter(Boolean).join("\n\n");

  const res = await draftStructured({ system: SYSTEM, prompt, schema, effort: "low", maxTokens: 2000 });
  if (!res.ok) return res;
  const allowedSlugs = new Set(allowed.map((g) => g.slug));
  const steps: PlanStep[] = res.data.steps
    .filter((s) => allowedSlugs.has(s.slug))
    .slice(0, 5)
    .map((s) => {
      const g = nightGame(s.slug)!;
      return { slug: g.slug, label: g.label, unit: g.unit, length: Math.max(1, Math.min(g.unit === "turn" ? 30 : 16, s.length || g.defaultLength)), why: s.why.replace(/[–—]/g, "-").slice(0, 120) };
    });
  if (!steps.length) return { ok: false, error: "failed" };
  const jb = res.data.jackbox ? jackbox.find((g) => g.name.toLowerCase() === res.data.jackbox!.name.toLowerCase()) : undefined;
  return {
    ok: true,
    data: {
      title: res.data.title.replace(/[–—]/g, "-").slice(0, 60),
      steps,
      jackbox: jb ? { name: jb.name, pack: jb.packs[0], why: res.data.jackbox!.why.slice(0, 120) } : null,
      summary: res.data.summary.replace(/[–—]/g, "-").slice(0, 240),
    },
  };
}

