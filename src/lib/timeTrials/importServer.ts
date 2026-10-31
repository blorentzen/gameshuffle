import "server-only";

/**
 * The paste import's fallback: when the line reader can't read most of a paste,
 * Claude turns it into rows (any layout: Quaxly's, a spreadsheet, a message).
 * Counted apart from the shared AI allowance, with its own daily cap.
 */

import { z } from "zod";
import { draftStructured } from "@/lib/ai/claude";
import { withAiTokens } from "@/lib/ai/tokens";
import { aiUsedToday, recordAiUse } from "@/lib/ai/usage";
import { lever } from "@/lib/pricing/catalog";
import { parseTime } from "./rules";
import { matchTrack, TT_GAMES, ttTracks, type TtClass, type TtGame } from "./tracks";
import type { ImportRow } from "./importText";

export const MAX_IMPORT_CHARS = 12_000;

const SCHEMA = z.object({
  rows: z.array(z.object({
    line: z.string(),
    track: z.string().nullable(),
    speed: z.enum(["150cc", "200cc", "unknown"]),
    time: z.string().nullable(),
  })),
});

export type AiImportResult = { ok: true; rows: ImportRow[] } | { ok: false; error: "cap" | "not_configured" | "failed" };

export async function aiImport(text: string, game: TtGame, userId: string): Promise<AiImportResult> {
  const cap = await lever("tt_imports_per_day", 5);
  if ((await aiUsedToday(userId, "tt_import")) >= cap) return { ok: false, error: "cap" };
  const info = TT_GAMES[game];
  const { value: res, tokens } = await withAiTokens(() => draftStructured({
    system: "You turn pasted lists of Mario Kart time trial records into rows. Copy every time exactly; never invent one.",
    prompt: `This is a list of someone's ${info.label} time trial times, pasted from a Discord bot, a spreadsheet or a message. Give one row per time.

For each row:
- line: the text the row came from.
- track: the course, copied exactly from the list below (match abbreviations and shortened names to the right course), or null if you can't tell which.
- speed: 150cc or 200cc if the text says, else "unknown".${info.classes.length === 1 ? " (This game only has 150cc.)" : ""}
- time: the 3-lap total as m:ss.mmm, exactly as written, or null.

Courses: ${ttTracks(game).map((t) => t.name).join("; ")}

The paste:
"""
${text.slice(0, MAX_IMPORT_CHARS)}
"""`,
    schema: SCHEMA,
    maxTokens: 12000,
  }));
  await recordAiUse(userId, "tt_import", tokens);
  if (!res.ok) return { ok: false, error: res.error === "not_configured" ? "not_configured" : "failed" };
  const rows: ImportRow[] = res.data.rows.slice(0, 400).map((r) => {
    const track = r.track ? matchTrack(r.track, game) : null;
    const want = r.speed === "200cc" ? 200 : 150;
    const cc = ((info.classes as number[]).includes(want) ? want : info.classes[0]) as TtClass;
    return { line: r.line.slice(0, 200), game, trackId: track?.id ?? null, trackName: track?.name ?? null, trackText: track ? null : r.track, cc, timeMs: r.time ? parseTime(r.time) : null };
  });
  return { ok: true, rows };
}
