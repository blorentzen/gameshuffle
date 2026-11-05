/**
 * POST /api/mmr/picture (multipart: file) → { url } — an MMR card's own background picture (GS Pro or Supporter
 * looks): a still PNG, JPG or WebP, up to 4 MB, checked before it's stored (it plays on a stream). A moving
 * background is one of your GIFs instead (the studio's "From your GIFs", saved only when it passed the GIF check):
 * a background is a picture or a GIF, never a GIF sneaked in as a picture (Britton, 2026-11-03).
 *   errors: bad_type (not PNG, JPG or WebP), animated (it moves: pick it from your GIFs), refused { reason },
 *           check_unavailable, too_big, pro_required, storage_off, slow_down
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { hasLooks } from "@/lib/support/looks";
import { rateLimit } from "@/lib/ratelimit";
import sharp from "sharp";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { checkImage } from "@/lib/moderation/imageCheck";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await hasLooks(user.id))) return NextResponse.json({ error: "pro_required" }, { status: 403 });
  if (!isR2Configured()) return NextResponse.json({ error: "storage_off" }, { status: 503 });
  if (!(await rateLimit(`mmr-picture:${user.id}`, { max: 10, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const frames = await sharp(bytes, { animated: true }).metadata().then((m) => (m.width ? m.pages ?? 1 : 0)).catch(() => 0);
  if (!frames) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  if (frames > 1) return NextResponse.json({ error: "animated" }, { status: 400 });
  const check = await checkImage(bytes, { use: "background picture on a live stream overlay", userId: user.id, capKey: `u:${user.id}` });
  if (!check.ran) return NextResponse.json({ error: "check_unavailable" }, { status: 503 });
  if (check.verdict !== "ok") return NextResponse.json({ error: "refused", reason: check.reason }, { status: 422 });
  const url = await uploadToR2(`mmr/${user.id}/${randomBytes(8).toString("hex")}.${ext}`, new Uint8Array(bytes), file.type);
  return NextResponse.json({ url });
}
