/**
 * The Daily leaderboards privacy switch (Settings ▸ Privacy).
 *   GET → { ready, hidden, byStaff }
 *   PUT { hidden } → shows or hides the signed-in account on every Daily board.
 * A staff hide can't be undone here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isHidden, setHidden } from "@/lib/daily/boards";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const state = await isHidden(`u:${user.id}`);
  return NextResponse.json(state ? { ready: true, ...state } : { ready: false, hidden: false, byStaff: false });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { hidden?: unknown };
  if (typeof body.hidden !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const current = await isHidden(`u:${user.id}`);
  if (!current) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  if (current.byStaff) return NextResponse.json({ error: "hidden_by_staff" }, { status: 403 });
  const ok = await setHidden(`u:${user.id}`, body.hidden, { staff: false, userId: user.id });
  return ok ? NextResponse.json({ ok: true, hidden: body.hidden }) : NextResponse.json({ error: "failed" }, { status: 500 });
}
