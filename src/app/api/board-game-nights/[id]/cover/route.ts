/**
 * POST   /api/board-game-nights/[id]/cover  (multipart: file) → upload + set the
 *        night's cover image (host only).
 * DELETE /api/board-game-nights/[id]/cover  → remove the cover (host only).
 *
 * Cover is R2-hosted; the event page + cards fall back to the generated gradient
 * hero when absent. Degrades gracefully: if the `cover_image_url` column isn't
 * migrated yet the write returns `migration_pending` (reads use select * so they
 * never break).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isR2Configured, uploadToR2, deleteFromR2, keyFromPublicUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function requireHost(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };
  const { data: night } = await supabase
    .from("board_game_nights")
    .select("host_id, cover_image_url")
    .eq("id", id)
    .maybeSingle();
  if (!night) return { error: "not_found" as const, status: 404 };
  if ((night as { host_id: string }).host_id !== user.id) return { error: "forbidden" as const, status: 403 };
  return { supabase, current: (night as { cover_image_url?: string | null }).cover_image_url ?? null };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireHost(id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!isR2Configured()) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let url: string;
  try {
    url = await uploadToR2(
      `bgn-covers/${id}/${Date.now()}.${ext}`,
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 502 });
  }

  const { error } = await gate.supabase.from("board_game_nights").update({ cover_image_url: url }).eq("id", id);
  if (error) {
    // Column not migrated yet — drop the just-uploaded object so we don't orphan it.
    const k = keyFromPublicUrl(url);
    if (k) await deleteFromR2(k).catch(() => {});
    return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  }

  // Best-effort remove the prior cover.
  if (gate.current && gate.current !== url) {
    const k = keyFromPublicUrl(gate.current);
    if (k) await deleteFromR2(k).catch(() => {});
  }

  return NextResponse.json({ ok: true, url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireHost(id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  await gate.supabase.from("board_game_nights").update({ cover_image_url: null }).eq("id", id);
  if (gate.current && isR2Configured()) {
    const k = keyFromPublicUrl(gate.current);
    if (k) await deleteFromR2(k).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
