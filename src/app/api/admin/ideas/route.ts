/**
 * POST /api/admin/ideas — Idea Board admin action dispatcher (staff only).
 * Body: { action, ... }. All transitions are service-role; each logs to
 * gs_moderation_actions inside the admin lib.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import {
  approveIdea,
  rejectIdea,
  createCycle,
  promoteCycle,
  recordVerdict,
  closeCycle,
  shipIdea,
} from "@/lib/ideas/admin";

export const runtime = "nodejs";

async function readCaller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  return { ok: true as const, userId: user.id, role: (data?.role as string | null) ?? null };
}

export async function POST(req: NextRequest) {
  const caller = await readCaller();
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isStaffRole(caller.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof b?.action === "string" ? b.action : "";
  const ideaId = typeof b?.ideaId === "string" ? b.ideaId : "";
  const cycleId = typeof b?.cycleId === "string" ? b.cycleId : "";
  const reason = typeof b?.reason === "string" ? b.reason : "";
  const actor = caller.userId;

  switch (action) {
    case "approve":
      return NextResponse.json(await approveIdea(ideaId, actor));
    case "reject":
      if (!reason.trim()) return NextResponse.json({ ok: false, reason: "reason_required" }, { status: 400 });
      return NextResponse.json(await rejectIdea(ideaId, actor, reason));
    case "verdict": {
      const verdict = b?.verdict === "declined" ? "declined" : "planned";
      const note = typeof b?.note === "string" ? b.note : null;
      return NextResponse.json(await recordVerdict({ ideaId, actorId: actor, verdict, note }));
    }
    case "ship": {
      const shippedRef = typeof b?.shippedRef === "string" ? b.shippedRef : null;
      return NextResponse.json(await shipIdea(ideaId, actor, shippedRef));
    }
    case "create_cycle": {
      const name = typeof b?.name === "string" ? b.name : "";
      if (!name.trim()) return NextResponse.json({ ok: false, reason: "name_required" }, { status: 400 });
      const slots = typeof b?.slots === "number" ? b.slots : undefined;
      return NextResponse.json(await createCycle({ name, slots }));
    }
    case "promote_cycle":
      return NextResponse.json(await promoteCycle(cycleId, actor));
    case "close_cycle":
      return NextResponse.json(await closeCycle(cycleId));
    default:
      return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }
}
