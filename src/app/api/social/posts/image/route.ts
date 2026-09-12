/**
 * POST /api/social/posts/image — upload one image for a feed post to R2 and
 * return its public URL. The client attaches the URL to the post it then
 * creates. Auth required.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadToR2, isR2Configured } from "@/lib/storage/r2";

export const runtime = "nodejs";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isR2Configured()) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  try {
    const url = await uploadToR2(
      `post-images/${user.id}/${Date.now()}.${ext}`,
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
}
