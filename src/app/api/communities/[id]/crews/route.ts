/**
 * Community crews API.
 *   POST   { game }                 — join a game's crew as a prospect (self; must be a member)
 *   PATCH  { game, userId, tier }   — set a member's tier (owner/mod/captain)
 *   DELETE { game, userId }         — remove from a crew (manager, or self-leave)
 * `[id]` is the gs_communities id.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinCrewAsProspect, setCrewTier, removeFromCrew, type CrewTier } from "@/lib/communities/crews";

export const runtime = "nodejs";

async function uid(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { game?: string };
  if (!body.game) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await joinCrewAsProspect(userId, id, body.game);
  if (!res.ok) return NextResponse.json({ error: res.reason ?? "failed" }, { status: res.reason === "not_a_member" ? 403 : 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { game?: string; userId?: string; tier?: string };
  if (!body.game || !body.userId || !body.tier) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await setCrewTier(userId, id, body.game, body.userId, body.tier as CrewTier);
  if (!res.ok) return NextResponse.json({ error: res.reason ?? "failed" }, { status: res.reason === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await uid();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { game?: string; userId?: string };
  if (!body.game || !body.userId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await removeFromCrew(userId, id, body.game, body.userId);
  if (!res.ok) return NextResponse.json({ error: res.reason ?? "failed" }, { status: res.reason === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
