import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { writeModerationAudit } from "./audit";
import { applyStanding } from "./actions";
import type { Capability, StandingState } from "./standing";
import type { ModerationStatus, ReportStatus } from "./types";

// Legacy moderation_status → new standing state + action + strike-bearing?
const STANDING_MAP: Record<ModerationStatus, { state: StandingState; action: "warn" | "suspend" | "ban" | "unban"; strike: boolean }> = {
  ok: { state: "good", action: "unban", strike: false },
  warned: { state: "warned", action: "warn", strike: true },
  suspended: { state: "suspended", action: "suspend", strike: true },
  banned: { state: "banned", action: "ban", strike: true },
};

export interface ReviewReport {
  id: string;
  reporterUserId: string | null;
  targetType: string;
  targetId: string;
  /** The account that owns the reported content — the subject of account
   *  actions (for profile reports this equals targetId; for idea/chat it's the
   *  author/sender). */
  targetOwnerId: string | null;
  reason: string;
  severity: "standard" | "elevated";
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  target: {
    username: string | null;
    displayName: string | null;
    moderationStatus: string | null;
    moderationUntil: string | null;
  } | null;
  targetStanding: { state: string; strikeCount: number } | null;
}

/** Open + in-review reports — elevated first, then oldest-first (§8.1). */
export async function listReportsForReview(): Promise<ReviewReport[]> {
  const admin = createServiceClient();
  const { data: reports } = await admin
    .from("reports")
    .select("id, reporter_user_id, target_type, target_id, target_owner_id, reason, severity, details, status, created_at")
    .in("status", ["open", "reviewing"])
    // Elevated (sexual_content / self_harm) sorts to the top on a single report;
    // within a tier the operator works oldest-first to bound queue age.
    // 'elevated' < 'standard' alphabetically, so ascending puts elevated first.
    .order("severity", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);
  const list = (reports ?? []) as Array<{
    id: string;
    reporter_user_id: string | null;
    target_type: string;
    target_id: string;
    target_owner_id: string | null;
    reason: string;
    severity: "standard" | "elevated";
    details: string | null;
    status: ReportStatus;
    created_at: string;
  }>;

  // The account subject of each report: the denormalized owner, falling back to
  // target_id for legacy profile reports written before target_owner_id existed.
  const ownerId = (r: (typeof list)[number]) => r.target_owner_id ?? r.target_id;
  const ownerIds = [...new Set(list.map(ownerId))];

  const targets = new Map<string, ReviewReport["target"]>();
  const standings = new Map<string, { state: string; strikeCount: number }>();
  if (ownerIds.length) {
    const [{ data: users }, { data: rows }] = await Promise.all([
      admin
        .from("users")
        .select("id, username, display_name, moderation_status, moderation_until")
        .in("id", ownerIds),
      admin.from("gs_account_standing").select("user_id, state, strike_count").in("user_id", ownerIds),
    ]);
    for (const u of (users ?? []) as Array<Record<string, unknown>>) {
      targets.set(u.id as string, {
        username: (u.username as string | null) ?? null,
        displayName: (u.display_name as string | null) ?? null,
        moderationStatus: (u.moderation_status as string | null) ?? null,
        moderationUntil: (u.moderation_until as string | null) ?? null,
      });
    }
    for (const s of (rows ?? []) as Array<{ user_id: string; state: string; strike_count: number }>) {
      standings.set(s.user_id, { state: s.state, strikeCount: s.strike_count });
    }
  }

  return list.map((r) => {
    const owner = ownerId(r);
    return {
      id: r.id,
      reporterUserId: r.reporter_user_id,
      targetType: r.target_type,
      targetId: r.target_id,
      targetOwnerId: owner,
      reason: r.reason,
      severity: r.severity ?? "standard",
      details: r.details,
      status: r.status,
      createdAt: r.created_at,
      target: targets.get(owner) ?? null,
      targetStanding: standings.get(owner) ?? null,
    };
  });
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

  // Materialize the new standing source of truth (what can() reads) alongside
  // the legacy moderation_status, so existing warn/suspend/ban populate it.
  const m = STANDING_MAP[args.status];
  await applyStanding({
    actorId: args.actorUserId,
    targetUserId: args.targetUserId,
    state: m.state,
    action: m.action,
    reason: args.reason ?? m.action,
    expiresAt: args.until ?? null,
    strike: m.strike,
  });
}

/** Apply targeted capability restrictions (§7.2) — a scalpel vs. suspension. */
export async function restrictUser(args: {
  actorUserId: string;
  targetUserId: string;
  restrictions: Partial<Record<Capability, boolean>>;
  reason?: string | null;
}): Promise<void> {
  await applyStanding({
    actorId: args.actorUserId,
    targetUserId: args.targetUserId,
    state: "restricted",
    action: "restrict",
    reason: args.reason ?? "restricted",
    restrictions: args.restrictions,
    strike: true,
  });
  await writeModerationAudit({
    actorUserId: args.actorUserId,
    targetUserId: args.targetUserId,
    action: "restrict",
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
