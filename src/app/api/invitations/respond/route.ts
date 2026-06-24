/**
 * POST /api/invitations/respond { invitationId, action: "accept" | "decline" }
 * → the invitee responds; the inviter is notified.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInvitation } from "@/lib/social/invitations";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    invitationId?: unknown;
    action?: unknown;
  } | null;
  const invitationId = typeof body?.invitationId === "string" ? body.invitationId : "";
  const action = body?.action === "accept" || body?.action === "decline" ? body.action : null;
  if (!invitationId || !action) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const res = await respondInvitation(invitationId, user.id, action);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason ?? "failed" },
      { status: res.reason === "forbidden" ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
