/**
 * GET  /api/admin/moderation  → open reports for review (staff)
 * PUT  /api/admin/moderation  → act on a report / user (staff; some admin-only)
 *
 * Body (PUT): { action, targetUserId, reportId?, durationHours?, notes? }
 *   action ∈ dismiss | clear_display_name | warn | suspend | ban | unban
 * Permanent ban + unban are admin-only. Staff cannot moderate other
 * staff/admin (only an admin can). Every action writes the audit log.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import {
  listReportsForReview,
  resolveReport,
  setUserModeration,
  clearUserField,
} from "@/lib/moderation/store";
import { listOpenAppeals, resolveAppeal } from "@/lib/moderation/appeals";
import { writeModerationAudit } from "@/lib/moderation/audit";
import { keyFromPublicUrl, deleteFromR2 } from "@/lib/storage/r2";

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

export async function GET() {
  const caller = await readCaller();
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isStaffRole(caller.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [reports, appeals] = await Promise.all([
    listReportsForReview(),
    listOpenAppeals(),
  ]);
  return NextResponse.json({
    ok: true,
    reports,
    appeals,
    isAdmin: caller.role === "admin",
  });
}

const ACTIONS = ["dismiss", "clear_display_name", "clear_bio", "clear_banner", "warn", "suspend", "ban", "unban"] as const;
type Action = (typeof ACTIONS)[number];

export async function PUT(req: NextRequest) {
  const caller = await readCaller();
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!isStaffRole(caller.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const isAdmin = caller.role === "admin";

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    targetUserId?: unknown;
    reportId?: unknown;
    appealId?: unknown;
    durationHours?: unknown;
    notes?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "bad_json" }, { status: 400 });

  // Appeal resolution — admin-only (granting lifts a ban).
  if (body.action === "grant_appeal" || body.action === "deny_appeal") {
    if (!isAdmin) return NextResponse.json({ error: "admin_required" }, { status: 403 });
    const appealId = typeof body.appealId === "string" ? body.appealId : "";
    if (!appealId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const appealNotes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;
    const svc = createServiceClient();
    const { data: appeal } = await svc
      .from("moderation_appeals")
      .select("user_id")
      .eq("id", appealId)
      .maybeSingle();
    if (!appeal) return NextResponse.json({ error: "no_such_appeal" }, { status: 404 });
    try {
      if (body.action === "grant_appeal") {
        await setUserModeration({
          actorUserId: caller.userId,
          targetUserId: appeal.user_id as string,
          status: "ok",
          reason: null,
        });
        await resolveAppeal({ appealId, staffUserId: caller.userId, status: "granted", notes: appealNotes });
      } else {
        await resolveAppeal({ appealId, staffUserId: caller.userId, status: "denied", notes: appealNotes });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "action_failed" }, { status: 500 });
    }
  }

  const action = (ACTIONS as readonly string[]).includes(body.action as string)
    ? (body.action as Action)
    : null;
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : "";
  if (!action || !targetUserId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (targetUserId === caller.userId) {
    return NextResponse.json({ error: "cannot_self_moderate" }, { status: 400 });
  }
  if ((action === "ban" || action === "unban") && !isAdmin) {
    return NextResponse.json({ error: "admin_required" }, { status: 403 });
  }

  const reportId = typeof body.reportId === "string" ? body.reportId : null;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null;

  // Guard: only an admin may moderate another staff/admin.
  const admin = createServiceClient();
  const { data: targetRow } = await admin
    .from("users")
    .select("role")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!targetRow) return NextResponse.json({ error: "no_such_user" }, { status: 404 });
  if (isStaffRole(targetRow.role as string | null) && !isAdmin) {
    return NextResponse.json({ error: "cannot_moderate_staff" }, { status: 403 });
  }

  const actor = caller.userId;
  let actionTaken = action as string;

  try {
    switch (action) {
      case "dismiss":
        actionTaken = "dismissed";
        break;
      case "clear_display_name":
        await clearUserField({ actorUserId: actor, targetUserId, field: "display_name" });
        actionTaken = "cleared display name";
        break;
      case "clear_bio":
        await clearUserField({ actorUserId: actor, targetUserId, field: "bio" });
        actionTaken = "cleared bio";
        break;
      case "clear_banner": {
        const { data: row } = await admin
          .from("users")
          .select("profile_banner_url")
          .eq("id", targetUserId)
          .maybeSingle();
        await admin.from("users").update({ profile_banner_url: null }).eq("id", targetUserId);
        const bannerUrl = row?.profile_banner_url as string | null;
        if (bannerUrl) {
          const k = keyFromPublicUrl(bannerUrl);
          if (k) await deleteFromR2(k);
        }
        await writeModerationAudit({
          actorUserId: actor,
          targetUserId,
          action: "clear_field",
          detail: "profile_banner_url",
        });
        actionTaken = "cleared banner";
        break;
      }
      case "warn":
        await setUserModeration({ actorUserId: actor, targetUserId, status: "warned", reason: notes });
        actionTaken = "warned";
        break;
      case "suspend": {
        const hours = Math.max(1, Math.min(8760, Math.floor(Number(body.durationHours) || 168)));
        const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
        await setUserModeration({ actorUserId: actor, targetUserId, status: "suspended", until, reason: notes });
        actionTaken = `suspended ${hours}h`;
        break;
      }
      case "ban":
        await setUserModeration({ actorUserId: actor, targetUserId, status: "banned", reason: notes });
        actionTaken = "banned";
        break;
      case "unban":
        await setUserModeration({ actorUserId: actor, targetUserId, status: "ok", reason: null });
        actionTaken = "lifted";
        break;
    }

    if (reportId) {
      await resolveReport({
        reportId,
        staffUserId: actor,
        status: action === "dismiss" ? "dismissed" : "actioned",
        actionTaken,
        staffNotes: notes,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "action_failed" }, { status: 500 });
  }
}
