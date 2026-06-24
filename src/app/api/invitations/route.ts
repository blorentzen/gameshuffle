/**
 * POST /api/invitations { kind, targetId, targetName, link?, inviteeIds[] }
 * → invite people to a session/tournament (caller is the inviter).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInvitation, type InviteKind } from "@/lib/social/invitations";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    targetId?: unknown;
    targetName?: unknown;
    link?: unknown;
    inviteeIds?: unknown;
  } | null;

  const kind = body?.kind === "session" || body?.kind === "tournament" ? (body.kind as InviteKind) : null;
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const targetName = typeof body?.targetName === "string" ? body.targetName.slice(0, 120) : "";
  const link = typeof body?.link === "string" ? body.link : null;
  const inviteeIds = Array.isArray(body?.inviteeIds)
    ? body.inviteeIds.filter((x): x is string => typeof x === "string").slice(0, 50)
    : null;

  if (!kind || !targetId || !targetName || !inviteeIds?.length) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let sent = 0;
  for (const inviteeId of inviteeIds) {
    const res = await createInvitation({
      inviterId: user.id,
      inviteeId,
      kind,
      targetId,
      targetName,
      link,
    });
    if (res.ok) sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
