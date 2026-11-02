import "server-only";

/**
 * Reading a lounge room's results screenshot into a table's text (lounge plan step 1). Race rooms: every row's name,
 * points total and team color, written as Lorenzi's text (team rooms grouped by row color). Knockout rooms: every name
 * in finishing order. The reporter checks the text before it goes anywhere. A ladder can have 300 read a day.
 */

import sharp from "sharp";
import { z } from "zod";
import { draftStructured } from "@/lib/ai/claude";
import { withAiTokens } from "@/lib/ai/tokens";
import { recordAiUse } from "@/lib/ai/usage";
import { rateLimit } from "@/lib/ratelimit";
import type { LadderKind } from "./types";

const PER_DAY = 300;

const RACE = z.object({
  isResults: z.boolean().describe("True when this is a Mario Kart results screen listing players with points"),
  rows: z.array(z.object({
    name: z.string().describe("The player's name exactly as shown"),
    points: z.number().int().describe("The points total shown for the player (the running total, not the points just added)"),
    color: z.enum(["red", "blue", "green", "yellow", "orange", "purple", "pink", "none"]).describe("The row's team color, or none"),
  })).describe("Every player row, top to bottom"),
});
const KNOCKOUT = z.object({
  isResults: z.boolean().describe("True when this is a Mario Kart World Knockout Tour results screen"),
  names: z.array(z.string()).describe("Every player's name exactly as shown, in finishing order: 1st first"),
});

export type ShotRead = { ok: true; body: string; notes: string[] } | { ok: false; error: "cap" | "not_results" | "failed" };

/** Rows read from a race results screen, as a table's text for this format. */
export function raceBody(rows: { name: string; points: number; color: string | null }[], format: number): { body: string; notes: string[] } {
  const lines = (list: typeof rows) => list.map((r) => `${r.name} ${r.points}`).join("\n");
  if (format === 1) return { body: lines(rows), notes: [] };
  const colors = [...new Set(rows.map((r) => r.color ?? "none"))];
  const teams = 12 / format;
  if (!colors.includes("none") && colors.length === teams) {
    return { body: colors.map((c) => `${c[0].toUpperCase()}${c.slice(1)}\n${lines(rows.filter((r) => r.color === c))}`).join("\n"), notes: [] };
  }
  return { body: lines(rows), notes: ["The teams couldn't be told apart by color, so they're grouped in the order the screen lists them. Check them, or add a line with each team's name above its players."] };
}

export async function readLadderShot(bytes: Uint8Array, args: { kind: LadderKind; format: number; ladderId: string; userId: string | null }): Promise<ShotRead> {
  if (!(await rateLimit(`ladder-read:${args.ladderId}`, { max: PER_DAY, windowMs: 24 * 60 * 60_000 })).ok) return { ok: false, error: "cap" };
  const jpeg = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer().catch(() => null);
  if (!jpeg) return { ok: false, error: "failed" };
  const image = { base64: jpeg.toString("base64"), mediaType: "image/jpeg" as const };
  const system = "You read Mario Kart 8 Deluxe and Mario Kart World online results screens and report exactly what they show. Never invent a name or a digit.";
  try {
    if (args.kind === "knockout") {
      const { value: res, tokens } = await withAiTokens(() => draftStructured({
        system,
        prompt: "This should be the results screen at the end of a Mario Kart World Knockout Tour: up to 24 players in finishing order. List every name from 1st to last, exactly as shown. If it isn't a Knockout Tour results screen, say so.",
        schema: KNOCKOUT, image, maxTokens: 1500,
      }));
      if (args.userId) await recordAiUse(args.userId, "ladder_read", tokens).catch(() => undefined);
      if (!res.ok) return { ok: false, error: "failed" };
      if (!res.data.isResults || !res.data.names.length) return { ok: false, error: "not_results" };
      return { ok: true, body: res.data.names.slice(0, 24).map((n, i) => `${i + 1}. ${n.trim().slice(0, 32)}`).join("\n"), notes: [] };
    }
    const { value: res, tokens } = await withAiTokens(() => draftStructured({
      system,
      prompt: "This should be the results screen at the end of a 12-player lounge room: every row with a name and a points total, rows colored by team in team rooms. List every row top to bottom. Copy names exactly. Use the total on the right of each row, not the points just added for the last race. If it isn't a results screen, say so.",
      schema: RACE, image, maxTokens: 2000,
    }));
    if (args.userId) await recordAiUse(args.userId, "ladder_read", tokens).catch(() => undefined);
    if (!res.ok) return { ok: false, error: "failed" };
    if (!res.data.isResults || !res.data.rows.length) return { ok: false, error: "not_results" };
    const rows = res.data.rows.slice(0, 24).map((r) => ({ name: r.name.trim().slice(0, 32), points: Math.max(0, Math.min(9999, Math.round(r.points))), color: r.color === "none" ? null : r.color }));
    return { ok: true, ...raceBody(rows, args.format) };
  } catch (err) {
    console.error("[ladders] screenshot read failed:", err);
    return { ok: false, error: "failed" };
  }
}
