import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeModerationAudit } from "./audit";
import type { ModerationStatus, ReportStatus } from "./types";

export interface ReviewReport {
  id: string;
  reporterUserId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  target: {
    username: string | null;
    displayName: string | null;
    moderationStatus: string | null;
    moderationUntil: string | null;
  } | null;
}

/** Open + in-review reports, newest first, with a summary of each target. */
export async function listReportsForReview(): Promise<ReviewReport[]> {
  const admin = createServiceClient();
  const { data: reports } = await admin
    .from("reports")
    .select("id, reporter_user_id, target_type, target_id, reason, details, status, created_at")
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (reports ?? []) as Array<{
    id: string;
    reporter_user_id: string | null;
    target_type: string;
    target_id: string;
    reason: string;
    details: string | null;
    status: ReportStatus;
    created_at: string;
  }>;

  const targetIds = [...new Set(list.map((r) => r.target_id))];
  const targets = new Map<string, ReviewReport["target"]>();
  if (targetIds.length) {
    const { data: users } = await admin
      .from("users")
      .select("id, username, display_name, moderation_status, moderation_until")
      .in("id", targetIds);
    for (const u of (users ?? []) as Array<Record<string, unknown>>) {
      targets.set(u.id as string, {
        username: (u.username as string | null) ?? null,
        displayName: (u.display_name as string | null) ?? null,
        moderationStatus: (u.moderation_status as string | null) ?? null,
        moderationUntil: (u.moderation_until as string | null) ?? null,
      });
    }
  }

  return list.map((r) => ({
    id: r.id,
    reporterUserId: r.reporter_user_id,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.created_at,
    target: targets.get(r.target_id) ?? null,
  }));
}

/** Resolve a report (actioned / dismissed), stamping the reviewing staffer. */
export async function resolveReport(args: {
  reportId: string;
  staffUserId: string;
  status: Extract<ReportStatus, "actioned" | "dismissed">;
  actionTaken: string;
  staffNotes?: string | null;
}): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("reports")
    .update({
      status: args.status,
      staff_user_id: args.staffUserId,
      action_taken: args.actionTaken,
      staff_notes: args.staffNotes ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", args.reportId);
}

/** Set a user's moderation status (+ audit). */
export async function setUserModeration(args: {
  actorUserId: string;
  targetUserId: string;
  status: ModerationStatus;
  until?: string | null;
  reason?: string | null;
}): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("users")
    .update({
      moderation_status: args.status,
      moderation_until: args.until ?? null,
      moderation_reason: args.reason ?? null,
      moderation_updated_at: new Date().toISOString(),
      moderation_updated_by: args.actorUserId,
    })
    .eq("id", args.targetUserId);
  await writeModerationAudit({
    actorUserId: args.actorUserId,
    targetUserId: args.targetUserId,
    action: args.status === "ok" ? "unban" : args.status,
    detail: args.reason ?? null,
  });
}

/** Blank a reported free-text field on a user (display_name for now). */
export async function clearUserField(args: {
  actorUserId: string;
  targetUserId: string;
  field: "display_name" | "bio";
}): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("users")
    .update({ [args.field]: null })
    .eq("id", args.targetUserId);
  await writeModerationAudit({
    actorUserId: args.actorUserId,
    targetUserId: args.targetUserId,
    action: "clear_field",
    detail: args.field,
  });
}
