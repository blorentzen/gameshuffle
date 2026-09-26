/**
 * GET  /api/account/profile-skin → the user's normalized profile skin
 * PUT  /api/account/profile-skin  body: { skin } → validate + save
 * POST /api/account/profile-skin  (multipart: file) → upload a background image
 *      to R2, return its public URL for the client to PUT into the skin
 *
 * Stored on `users.profile_skin`. Authenticated; no tier gate.
 *
 * SECURITY: reads + writes pass through `resolveProfileSkin` (allowlisted enums,
 * #rrggbb colors, preset gradients, R2-only image URLs). The PUT additionally
 * re-checks any image URL with `keyFromPublicUrl` so a background image can only
 * ever be one we host — no arbitrary/external URLs reach the DB or the page.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isR2Configured, uploadToR2, keyFromPublicUrl } from "@/lib/storage/r2";
import { resolveProfileSkin, DEFAULT_PROFILE_SKIN } from "@/lib/profile/skin";

export const runtime = "nodejs";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 6 * 1024 * 1024;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("profile_skin").eq("id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, skin: resolveProfileSkin((data as { profile_skin?: unknown } | null)?.profile_skin) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { skin?: unknown } | null;
  const skin = resolveProfileSkin(body?.skin ?? DEFAULT_PROFILE_SKIN);

  // Defense in depth: if an image survived the shape gate, confirm it's ours.
  if (skin.bg.kind === "image" && skin.bg.image && keyFromPublicUrl(skin.bg.image) == null) {
    skin.bg = { kind: "none", color: null, gradient: null, image: null, fit: skin.bg.fit };
  }

  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ profile_skin: skin }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  return NextResponse.json({ ok: true, skin });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!isR2Configured()) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const key = `profile-backgrounds/${user.id}/${randomUUID()}.${ext}`;
  const url = await uploadToR2(key, new Uint8Array(await file.arrayBuffer()), file.type).catch(() => null);
  if (!url) return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, url });
}
