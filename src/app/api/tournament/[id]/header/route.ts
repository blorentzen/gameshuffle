/**
 * POST   /api/tournament/[id]/header  (multipart: file) → upload header image
 * DELETE /api/tournament/[id]/header  → remove it
 *
 * GS Circuit page-branding: a custom header image for the public tournament
 * page, stored in R2. Organizer only. (Tier gating is centralized in
 * circuit.ts; while billing is off everyone can use it — free in preview.)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isR2Configured, uploadToR2, deleteFromR2, keyFromPublicUrl } from "@/lib/storage/r2";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { tournamentHasFeature } from "@/lib/tournaments/circuit-resolve";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function requireOrganizer(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("header_image_url").eq("id", id).maybeSingle();
  if (!t) return { ok: false as const, status: 404 };
  const role = await getTournamentRole(admin, id, user.id);
  if (!role) return { ok: false as const, status: 403 };
  return { ok: true as const, current: (t as { header_image_url: string | null }).header_image_url ?? null };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isR2Configured()) return NextResponse.json({ error: "Image uploads aren't configured." }, { status: 503 });
  const gate = await requireOrganizer(id);
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });

  // Custom page branding is a paid Circuit feature (free while billing is off).
  const admin = createServiceClient();
  const { data: t } = await admin.from("tournaments").select("organizer_id, game_slug, created_at").eq("id", id).maybeSingle();
  const tour = t as { organizer_id: string; game_slug: string | null; created_at: string | null } | null;
  if (tour && !(await tournamentHasFeature(admin, { id, organizer_id: tour.organizer_id, game_slug: tour.game_slug, created_at: tour.created_at }, "branding"))) {
    return NextResponse.json({ error: "Custom page branding is a GameShuffle Circuit feature." }, { status: 402 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large (max 8MB)." }, { status: 400 });
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JP, PNG, or WebP image." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `tournament-headers/${id}-${Date.now()}.${ext}`;
  const url = await uploadToR2(key, bytes, file.type);

  await admin.from("tournaments").update({ header_image_url: url }).eq("id", id);
  // Best-effort clean up the previous header.
  if (gate.current) {
    const oldKey = keyFromPublicUrl(gate.current);
    if (oldKey) await deleteFromR2(oldKey).catch(() => {});
  }
  return NextResponse.json({ ok: true, url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireOrganizer(id);
  if (!gate.ok) return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  const admin = createServiceClient();
  await admin.from("tournaments").update({ header_image_url: null }).eq("id", id);
  if (gate.current) {
    const oldKey = keyFromPublicUrl(gate.current);
    if (oldKey) await deleteFromR2(oldKey).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
