import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ReportTargetType } from "./types";

/**
 * File a report. Deduped: one OPEN report per reporter (signed-in user, or
 * anon `reporterToken` = hashed IP) per target — repeat submits return
 * `deduped: true` instead of stacking the queue. Service-role only.
 */
export async function createReport(args: {
  reporterUserId: string | null;
  reporterToken: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  reportedFields?: string[] | null;
}): Promise<{ ok: true; deduped: boolean }> {
  const admin = createServiceClient();

  if (args.reporterUserId || args.reporterToken) {
    let q = admin
      .from("reports")
      .select("id")
      .eq("target_type", args.targetType)
      .eq("target_id", args.targetId)
      .eq("status", "open")
      .limit(1);
    q = args.reporterUserId
      ? q.eq("reporter_user_id", args.reporterUserId)
      : q.eq("reporter_token", args.reporterToken as string);
    const { data: existing } = await q.maybeSingle();
    if (existing) return { ok: true, deduped: true };
  }

  const { error } = await admin.from("reports").insert({
    reporter_user_id: args.reporterUserId,
    reporter_token: args.reporterToken,
    target_type: args.targetType,
    target_id: args.targetId,
    reason: args.reason,
    details: args.details,
    reported_fields: args.reportedFields ?? null,
  });
  if (error) throw error;
  return { ok: true, deduped: false };
}
