/** POST /api/ideas/[id]/report — report an idea (authed; reuses the T&S flow). */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createReport } from "@/lib/moderation/reports";
import { reportReasonIds } from "@/lib/moderation/reasons";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { reason?: string; details?: string } | null;
  const reason = body?.reason && reportReasonIds.includes(body.reason) ? body.reason : "";
  if (!reason) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 1000) || null : null;

  const result = await createReport({
    reporterUserId: user.id,
    reporterToken: null,
    targetType: "idea",
    targetId: id,
    reason,
    details,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "rate_limited" ? 429 : 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
