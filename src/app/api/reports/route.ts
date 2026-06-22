/**
 * POST /api/reports — file a report against a profile/user.
 *
 * Body: { targetUserId, reason, details?, turnstileToken? }
 * - Signed-in reporters: no captcha.
 * - Anon reporters: Turnstile required; rate-limit/dedupe keyed on hashed IP.
 * Service-role only beyond this route (the `reports` table has no public RLS).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createReport } from "@/lib/moderation/reports";
import { reportReasonIds } from "@/lib/moderation/reasons";

export const runtime = "nodejs";

const MAX_DETAILS = 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    targetUserId?: unknown;
    reason?: unknown;
    details?: unknown;
    turnstileToken?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "bad_json" }, { status: 400 });

  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
  const reason =
    typeof body.reason === "string" && reportReasonIds.includes(body.reason)
      ? body.reason
      : "";
  if (!targetUserId || !reason) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const details =
    typeof body.details === "string"
      ? body.details.trim().slice(0, MAX_DETAILS) || null
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && user.id === targetUserId) {
    return NextResponse.json({ error: "self_report" }, { status: 400 });
  }

  // Anon reporters must clear Turnstile; the hashed IP keys rate-limit/dedupe.
  let reporterToken: string | null = null;
  if (!user) {
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : null;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ok = await verifyTurnstileToken(turnstileToken, ip || undefined);
    if (!ok) return NextResponse.json({ error: "captcha_failed" }, { status: 400 });
    reporterToken = ip ? createHash("sha256").update(ip).digest("hex") : null;
  }

  try {
    const result = await createReport({
      reporterUserId: user?.id ?? null,
      reporterToken,
      targetType: "profile",
      targetId: targetUserId,
      reason,
      details,
    });
    return NextResponse.json({ ok: true, deduped: result.deduped });
  } catch {
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }
}
