/**
 * POST /api/board-games/image (multipart: file) → upload a game cover to R2,
 * return its public URL. Auth-gated. Used by the games-brought builder so a
 * host can attach a photo to any free-text game (no BGG dependency).
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isR2Configured()) {
    return NextResponse.json({ error: "Image uploads are unavailable." }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }
  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Use a JPG, PNG, WEBP, or GIF image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 5MB)." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `board-game-covers/${user.id}/${randomUUID()}.${ext}`;
  const url = await uploadToR2(key, bytes, file.type);
  return NextResponse.json({ url });
}
