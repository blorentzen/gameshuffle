/**
 * The Daily leaderboards privacy switch (Settings ▸ Privacy).
 *   GET → { ready, hidden, byStaff, video }   (video: in winners videos, null until daily-winners-m1)
 *   PUT { hidden } → shows or hides the signed-in account on every Daily board.
 *   PUT { video }  → in or out of the morning winners videos (src/lib/daily/winners.ts).
 * A staff hide can't be undone here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHidden, setHidden } from "@/lib/daily/boards";
import { setWinnersOptOut, winnersOptOut } from "@/lib/daily/winners";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [state, out] = await Promise.all([isHidden(`u:${user.id}`), winnersOptOut(`u:${user.id}`)]);
  const video = out == null ? null : !out;
  return NextResponse.json(state ? { ready: true, ...state, video } : { ready: false, hidden: false, byStaff: false, video });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { hidden?: unknown; video?: unknown };
  if (typeof body.video === "boolean") {
    if ((await winnersOptOut(`u:${user.id}`)) == null) return NextResponse.json({ error: "not_ready" }, { status: 503 });
    const ok = await setWinnersOptOut(`u:${user.id}`, !body.video);
    return ok ? NextResponse.json({ ok: true, video: body.video }) : NextResponse.json({ error: "failed" }, { status: 500 });
  }
  if (typeof body.hidden !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const current = await isHidden(`u:${user.id}`);
  if (!current) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  if (current.byStaff) return NextResponse.json({ error: "hidden_by_staff" }, { status: 403 });
  const ok = await setHidden(`u:${user.id}`, body.hidden, { staff: false, userId: user.id });
  return ok ? NextResponse.json({ ok: true, hidden: body.hidden }) : NextResponse.json({ error: "failed" }, { status: 500 });
}
