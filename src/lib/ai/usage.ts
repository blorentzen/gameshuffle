import "server-only";

/**
 * The AI allowance: GS Pro accounts get AI_MONTHLY_ALLOWANCE generations per
 * rolling 30 days across every AI feature; staff and admins aren't limited.
 * Counted from `ai_usage` (supabase/ai-usage-m1.sql), which stores only who,
 * which feature and when.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export const AI_MONTHLY_ALLOWANCE = 60;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Free accounts' daily cap on the features that are free to try (plain-language setup, the night planner). */
export const AI_FREE_PER_DAY = 5;

export type AiFeature = "pack" | "recap" | "setup" | "plan" | "tournament";

export async function aiRemaining(userId: string, unlimited: boolean): Promise<number | null> {
  if (unlimited) return null;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await createServiceClient()
    .from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since);
  if (error) {
    // Missing table (migration not applied yet) or a read failure: don't block the feature over it.
    console.error("[ai] usage read failed:", error.message);
    return AI_MONTHLY_ALLOWANCE;
  }
  return Math.max(0, AI_MONTHLY_ALLOWANCE - (count ?? 0));
}

/** Free accounts: generations left in the last 24 hours, for features that are free with a daily cap. */
export async function aiRemainingToday(userId: string, perDay: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await createServiceClient()
    .from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since);
  if (error) {
    console.error("[ai] usage read failed:", error.message);
    return perDay;
  }
  return Math.max(0, perDay - (count ?? 0));
}

export async function recordAiUse(userId: string, feature: AiFeature): Promise<void> {
  const { error } = await createServiceClient().from("ai_usage").insert({ user_id: userId, feature });
  if (error) console.error("[ai] usage write failed:", error.message);
}
