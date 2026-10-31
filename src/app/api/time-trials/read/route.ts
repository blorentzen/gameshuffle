/**
 * POST /api/time-trials/read (multipart: file, game?) → stores the screenshot as proof and
 * reads the track, class and time from it for the player to check. Signed in; a daily cap
 * (lever tt_reads_per_day). Nothing is saved as a time here.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { siteActor } from "@/lib/timeTrials/players";
import { MAX_SCREENSHOT_BYTES, readScreenshot, readsLeft, storeScreenshot } from "@/lib/timeTrials/read";
import { isTtGame } from "@/lib/timeTrials/tracks";

export const runtime = "nodejs";
export const maxDuration = 60;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET() {
  const actor = await siteActor();
  if (!actor) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  return NextResponse.json({ ok: true, left: await readsLeft(actor.userId) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const actor = await siteActor();
  if (!actor?.userId) return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  if (!(await rateLimit(`tt-upload:${actor.userId}`, { max: 20, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
  if (file.size > MAX_SCREENSHOT_BYTES) return NextResponse.json({ ok: false, error: "too_big" }, { status: 400 });
  const gameRaw = form?.get("game");
  const game = isTtGame(gameRaw) ? gameRaw : null;

  const shot = await storeScreenshot(new Uint8Array(await file.arrayBuffer()), actor.userId);
  if (!shot) return NextResponse.json({ ok: false, error: "storage" }, { status: 503 });
  const res = await readScreenshot({ jpeg: shot.jpeg, game, userId: actor.userId, capKey: actor.player });
  // The screenshot still counts as proof when it can't be read (or the day's reads are used up).
  if (!res.ok) return NextResponse.json({ ok: true, proofUrl: shot.url, read: null, error: res.error, left: res.error === "cap" ? 0 : undefined });
  return NextResponse.json({ ok: true, proofUrl: shot.url, read: res.read, left: res.left }, { headers: { "Cache-Control": "private, no-store" } });
}
