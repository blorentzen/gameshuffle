import "server-only";

/**
 * The automatic check on an uploaded picture (GIF uploads round 2, 2026-10-31: every upload gets one; first used by
 * war logos and table backgrounds). Claude looks at a small copy and says ok, unsure or refuse:
 *   refuse  sexual content or nudity, gore, hate symbols or slurs, a real person's private details, harassment
 *   unsure  it can't tell (or the check couldn't run): the picture works where its uploader put it but stays off
 *           GameShuffle's own pages until staff look
 *   ok      shown anywhere
 * Daily cap per uploader (rate limited by `capKey`); usage recorded for accounts as feature "image_check".
 */

import sharp from "sharp";
import { z } from "zod";
import { draftStructured } from "@/lib/ai/claude";
import { withAiTokens } from "@/lib/ai/tokens";
import { recordAiUse } from "@/lib/ai/usage";
import { rateLimit } from "@/lib/ratelimit";

export type ImageVerdict = "ok" | "unsure" | "refuse";
export interface ImageCheck { verdict: ImageVerdict; reason: string; ran: boolean }

const SCHEMA = z.object({
  verdict: z.enum(["ok", "unsure", "refuse"]),
  reason: z.string().describe("One short plain sentence, only when not ok"),
});

const SYSTEM = `You check pictures people upload to GameShuffle, a family-friendly site for game nights and competitive Mario Kart, before they're shown to others.
Refuse: nudity or sexual content, gore or graphic injury, hate symbols or slurs, text that harasses someone, a real person's private details (addresses, phone numbers), anything showing a minor in a sexual or harmful way.
Fine: team logos, game art and screenshots, characters, mascots, memes without the above, photos of places or people in ordinary settings, mild cartoon violence typical of video games, team names with mild trash talk.
Say unsure only when the picture might break a rule and you can't tell.`;

const DAILY = 40;

/** Checks a picture (any format sharp opens). Never throws. */
/** `daily`: a higher cap for one place that takes many at once (a server owner's bulk team logos). */
export async function checkImage(img: Buffer, args: { use: string; userId: string | null; capKey: string; daily?: number }): Promise<ImageCheck> {
  const small = await sharp(img, { animated: false }).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#808080" }).jpeg({ quality: 80 }).toBuffer().catch(() => null);
  if (!small) return { verdict: "refuse", reason: "That file couldn't be opened as a picture.", ran: false };
  if (!(await rateLimit(`image-check:${args.capKey}`, { max: args.daily ?? DAILY, windowMs: 24 * 60 * 60_000 })).ok) {
    return { verdict: "unsure", reason: "Too many uploads today to check them all.", ran: false };
  }
  try {
    const { value: res, tokens } = await withAiTokens(() => draftStructured({
      system: SYSTEM,
      prompt: `This picture is going to be used as a ${args.use}. Check it.`,
      schema: SCHEMA,
      effort: "low",
      maxTokens: 400,
      image: { base64: small.toString("base64"), mediaType: "image/jpeg" },
    }));
    if (args.userId) await recordAiUse(args.userId, "image_check", tokens).catch(() => undefined);
    if (!res.ok) return { verdict: "unsure", reason: "The check couldn't run.", ran: false };
    return { verdict: res.data.verdict, reason: res.data.reason.trim().slice(0, 160), ran: true };
  } catch (err) {
    console.error("[image check] failed:", err);
    return { verdict: "unsure", reason: "The check couldn't run.", ran: false };
  }
}

const GIF_SCHEMA = SCHEMA.extend({
  alt: z.string().describe("What the GIF shows, in one short plain line for screen readers (under 100 characters), no 'GIF of'"),
});

/**
 * The check for an uploaded GIF: `sheet` holds up to four of its frames in order (src/lib/gifs/process.ts). Same rules
 * as checkImage, plus a suggested description the uploader can change. Never throws; shares checkImage's daily cap.
 */
/** `use`: where it's going, when it isn't a GIF upload (a moving picture in a community post). */
export async function checkGifFrames(sheet: Buffer, args: { userId: string; capKey: string; use?: string }): Promise<ImageCheck & { alt: string }> {
  if (!(await rateLimit(`image-check:${args.capKey}`, { max: DAILY, windowMs: 24 * 60 * 60_000 })).ok) {
    return { verdict: "unsure", reason: "Too many uploads today to check them all.", ran: false, alt: "" };
  }
  try {
    const { value: res, tokens } = await withAiTokens(() => draftStructured({
      system: SYSTEM,
      prompt: args.use
        ? `These are up to four frames from an animated picture, in order (left to right, then top to bottom). It's going to be used as a ${args.use}. Check it, and describe what it shows.`
        : "These are up to four frames from an animated GIF, in order (left to right, then top to bottom). The uploader wants to use it in comments and messages, and may share it with everyone. Check it, and describe what it shows.",
      schema: GIF_SCHEMA,
      effort: "low",
      maxTokens: 400,
      image: { base64: sheet.toString("base64"), mediaType: "image/jpeg" },
    }));
    await recordAiUse(args.userId, "image_check", tokens).catch(() => undefined);
    if (!res.ok) return { verdict: "unsure", reason: "The check couldn't run.", ran: false, alt: "" };
    return { verdict: res.data.verdict, reason: res.data.reason.trim().slice(0, 160), ran: true, alt: res.data.alt.trim().slice(0, 160) };
  } catch (err) {
    console.error("[gif check] failed:", err);
    return { verdict: "unsure", reason: "The check couldn't run.", ran: false, alt: "" };
  }
}
