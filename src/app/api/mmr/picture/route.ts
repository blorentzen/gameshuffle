/**
 * POST /api/mmr/picture (multipart: file) → { url } — an MMR card's own background (GS Pro or Supporter looks)
 * (PNG, JPG, WebP or an animated GIF, up to 4 MB), stored with the other uploads.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { hasLooks } from "@/lib/support/looks";
import { rateLimit } from "@/lib/ratelimit";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

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
  const url = await uploadToR2(`mmr/${user.id}/${randomBytes(8).toString("hex")}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
  return NextResponse.json({ url });
}
