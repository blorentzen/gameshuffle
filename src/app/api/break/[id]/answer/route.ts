/** POST /api/break/[id]/answer { text }: a signed-in viewer answers the round in play from the live page. */

import { NextResponse } from "next/server";
import { answerFromWeb, getRun } from "@/lib/break/store";
import { breakViewer } from "@/lib/break/viewer";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await breakViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 32) : "";
  if (!text.trim()) return NextResponse.json({ ok: false, error: "not_an_answer" }, { status: 400 });
  const run = await getRun(id);
  if (!run) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const res = await answerFromWeb(run, { platform: viewer.platform, viewer: viewer.viewer, name: viewer.name, text });
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: res.error }, { status: 409 });
}
