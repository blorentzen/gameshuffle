/**
 * Community banner API.
 *   POST   (multipart: file) → upload a banner image to R2, set it (owner only)
 *   DELETE                   → remove the banner (owner only)
 * `[id]` is the gs_communities id. Lean vs the profile banner (no crop/source);
 * the /c hero renders it with object-fit: cover. See community-customization-m1.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setCommunityBannerUrl } from "@/lib/communities/membership";
import { isR2Configured, uploadToR2, deleteFromR2, keyFromPublicUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!isR2Configured()) return NextResponse.json({ ok: false, error: "storage_unconfigured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `community-banners/${id}-${Date.now()}.${ext}`;
  const url = await uploadToR2(key, bytes, file.type);

  const res = await setCommunityBannerUrl(userId, id, url);
  if (!res.ok) {
    // Roll back the just-uploaded object if we couldn't record it.
    await deleteFromR2(key).catch(() => {});
    const status = res.reason === "forbidden" ? 403 : res.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: res.reason }, { status });
  }
  // Best-effort clean up the previous banner object.
  if (res.previousUrl) {
    const prevKey = keyFromPublicUrl(res.previousUrl);
    if (prevKey) await deleteFromR2(prevKey).catch(() => {});
  }
  return NextResponse.json({ ok: true, url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const res = await setCommunityBannerUrl(userId, id, null);
  if (!res.ok) {
    const status = res.reason === "forbidden" ? 403 : res.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: res.reason }, { status });
  }
  if (res.previousUrl) {
    const prevKey = keyFromPublicUrl(res.previousUrl);
    if (prevKey) await deleteFromR2(prevKey).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
