/**
 * GET    /api/account/phone → this account's number, verification + consent
 * POST   /api/account/phone → { action: "start" | "check" | "consent", ... }
 * DELETE /api/account/phone → remove the number and all consent
 *
 * Phone verification runs through Twilio Verify; consent is per category and
 * every change is written to the append-only consent log.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkPhoneVerification, getPhoneState, removePhone, setConsent, startPhoneVerification, SMS_CATEGORIES, type SmsCategory } from "@/lib/sms/consent";
import { getAllowance } from "@/lib/sms/send";
import { verifyConfigured } from "@/lib/sms/client";
import { sendSecurityAlert } from "@/lib/sms/securityAlerts";

export const runtime = "nodejs";
const CATEGORIES = new Set<SmsCategory>(SMS_CATEGORIES.map((c) => c.id));

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [state, allowance] = await Promise.all([getPhoneState(user.id), getAllowance(user.id)]);
  return NextResponse.json({
    ...state,
    available: verifyConfigured(),
    allowance: { planId: allowance.planId, allowance: allowance.allowance, used: allowance.used, remaining: Number.isFinite(allowance.remaining) ? allowance.remaining : null },
    categories: SMS_CATEGORIES,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; phone?: string; code?: string; category?: string; optedIn?: boolean };

  try {
    if (body.action === "start") {
      if (!body.phone) return NextResponse.json({ error: "phone_required" }, { status: 400 });
      const res = await startPhoneVerification(user.id, body.phone);
      return res.ok ? NextResponse.json(res) : NextResponse.json({ error: res.reason }, { status: 400 });
    }
    if (body.action === "check") {
      if (!body.code) return NextResponse.json({ error: "code_required" }, { status: 400 });
      const res = await checkPhoneVerification(user.id, body.code);
      if (res.ok) {
        // Closes the opt-in loop: the number's first branded message confirms
        // what it was added for and how to stop it.
        await sendSecurityAlert(user.id, "phone_changed").catch(() => {});
        return NextResponse.json({ ok: true, ...(await getPhoneState(user.id)) });
      }
      return NextResponse.json({ error: res.reason }, { status: 400 });
    }
    if (body.action === "consent") {
      const category = body.category as SmsCategory;
      if (!CATEGORIES.has(category) || typeof body.optedIn !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
      if (category === "account_security" && !body.optedIn) return NextResponse.json({ error: "required_category" }, { status: 400 });
      await setConsent(user.id, category, body.optedIn);
      return NextResponse.json({ ok: true, ...(await getPhoneState(user.id)) });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await removePhone(user.id);
  return NextResponse.json({ ok: true });
}
