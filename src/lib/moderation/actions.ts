import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/social/notifications";
import type { Capability, StandingState } from "./standing";

// Human-facing labels for the actioned-user notice (§10.2) — never names the
// reporter, never the report count.
const NOTICE_TITLE: Partial<Record<ModerationActionType, string>> = {
  warn: "You've received a warning",
  restrict: "Some features have been limited on your account",
  suspend: "Your account has been suspended",
  ban: "Your account has been banned",
};

/**
 * The materialized side of moderation (Spec 4 §5–§7): append to the
 * `gs_moderation_actions` audit log and keep `gs_account_standing` — the
 * queryable answer that `can()` reads — in sync. Never written by clients.
 */

export type ModerationActionType =
  | "dismiss"
  | "hide"
  | "unhide"
  | "remove"
  | "warn"
  | "restrict"
  | "suspend"
  | "ban"
  | "unban";

/** Append one immutable action row (§5, append-only enforced by DB trigger). */
export async function recordAction(args: {
  actorId: string | null;
  isSystem?: boolean;
  targetType: string;
  targetId: string;
  targetOwnerId?: string | null;
  action: ModerationActionType | string;
  reason: string;
  relatedReportIds?: string[] | null;
  expiresAt?: string | null;
}): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_moderation_actions").insert({
    actor_id: args.actorId,
    is_system: args.isSystem ?? false,
    target_type: args.targetType,
    target_id: args.targetId,
    target_owner_id: args.targetOwnerId ?? null,
    action: args.action,
    reason: args.reason,
    related_report_ids: args.relatedReportIds ?? null,
    expires_at: args.expiresAt ?? null,
  });
}

/**
 * Apply an account-standing change + log it. Materializes `gs_account_standing`
 * so every request reads standing without replaying the action log. Restriction
 * flags merge onto existing ones; returning to `good` clears them.
 */
export async function applyStanding(args: {
  actorId: string | null;
  targetUserId: string;
  state: StandingState;
  action: ModerationActionType;
  reason: string;
  restrictions?: Partial<Record<Capability, boolean>>;
  expiresAt?: string | null;
  strike?: boolean;
  relatedReportIds?: string[] | null;
  isSystem?: boolean;
}): Promise<void> {
  const admin = createServiceClient();

  const { data: cur } = await admin
    .from("gs_account_standing")
    .select("strike_count, restrictions")
    .eq("user_id", args.targetUserId)
    .maybeSingle();
  const curStrikes = (cur as { strike_count?: number } | null)?.strike_count ?? 0;
  const curRestrictions =
    ((cur as { restrictions?: Record<string, boolean> } | null)?.restrictions) ?? {};

  const restrictions =
    args.state === "good"
      ? {}
      : args.state === "restricted"
        ? { ...curRestrictions, ...(args.restrictions ?? {}) }
        : curRestrictions;

  await admin.from("gs_account_standing").upsert(
    {
      user_id: args.targetUserId,
      state: args.state,
      restrictions,
      state_expires_at: args.expiresAt ?? null,
      strike_count: curStrikes + (args.strike ? 1 : 0),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  await recordAction({
    actorId: args.actorId,
    isSystem: args.isSystem,
    targetType: "profile",
    targetId: args.targetUserId,
    targetOwnerId: args.targetUserId,
    action: args.action,
    reason: args.reason,
    relatedReportIds: args.relatedReportIds ?? null,
    expiresAt: args.expiresAt ?? null,
  });

  // Notice to the actioned user (§10.2): what + why + how to appeal. Never the
  // reporter's identity or the report count. System-authored (no actor avatar).
  const title = NOTICE_TITLE[args.action];
  if (title) {
    const expiryLine = args.expiresAt
      ? ` Until ${new Date(args.expiresAt).toLocaleDateString()}.`
      : "";
    await createNotification({
      userId: args.targetUserId,
      type: "moderation_notice",
      title,
      message: `${args.reason}${expiryLine} You can appeal from your account settings.`,
      link: "/account?tab=security",
    });
  }
}
