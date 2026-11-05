/** POST /api/series/[slug]/vote { playId } → the signed-in viewer's best play vote (voting again moves it). */

import { NextResponse } from "next/server";
import { loadSeries } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { votePlay } from "@/lib/series/admin";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await seriesViewer();
  if (!viewer.userId) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { playId?: unknown } | null;
  const playId = typeof body?.playId === "string" ? body.playId : "";
  const l = await loadSeries({ slug });
  if (!l || l.series.status === "draft") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (l.series.status === "finished" && l.series.crowned_at && Date.now() - Date.parse(l.series.crowned_at) > 14 * 86400_000) {
    return NextResponse.json({ error: "Voting has closed." }, { status: 409 });
  }
  const r = await votePlay(l, viewer.userId, playId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
