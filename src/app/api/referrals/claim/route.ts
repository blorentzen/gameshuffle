/**
 * POST /api/referrals/claim { code } (signed in) → the account was made from
 * someone's link: their sign-up tokens and this account's welcome extra, once.
 * Only accounts made in the last week count. The x-daily-guest header ties in
 * a game this browser finished before signing up.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guestKey, validGuestSecret } from "@/lib/daily/guests";
import { recordSignup } from "@/lib/referrals/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const secret = req.headers.get("x-daily-guest");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result = await recordSignup({ code: body?.code, accountId: user.id, guestKey: validGuestSecret(secret) ? guestKey(secret) : null, ip })
    .catch((e) => { console.error("[referrals/claim]", e); return { ok: false as const, error: "not_ready" as const }; });
  return NextResponse.json(result);
}
