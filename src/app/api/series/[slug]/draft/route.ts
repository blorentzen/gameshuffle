/**
 * POST /api/series/[slug]/draft { nightId, ban, protect } → a team's turn in the track draft. Either player
 * on the team on the clock can lock it in; an organizer (staff) can lock it in for that team.
 */

import { NextResponse } from "next/server";
import { forgetView, loadSeries, playerOf } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { pickTracks, teamOnClock, DRAFT_ACTION_ERRORS } from "@/lib/series/draftStore";
import { DRAFT_ERRORS, type DraftError } from "@/lib/series/draft";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await seriesViewer();
  if (!viewer.userId) return NextResponse.json({ error: "Sign in to pick." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { nightId?: unknown; ban?: unknown; protect?: unknown } | null;
  const nightId = typeof body?.nightId === "string" ? body.nightId : "";
  const ban = typeof body?.ban === "string" ? body.ban : "";
  const protect = typeof body?.protect === "string" && body.protect ? body.protect : null;
  if (!nightId || !ban) return NextResponse.json({ error: "Pick a track to ban." }, { status: 400 });
  const l = await loadSeries({ slug });
  if (!l || !l.nights.some((n) => n.id === nightId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const me = playerOf(l, viewer.userId);
  const team = me?.team_id ?? (viewer.staff ? await teamOnClock(nightId) : null);
  if (!team) return NextResponse.json({ error: "Only the players can pick." }, { status: 403 });
  const r = await pickTracks(nightId, team, ban, protect, viewer.userId);
  if (!r.ok) {
    const msg = (DRAFT_ERRORS as Record<string, string>)[r.error] ?? (DRAFT_ACTION_ERRORS as Record<string, string>)[r.error] ?? "Couldn't lock that in.";
    return NextResponse.json({ error: msg, code: r.error as DraftError }, { status: 409 });
  }
  forgetView(l.series.slug);
  return NextResponse.json({ ok: true });
}
