/**
 * Account ▸ Support (Britton's picks, 2026-10-19): GET → the account's support (since when, the
 * badge, monthly, every gift, their place on the wall); PATCH { name, note, show } → their wall
 * name and note across all their support. Gifts made while signed out with the account's confirmed
 * email are claimed first.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paidPlanAvailability } from "@/lib/billing/availability";
import { claimSupportGifts, saveMyWall, supporterInfo } from "@/lib/support/store";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.email_confirmed_at) await claimSupportGifts(user.id, user.email).catch(() => 0);
  const info = await supporterInfo(user.id).catch(() => null);
  return NextResponse.json({ available: paidPlanAvailability(req).available, ready: !!info, info }, { headers: NO_STORE });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; note?: unknown; show?: unknown };
  const res = await saveMyWall(user.id, { name: body.name, note: body.note, show: body.show === true });
  if (res.ok) return NextResponse.json({ ok: true });
  const message = res.error === "name_needed" ? "Add a name to go on the wall." : res.error === "not_allowed" ? "That name or note can't go on the wall. Try different words." : "Couldn't save. Try again.";
  return NextResponse.json({ error: res.error, message }, { status: res.error === "failed" ? 500 : 400 });
}
