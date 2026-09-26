/**
 * PATCH  /api/game-nights/series/[id]  { active }        → pause/resume
 * POST   /api/game-nights/series/[id]  { action:"generate" } → make the next instance now
 * DELETE /api/game-nights/series/[id]                    → delete the series
 *
 * All host-scoped: series reads/writes run under RLS, and generation verifies
 * ownership before materializing.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  setSeriesActive,
  deleteSeries,
  getOwnSeries,
  materializeSeries,
} from "@/lib/game-nights/series";

export const runtime = "nodejs";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const res = await setSeriesActive(id, body?.active !== false);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 400 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "generate") return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  // getOwnSeries is RLS-scoped, so this only succeeds for the host.
  const series = await getOwnSeries(id);
  if (!series) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const res = await materializeSeries(series, { force: true });
  return NextResponse.json(res);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = await deleteSeries(id);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 400 });
}
