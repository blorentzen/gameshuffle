/**
 * POST /api/uploads/part?upload=<uuid>&i=<n> (body: the part's bytes) → { ok } — one part of a file too big for one
 * request (src/lib/uploads/parts.ts). The route that wants the file takes it with takeUpload.
 *   errors: signin, bad_request, too_big, slow_down, storage_off
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { isR2Configured } from "@/lib/storage/r2";
import { isUploadId, MAX_PARTS, PART_BYTES } from "@/lib/uploads/parts";
import { putPart } from "@/lib/uploads/partsServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  const upload = req.nextUrl.searchParams.get("upload");
  const i = Number(req.nextUrl.searchParams.get("i"));
  if (!isUploadId(upload) || !Number.isInteger(i) || i < 0 || i >= MAX_PARTS) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!isR2Configured()) return NextResponse.json({ error: "storage_off" }, { status: 503 });
  if (!(await rateLimit(`upload-part:${user.id}`, { max: 40, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (bytes.byteLength > PART_BYTES) return NextResponse.json({ error: "too_big" }, { status: 400 });
  try {
    await putPart(user.id, upload, i, bytes);
  } catch (err) {
    console.error("[uploads] part refused by storage:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "storage_off" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
