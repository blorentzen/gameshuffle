/**
 * POST /api/sms/status — Twilio status callbacks (sent / delivered / failed).
 * Signature-verified; updates the message log so allowance accounting and the
 * organizer's delivery view reflect what actually happened.
 */

import { NextResponse, type NextRequest } from "next/server";
import { validateTwilioSignature } from "@/lib/sms/client";
import { recordStatus } from "@/lib/sms/send";
import { getBaseUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  if (!validateTwilioSignature(req.headers.get("x-twilio-signature"), `${getBaseUrl()}/api/sms/status`, params)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 403 });
  }
  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (sid && status) await recordStatus(sid, status, params.ErrorCode ?? null).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
