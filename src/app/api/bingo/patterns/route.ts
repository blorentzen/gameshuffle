/**
 * POST / DELETE /api/bingo/patterns — a streamer's own Stream Bingo patterns (GS Pro).
 *   POST   { name, cells }   save a drawing (square indexes 0-24, at least two besides the free centre)
 *   DELETE ?id=              remove one (games already played keep their own copy)
 */

import { NextResponse } from "next/server";
import { bingoOwner } from "@/lib/bingo/owner";
import { deletePattern, listPatterns, savePattern } from "@/lib/bingo/stream";

export const runtime = "nodejs";

async function owner() {
  const ctx = await bingoOwner();
  if ("error" in ctx) return { res: NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status }) };
  if (!ctx.isPro) return { res: NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 }) };
  if (!ctx.communityId) return { res: NextResponse.json({ ok: false, error: "no_community" }, { status: 400 }) };
  return { ctx };
}

export async function POST(request: Request) {
  const { ctx, res } = await owner();
  if (!ctx) return res;
  const body = (await request.json().catch(() => null)) as { name?: unknown; cells?: unknown } | null;
  const r = await savePattern(ctx.communityId!, ctx.userId, typeof body?.name === "string" ? body.name : "", body?.cells);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, pattern: r.value, patterns: await listPatterns(ctx.communityId!) });
}

export async function DELETE(request: Request) {
  const { ctx, res } = await owner();
  if (!ctx) return res;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!(await deletePattern(ctx.communityId!, id))) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, patterns: await listPatterns(ctx.communityId!) });
}
