import "server-only";

/**
 * Reading a war's final results screenshot for its table (war tools pick 4A): every player's name as shown, their
 * points total and their row color, so the table fills itself and the war's totals catch a misread. Free with a daily
 * cap (war_reads_per_day, 10; accounts counted as "war_read", others rate limited by Discord id).
 */

import sharp from "sharp";
import { z } from "zod";
import { draftStructured } from "@/lib/ai/claude";
import { withAiTokens } from "@/lib/ai/tokens";
import { aiUsedToday, recordAiUse } from "@/lib/ai/usage";
import { rateLimit } from "@/lib/ratelimit";
import type { ReadRow } from "./table";

const CAP = 10;

const SCHEMA = z.object({
  isResults: z.boolean().describe("True when this is a Mario Kart results screen listing players with points"),
  rows: z.array(z.object({
    name: z.string().describe("The player's name exactly as shown"),
    points: z.number().int().describe("The points total shown for the player (the running total, not the +points just won)"),
    color: z.enum(["red", "blue", "green", "yellow", "orange", "purple", "pink", "none"]).describe("The row's team color, or none"),
  })).describe("Every player row, top to bottom"),
});

export type TableRead = { ok: true; rows: ReadRow[] } | { ok: false; error: "cap" | "not_results" | "failed" };

export async function readResults(bytes: Uint8Array, args: { userId: string | null; capKey: string }): Promise<TableRead> {
  if (args.userId) {
    if ((await aiUsedToday(args.userId, "war_read")) >= CAP) return { ok: false, error: "cap" };
  } else if (!(await rateLimit(`war-read:${args.capKey}`, { max: CAP, windowMs: 24 * 60 * 60_000 })).ok) {
    return { ok: false, error: "cap" };
  }
  const jpeg = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer().catch(() => null);
  if (!jpeg) return { ok: false, error: "failed" };
  try {
    const { value: res, tokens } = await withAiTokens(() => draftStructured({
      system: "You read Mario Kart 8 Deluxe and Mario Kart World online results screens and report exactly what they show. Never invent a name or a digit.",
      prompt: "This should be the results screen at the end of a war: up to 12 (or 24) players, each row with a name and a points total, rows often colored by team. List every row top to bottom. Copy names exactly, including any team tag at the start or the end and any symbol between the tag and the name; write a symbol you can't make out as □. Use the total on the right of each row, not the points just added for the last race. If it isn't a results screen, say so.",
      schema: SCHEMA,
      image: { base64: jpeg.toString("base64"), mediaType: "image/jpeg" },
      maxTokens: 2000,
    }));
    if (args.userId) await recordAiUse(args.userId, "war_read", tokens).catch(() => undefined);
    if (!res.ok) return { ok: false, error: "failed" };
    if (!res.data.isResults || !res.data.rows.length) return { ok: false, error: "not_results" };
    return {
      ok: true,
      rows: res.data.rows.slice(0, 24).map((r) => ({ name: r.name.trim().slice(0, 32), score: Math.max(0, Math.min(9999, Math.round(r.points))), color: r.color === "none" ? null : r.color })),
    };
  } catch (err) {
    console.error("[wars] results read failed:", err);
    return { ok: false, error: "failed" };
  }
}
