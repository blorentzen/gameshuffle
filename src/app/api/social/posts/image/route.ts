/**
 * POST /api/social/posts/image — upload one image for a feed post to R2 and
 * return its public URL. The client attaches the URL to the post it then
 * creates (createPost only takes the author's own post-images). Auth required.
 * Every picture gets the automatic check first (src/lib/moderation/imageCheck.ts;
 * a moving GIF or WebP is checked on four of its frames): posts are public, so
 * anything not ok, or a check that couldn't run, isn't stored. A moving picture over
 * 4 MB comes in parts (`{ upload, parts }` from /api/uploads/part: Vercel turns away
 * bodies over 4.5 MB); still pictures are made to fit in the browser.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import { uploadToR2, isR2Configured } from "@/lib/storage/r2";
import { checkImage, checkGifFrames } from "@/lib/moderation/imageCheck";
import { frameSheet } from "@/lib/gifs/process";
import { readUploadRef } from "@/lib/uploads/parts";
import { takeUpload } from "@/lib/uploads/partsServer";

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

  let bytes: Buffer;
  let type: string;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const ref = readUploadRef(await req.json().catch(() => null));
    if (!ref) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const taken = await takeUpload(user.id, ref, MAX_BYTES);
    if (taken === "missing") return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (taken === "too_big") return NextResponse.json({ error: "too_large" }, { status: 413 });
    const format = await sharp(taken, { animated: true }).metadata().then((m) => m.format).catch(() => null);
    bytes = taken;
    type = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    bytes = Buffer.from(await file.arrayBuffer());
    type = file.type;
  }
  const ext = EXT_BY_TYPE[type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  const frames = await sharp(bytes, { animated: true }).metadata().then((m) => (m.width ? m.pages ?? 1 : 0)).catch(() => 0);
  if (!frames) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  const use = "picture in a community post";
  const capKey = `u:${user.id}`;
  const check = frames > 1
    ? await checkGifFrames(await frameSheet(bytes, frames), { userId: user.id, capKey, use })
    : await checkImage(bytes, { use, userId: user.id, capKey });
  if (!check.ran) return NextResponse.json({ error: "check_unavailable" }, { status: 503 });
  if (check.verdict !== "ok") return NextResponse.json({ error: "refused", reason: check.reason }, { status: 422 });

  try {
    const url = await uploadToR2(
      `post-images/${user.id}/${Date.now()}.${ext}`,
      new Uint8Array(bytes),
      type,
    );
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }
}
