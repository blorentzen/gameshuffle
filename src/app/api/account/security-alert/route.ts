/**
 * POST /api/account/security-alert → text the signed-in user that something
 * security-relevant changed on their own account.
 *
 * Only ever messages the caller's own verified number, so the worst a bad actor
 * can do with their own session is text themselves, which the cooldown blocks.
 * Body: { kind }
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSecurityAlert, type SecurityAlertKind } from "@/lib/sms/securityAlerts";

export const runtime = "nodejs";

const KINDS: SecurityAlertKind[] = ["password_changed", "mfa_enabled", "mfa_disabled", "phone_changed", "account_deleted"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  if (!body.kind || !KINDS.includes(body.kind as SecurityAlertKind)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // Never fails the caller's flow: the password change already succeeded, and a
  // text that could not be sent must not look like the change did not happen.
  const res = await sendSecurityAlert(user.id, body.kind as SecurityAlertKind).catch(() => ({ ok: false as const }));
  return NextResponse.json({ ok: res.ok });
}
