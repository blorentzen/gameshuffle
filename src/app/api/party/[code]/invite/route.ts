import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendNightInvite } from "@/lib/social/nudges";
import { rateLimit } from "@/lib/ratelimit";

/** POST { userId }: the host saves a friend a seat at the night they just started (dailies picks 2026-11-05, 6A). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { ok } = await rateLimit(`night-invite:${user.id}`, { max: 30, windowMs: 60 * 60_000 });
  if (!ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown };
  const to = typeof body.userId === "string" ? body.userId : "";
  if (!to) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await sendNightInvite(user.id, code, to).catch(() => null);
  if (!r) return NextResponse.json({ error: "failed" }, { status: 500 });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.error === "already_invited" ? 409 : 403 });
}
