import "server-only";

/**
 * Screenshots of Quaxly's reply on the import page (picks 2026-10-29, 5A): phones can't copy an
 * embed, so people screenshot it, scrolling for a long list. Claude writes out what the pictures
 * say, word for word, and the same reader as a paste (readQuaxly) does the rest, so abbreviations,
 * holders and the title are handled one way. Shares the import's daily AI cap.
 */

import sharp from "sharp";
import { z } from "zod";
import { draftStructured, type AiImage } from "@/lib/ai/claude";
import { withAiTokens } from "@/lib/ai/tokens";
import { aiUsedToday, recordAiUse } from "@/lib/ai/usage";
import { lever } from "@/lib/pricing/catalog";
import { readQuaxly, type QuaxlyList } from "./quaxly";
import type { TtGame } from "./tracks";

export const MAX_SHOTS = 8;
export const MAX_SHOT_BYTES = 8 * 1024 * 1024;

const SCHEMA = z.object({
  title: z.string().nullable(),
  entries: z.array(z.object({ track: z.string(), time: z.string(), name: z.string().nullable() })),
});

export type ShotsResult = { ok: true; list: QuaxlyList | null } | { ok: false; error: "cap" | "not_configured" | "failed" | "bad_image" };

async function shrink(bytes: Uint8Array): Promise<AiImage | null> {
  try {
    const jpeg = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { base64: jpeg.toString("base64"), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function readShots(files: Uint8Array[], game: TtGame, userId: string): Promise<ShotsResult> {
  const cap = await lever("tt_imports_per_day", 5);
  if ((await aiUsedToday(userId, "tt_import")) >= cap) return { ok: false, error: "cap" };
  const images = (await Promise.all(files.slice(0, MAX_SHOTS).map(shrink))).filter((x): x is AiImage => !!x);
  if (!images.length) return { ok: false, error: "bad_image" };
  const { value: res, tokens } = await withAiTokens(() => draftStructured({
    system: "You copy time trial lists out of Discord screenshots, word for word. Never fix, guess or invent a time, a track or a name.",
    prompt: `These ${images.length === 1 ? "is a screenshot" : `are ${images.length} screenshots, in order,`} of a Discord bot's Mario Kart time trial list (often Quaxly's). Copy it out.

- title: the list's title line as written (like "150cc Shrooms"), or null.
- entries: one per time, in order. track = what the list calls the track, exactly as written (an abbreviation like "MKS" or "rMMM" stays an abbreviation). time = exactly as written (like 1:36.990). name = the name written under or beside that time, or null when there isn't one.
- Screenshots of a long list overlap: an entry that shows in two pictures goes in once.
- Leave out section headings ("Nitro tracks"), buttons and anything that isn't an entry.`,
    schema: SCHEMA,
    images,
    maxTokens: 12000,
  }));
  await recordAiUse(userId, "tt_import", tokens);
  if (!res.ok) return { ok: false, error: res.error === "not_configured" ? "not_configured" : "failed" };
  const text = [res.data.title ?? "", ...res.data.entries.flatMap((e) => [`${e.track}: ${e.time}`, ...(e.name ? [e.name] : [])])].join("\n");
  return { ok: true, list: readQuaxly(text, game) };
}
