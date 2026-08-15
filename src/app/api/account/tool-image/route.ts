/**
 * POST /api/account/tool-image
 *
 * Uploads an image for a Stream Tool (tier-list item / bingo square) to R2 and
 * returns its public URL, which the setup card then stores as an image item.
 * Auth required. Complements pasting an image URL directly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2, isR2Configured } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isR2Configured()) return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 400 });

  try {
    const key = `tool-images/${user.id}/${randomUUID()}.${ext}`;
    const url = await uploadToR2(key, new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[tool-image] upload failed:", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
