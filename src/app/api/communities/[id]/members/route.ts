/**
 * Community member management (owner only).
 *   PATCH  { userId, role: "member" | "mod" } → promote/demote a member
 *   DELETE ?userId=<id>                        → remove a member
 * `[id]` is the gs_communities id. See specs/gs-community-types-spec.md.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setMemberRole, removeMember } from "@/lib/communities/membership";

export const runtime = "nodejs";

function statusFor(reason?: string): number {
  return reason === "forbidden" ? 403 : reason === "not_found" ? 404 : 400;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const targetUserId = String(body?.userId ?? "");
  const role = body?.role === "mod" ? "mod" : "member";
  if (!targetUserId) return NextResponse.json({ ok: false, error: "missing_user" }, { status: 400 });

  const res = await setMemberRole(user.id, id, targetUserId, role);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: res.reason }, { status: statusFor(res.reason) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const targetUserId = new URL(req.url).searchParams.get("userId");
  if (!targetUserId) return NextResponse.json({ ok: false, error: "missing_user" }, { status: 400 });

  const res = await removeMember(user.id, id, targetUserId);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: res.reason }, { status: statusFor(res.reason) });
}
