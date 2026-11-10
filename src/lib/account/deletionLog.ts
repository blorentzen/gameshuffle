/**
 * The account_deletions row written just before an account is deleted (POST /api/account/delete): churn
 * numbers on Platform ▸ Growth and remarketing suppression. `details` is the delete form's optional
 * "Anything else you'd like us to know?" (supabase/leave-reasons-m1.sql); before that column exists the
 * row is saved without it. Best effort: never throws, never blocks the deletion.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanLeaveComment, cleanLeaveReason } from "@/lib/account/leaveReasons";

export interface DeletionLog {
  userId: string;
  email: string | null;
  reason: unknown;
  details: unknown;
  tier: string | null;
  createdAt: string | null;
}

/** Column missing from PostgREST's cache (PGRST204) or Postgres (42703). */
const columnMissing = (code?: string) => code === "PGRST204" || code === "42703";

export async function logAccountDeletion(admin: SupabaseClient, log: DeletionLog): Promise<{ saved: boolean; withDetails: boolean }> {
  const row = {
    user_id: log.userId,
    email: log.email,
    reason: cleanLeaveReason(log.reason),
    subscription_tier: log.tier,
    account_created_at: log.createdAt,
  };
  const details = cleanLeaveComment(log.details);
  try {
    let { error } = await admin.from("account_deletions").insert({ ...row, details });
    if (!error) return { saved: true, withDetails: true };
    if (columnMissing(error.code)) {
      ({ error } = await admin.from("account_deletions").insert(row));
      if (!error) return { saved: true, withDetails: false };
    }
    console.error("[account/delete] deletion-log insert failed (non-fatal):", error);
  } catch (err) {
    console.error("[account/delete] deletion-log insert failed (non-fatal):", err);
  }
  return { saved: false, withDetails: false };
}
