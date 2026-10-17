/**
 * GET /api/referrals → Account ▸ Invite friends for the signed-in account: its
 * code (made the first time), what the link has brought, and the amounts.
 * src/lib/referrals/store.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { referralView } from "@/lib/referrals/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return NextResponse.json(await referralView(user.id, ip), { headers: { "Cache-Control": "private, no-store" } });
}
