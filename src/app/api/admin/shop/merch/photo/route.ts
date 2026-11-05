/**
 * POST /api/admin/shop/merch/photo (multipart: file, listingId) → { ok, url }
 * A photo of a real sample for a merch product (pick 11), to our storage (R2).
 * Staff only. The editor then saves it to the product's pictures.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!isR2Configured()) return NextResponse.json({ ok: false, error: "no_storage" }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const listingId = String(form?.get("listingId") ?? "");
  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(listingId)) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "too_big" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ ok: false, error: "bad_type" }, { status: 400 });
  try {
    const url = await uploadToR2(`shop/merch/${listingId}/${randomUUID()}.${ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    console.error("[admin/shop/merch/photo]", err);
    return NextResponse.json({ ok: false, error: "upload_failed" }, { status: 500 });
  }
}
