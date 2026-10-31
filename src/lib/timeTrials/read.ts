import "server-only";

/**
 * Reading a time from a screenshot (picks 2026-10-29: Claude reads it, the player
 * confirms before it saves; free with a daily cap). The screenshot is kept as the
 * time's proof in our own storage (Discord's attachment links expire).
 */

import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { draftStructured } from "@/lib/ai/claude";
import { withAiTokens } from "@/lib/ai/tokens";
import { aiUsedToday, recordAiUse } from "@/lib/ai/usage";
import { lever } from "@/lib/pricing/catalog";
import { rateLimit } from "@/lib/ratelimit";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { parseTime } from "./rules";
import { matchTrack, TT_GAMES, TT_GAME_ORDER, ttTracks, type TtClass, type TtGame } from "./tracks";

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const READS_LEVER = "tt_reads_per_day";
const READS_DEFAULT = 10;

export interface StoredShot { url: string; jpeg: Buffer }

/** Shrinks a screenshot, keeps a webp copy as proof and returns a jpeg to read. Null when it isn't an image we can open. */
export async function storeScreenshot(bytes: Uint8Array, ownerId: string): Promise<StoredShot | null> {
  if (!isR2Configured()) return null;
  try {
    const base = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
    const [webp, jpeg] = await Promise.all([base.clone().webp({ quality: 82 }).toBuffer(), base.clone().jpeg({ quality: 82 }).toBuffer()]);
    const url = await uploadToR2(`time-trials/${ownerId}/${randomBytes(8).toString("hex")}.webp`, new Uint8Array(webp), "image/webp");
    return { url, jpeg };
  } catch (err) {
    console.error("[tt] screenshot store failed:", err);
    return null;
  }
}

export interface ScreenshotRead {
  game: TtGame | null;
  trackId: string | null;
  trackName: string | null;
  cc: TtClass | null;
  timeMs: number | null;
  /** When the picture isn't a time trial result. */
  notResult: boolean;
}

export type ReadResult = { ok: true; read: ScreenshotRead; left: number } | { ok: false; error: "cap" | "not_configured" | "failed" };

/** How many reads a player has left today: accounts by their AI use, Discord-only players by a rate limit. */
export async function readsLeft(userId: string | null): Promise<number> {
  const cap = await lever(READS_LEVER, READS_DEFAULT);
  if (!userId) return cap;
  return Math.max(0, cap - (await aiUsedToday(userId, "tt_read")));
}

const SCHEMA = z.object({
  isTimeTrialResult: z.boolean(),
  game: z.enum(["mkworld", "mk8dx", "unknown"]),
  track: z.string().nullable(),
  speed: z.enum(["150cc", "200cc", "unknown"]),
  time: z.string().nullable(),
});

function prompt(game: TtGame | null): string {
  const games = game ? [game] : TT_GAME_ORDER;
  const lists = games.map((g) => `${TT_GAMES[g].label} courses:\n${ttTracks(g).map((t) => t.name).join("; ")}`).join("\n\n");
  return `Read this screenshot. It should show the result of a Mario Kart ${game ? TT_GAMES[game].label : "World or Mario Kart 8 Deluxe"} Time Trial (a finish screen, a records screen or a ghost screen).

Return:
- isTimeTrialResult: false if it isn't a Mario Kart time trial result or record at all.
- game: which game it is from, or "unknown".
- track: the course, copied exactly from the list below, or null if the screenshot doesn't show which course it is. Don't guess from scenery unless the course is clear.
- speed: 150cc or 200cc if shown, else "unknown".
- time: the total time for the 3 laps exactly as shown, as m:ss.mmm (for example 1:52.384), or null if you can't read every digit. Not a lap time.

${lists}`;
}

/** Asks Claude to read a screenshot (already stored as proof). Counts toward the player's daily reads. */
export async function readScreenshot(args: { jpeg: Buffer; game: TtGame | null; userId: string | null; capKey: string }): Promise<ReadResult> {
  const cap = await lever(READS_LEVER, READS_DEFAULT);
  let left: number;
  if (args.userId) {
    left = cap - (await aiUsedToday(args.userId, "tt_read"));
    if (left <= 0) return { ok: false, error: "cap" };
  } else {
    if (!(await rateLimit(`tt-read:${args.capKey}`, { max: cap, windowMs: 24 * 60 * 60_000 })).ok) return { ok: false, error: "cap" };
    left = cap;
  }
  const { value: res, tokens } = await withAiTokens(() => draftStructured({
    system: "You read Mario Kart time trial screenshots and report exactly what they show. Never invent a digit or a course.",
    prompt: prompt(args.game),
    schema: SCHEMA,
    image: { base64: args.jpeg.toString("base64"), mediaType: "image/jpeg" },
    maxTokens: 1000,
  }));
  if (args.userId) await recordAiUse(args.userId, "tt_read", tokens);
  if (!res.ok) return { ok: false, error: res.error === "not_configured" ? "not_configured" : "failed" };
  const d = res.data;
  const game: TtGame | null = args.game ?? (d.game === "unknown" ? null : d.game);
  const track = d.track ? matchTrack(d.track, game ?? undefined) : null;
  const cc = d.speed === "200cc" ? 200 : d.speed === "150cc" ? 150 : null;
  const finalGame = track?.game ?? game;
  return {
    ok: true,
    left: Math.max(0, left - 1),
    read: {
      game: finalGame,
      trackId: track?.id ?? null,
      trackName: track?.name ?? null,
      cc: cc && finalGame && (TT_GAMES[finalGame].classes as number[]).includes(cc) ? (cc as TtClass) : null,
      timeMs: d.time ? parseTime(d.time) : null,
      notResult: !d.isTimeTrialResult,
    },
  };
}
