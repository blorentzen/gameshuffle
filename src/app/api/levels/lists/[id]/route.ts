/**
 * /api/levels/lists/<id>: one list.
 *
 *   GET    → { list, levels }   public, or the viewer's own
 *   PATCH  { action: rename, title } | { action: public, public } | { action: add | remove, levelId }   the owner
 *          { action: feature, on }                                                                 staff
 *   POST   { action: "queue" } → { queued }   GS Pro: every level into your level queue, through its rules
 *   DELETE the owner, or staff
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { changeList, deleteList, listDetail, queueList, type ListChange } from "@/lib/levels/curation";

export const runtime = "nodejs";

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await listDetail(id, await viewer());
  return d ? NextResponse.json(d) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

function parse(body: Record<string, unknown>): ListChange | null {
  switch (body.action) {
    case "rename": return typeof body.title === "string" ? { action: "rename", title: body.title } : null;
    case "public": return { action: "public", public: body.public === true };
    case "add": case "remove": return typeof body.levelId === "string" ? { action: body.action, levelId: body.levelId } : null;
    case "feature": return { action: "feature", on: body.on === true };
    default: return null;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const c = body ? parse(body) : null;
  if (!c) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await changeList(userId, id, c);
  if (!r.ok) return NextResponse.json({ error: r.error, line: r.line }, { status: r.error === "not_found" ? 404 : r.error === "not_yours" || r.error === "staff_only" ? 403 : 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== "queue") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await queueList(userId, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.error === "pro_required" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ queued: r });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  return (await deleteList(userId, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
