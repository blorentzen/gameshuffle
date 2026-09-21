/**
 * PATCH  /api/game-nights/[id] → update a night (host only).
 * DELETE /api/game-nights/[id] → delete a night (host only).
 * RLS already restricts writes to the host; we add an explicit guard so a
 * non-host gets a clean 403 rather than a silent no-op.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNight, updateNight, deleteNight } from "@/lib/game-nights/store";
import type { NightGame, NightKind } from "@/lib/game-nights/types";

export const runtime = "nodejs";

async function requireHost(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const night = await getNight(id);
  if (!night) return { ok: false as const, status: 404 };
  if (night.host_id !== user.id) return { ok: false as const, status: 403 };
  return { ok: true as const };
}

const NIGHT_KIND_VALUES = new Set(["board", "video", "tcg", "mixed"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHost(id);
  if (!guard.ok) return NextResponse.json({ error: "Not allowed" }, { status: guard.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = await updateNight(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    place: typeof body.place === "string" ? body.place : undefined,
    lat: typeof body.lat === "number" ? body.lat : "lat" in body ? null : undefined,
    lng: typeof body.lng === "number" ? body.lng : "lng" in body ? null : undefined,
    starts_at: "starts_at" in body ? (body.starts_at as string | null) : undefined,
    timezone: typeof body.timezone === "string" ? body.timezone : undefined,
    capacity: "capacity" in body ? (body.capacity as number | null) : undefined,
    visibility: body.visibility === "unlisted" || body.visibility === "public" ? body.visibility : undefined,
    genres: Array.isArray(body.genres) ? (body.genres as string[]) : undefined,
    level: "level" in body ? (body.level as string | null) : undefined,
    kind: typeof body?.kind === "string" && NIGHT_KIND_VALUES.has(body.kind) ? (body.kind as NightKind) : undefined,
    games: Array.isArray(body.games) ? (body.games as NightGame[]) : undefined,
    status: body.status === "draft" || body.status === "scheduled" ? body.status : undefined,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHost(id);
  if (!guard.ok) return NextResponse.json({ error: "Not allowed" }, { status: guard.status });
  const res = await deleteNight(id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
