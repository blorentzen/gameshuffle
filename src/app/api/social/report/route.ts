/**
 * Report a feed post or comment. Authed (skips captcha — signed-in only surface).
 * Body: { targetType: "post" | "comment", targetId, reason, details? }
 * Reuses the Trust & Safety reports queue (createReport) so staff see feed
 * content reports alongside profile reports.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { createReport } from "@/lib/moderation/reports";
import { reportReasonIds } from "@/lib/moderation/reasons";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const b = body as { targetType?: unknown; targetId?: unknown; reason?: unknown; details?: unknown };
  const targetType = b.targetType === "post" || b.targetType === "comment" ? b.targetType : null;
  const targetId = typeof b.targetId === "string" ? b.targetId : "";
  const reason = typeof b.reason === "string" && reportReasonIds.includes(b.reason) ? b.reason : "";
  const details = typeof b.details === "string" ? b.details.trim().slice(0, 1000) || null : null;

  if (!targetType || !targetId || !reason) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const res = await createReport({
    reporterUserId: user.id,
    reporterToken: null,
    targetType,
    targetId,
    reason,
    details,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.reason }, { status: res.reason === "rate_limited" ? 429 : 403 });
  }
  return NextResponse.json({ ok: true, deduped: res.deduped });
}
