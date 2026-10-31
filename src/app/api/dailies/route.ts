/**
 * The dailies together for the signed-in account: GET → { signedIn, entries }
 * (each game's result today, streak, last two weeks, and the Weekly's
 * status) and `referral` ({ code, levers }: the account's invite link).
 * Signed out → { signedIn: false }: the browser keeps its own.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dailiesView } from "@/lib/daily/dailies";
import { codeFor, referralLevers } from "@/lib/referrals/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "private, no-store" } });
  // Your referral code rides along, so every daily you share carries it (and notes your network).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const [entries, code, levers] = await Promise.all([
    dailiesView({ userId: user.id }),
    codeFor(user.id, ip).catch(() => null),
    referralLevers().catch(() => null),
  ]);
  return NextResponse.json({ signedIn: true, entries, referral: code && levers ? { code, levers } : null }, { headers: { "Cache-Control": "private, no-store" } });
}
