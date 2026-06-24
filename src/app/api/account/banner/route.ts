/**
 * GET    /api/account/banner  → { url, sourceUrl, configured }
 * POST   /api/account/banner  (multipart: file [cropped], source? [original])
 *                             → upload + set banner (+ keep source for reposition)
 * DELETE /api/account/banner  → remove banner (cropped + source)
 *
 * The cropped image is what renders; the optional source is the original
 * upload, kept so "Reposition" can re-crop from it. Replacing/removing
 * best-effort deletes the prior objects so we don't accrue orphans.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  isR2Configured,
  uploadToR2,
  deleteFromR2,
  keyFromPublicUrl,
} from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // cropped is small; source can be larger
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function currentBanner(
  userId: string,
): Promise<{ url: string | null; sourceUrl: string | null }> {
  const admin = createServiceClient();
  // Degrade to url-only if the m4 source column isn't applied yet.
  let res = await admin
    .from("users")
    .select("profile_banner_url, profile_banner_source_url")
    .eq("id", userId)
    .maybeSingle();
  if (res.error) {
    res = await admin.from("users").select("profile_banner_url").eq("id", userId).maybeSingle();
  }
  const data = res.data as
    | { profile_banner_url?: string | null; profile_banner_source_url?: string | null }
    | null;
  return {
    url: data?.profile_banner_url ?? null,
    sourceUrl: data?.profile_banner_source_url ?? null,
  };
}

export async function GET() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { url, sourceUrl } = await currentBanner(userId);
  return NextResponse.json({ ok: true, url, sourceUrl, configured: isR2Configured() });
}

export async function POST(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isR2Configured()) {
    return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const stamp = Date.now();
  const previous = await currentBanner(userId);

  let url: string;
  try {
    url = await uploadToR2(
      `banners/${userId}/${stamp}.${ext}`,
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }

  // Optional original (sent on a fresh upload, omitted on reposition).
  let sourceUrl: string | null = previous.sourceUrl;
  const source = form?.get("source");
  if (source instanceof File && EXT_BY_TYPE[source.type] && source.size <= MAX_BYTES) {
    try {
      sourceUrl = await uploadToR2(
        `banners/${userId}/src-${stamp}.${EXT_BY_TYPE[source.type]}`,
        new Uint8Array(await source.arrayBuffer()),
        source.type,
      );
      // A new source supersedes the old one.
      if (previous.sourceUrl && previous.sourceUrl !== sourceUrl) {
        const k = keyFromPublicUrl(previous.sourceUrl);
        if (k) await deleteFromR2(k);
      }
    } catch {
      sourceUrl = previous.sourceUrl;
    }
  }

  const admin = createServiceClient();
  const { error: updErr } = await admin
    .from("users")
    .update({ profile_banner_url: url, profile_banner_source_url: sourceUrl })
    .eq("id", userId);
  if (updErr) {
    // m4 not applied — still persist the cropped banner (no reposition).
    await admin.from("users").update({ profile_banner_url: url }).eq("id", userId);
    sourceUrl = null;
  }

  // Drop the prior cropped object (the source is handled above).
  if (previous.url && previous.url !== url) {
    const k = keyFromPublicUrl(previous.url);
    if (k) await deleteFromR2(k);
  }

  return NextResponse.json({ ok: true, url, sourceUrl });
}

export async function DELETE() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const previous = await currentBanner(userId);
  const admin = createServiceClient();
  await admin
    .from("users")
    .update({ profile_banner_url: null, profile_banner_source_url: null })
    .eq("id", userId);

  if (isR2Configured()) {
    for (const u of [previous.url, previous.sourceUrl]) {
      if (u) {
        const k = keyFromPublicUrl(u);
        if (k) await deleteFromR2(k);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
