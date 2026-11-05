/** PATCH /api/series/[slug]/card { hours?, kartConfigId? } → a player's own card: hours played and which kart build it shows. */

import { NextResponse } from "next/server";
import { loadSeries, playerOf } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { editOwnCard } from "@/lib/series/admin";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await seriesViewer();
  if (!viewer.userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const l = await loadSeries({ slug });
  const me = l ? playerOf(l, viewer.userId) : null;
  if (!l || !me) return NextResponse.json({ error: "You aren't a player in this series." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { hours?: unknown; kartConfigId?: unknown } | null;
  const patch: { hours?: number | null; kartConfigId?: string | null } = {};
  if (body && "hours" in body) patch.hours = body.hours === null || body.hours === "" ? null : Number(body.hours);
  if (body && "kartConfigId" in body) patch.kartConfigId = typeof body.kartConfigId === "string" ? body.kartConfigId : null;
  const r = await editOwnCard(l, me, patch);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
