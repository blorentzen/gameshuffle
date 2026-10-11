/**
 * GET /api/break/community/[id]: a channel's break for the live page (public).
 * Moves it along like the overlay does, and adds the signed-in viewer's
 * answer for the round in play.
 */

import { NextResponse } from "next/server";
import { breakView, getShowable, myAnswer, tickBreak } from "@/lib/break/store";
import { breakViewer } from "@/lib/break/viewer";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const found = await getShowable(id);
  if (!found) return NextResponse.json({ ok: true, view: null }, { headers: { "Cache-Control": "no-store" } });
  const run = found.status === "running" ? await tickBreak(found) : found;
  const [view, viewer] = await Promise.all([breakView(run), breakViewer()]);
  const mine = viewer && run.phase === "open" ? await myAnswer(run, viewer.platform, viewer.viewer) : null;
  return NextResponse.json({ ok: true, view, signedIn: !!viewer, mine }, { headers: { "Cache-Control": "no-store" } });
}
