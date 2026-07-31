import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStanding } from "./standing";
import { reportSeverity } from "./reasons";
import type { ReportTargetType } from "./types";

/** Per-user report cap per rolling 24h (§6.4). Anti-abuse, not a §3 policy. */
const REPORT_CAP_24H = 20;

/**
 * Resolve the owning account of a reported target (denormalized onto the report
 * for per-owner pattern detection, §5). profile/user targets ARE the owner;
 * idea → author; others resolve to null until their surfaces are wired.
 */
async function resolveTargetOwner(
  targetType: ReportTargetType,
  targetId: string,
): Promise<string | null> {
  if (targetType === "profile" || targetType === "user") return targetId;
  const admin = createServiceClient();
  if (targetType === "idea") {
    const { data } = await admin.from("gs_ideas").select("author_id").eq("id", targetId).maybeSingle();
    return (data as { author_id?: string } | null)?.author_id ?? null;
  }
  if (targetType === "chat_message") {
    const { data } = await admin.from("messages").select("sender_id").eq("id", targetId).maybeSingle();
    return (data as { sender_id?: string } | null)?.sender_id ?? null;
  }
  return null;
}

/**
 * File a report. Deduped: one OPEN report per reporter (signed-in user, or
 * anon `reporterToken` = hashed IP) per target — repeat submits return
 * `deduped: true` instead of stacking the queue. Service-role only.
 *
 * Derives `severity` from reason (§6.2), denormalizes `target_owner_id` (§5),
 * enforces the 24h cap + blocks reporting from suspended/banned accounts (§6.5).
 */
export async function createReport(args: {
  reporterUserId: string | null;
  reporterToken: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  reportedFields?: string[] | null;
}): Promise<{ ok: true; deduped: boolean } | { ok: false; reason: "rate_limited" | "suspended" }> {
  const admin = createServiceClient();

  // Reporting is disabled for suspended/banned accounts (§6.5).
  if (args.reporterUserId) {
    const standing = await getStanding(args.reporterUserId);
    if (standing.state === "suspended" || standing.state === "banned") {
      return { ok: false, reason: "suspended" };
    }
    // Per-user 24h cap (§6.4).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_user_id", args.reporterUserId)
      .gte("created_at", since);
    if ((count ?? 0) >= REPORT_CAP_24H) return { ok: false, reason: "rate_limited" };
  }

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
    target_owner_id: await resolveTargetOwner(args.targetType, args.targetId),
    severity: reportSeverity(args.reason),
    reason: args.reason,
    details: args.details,
    reported_fields: args.reportedFields ?? null,
  });
  if (error) throw error;
  return { ok: true, deduped: false };
}
