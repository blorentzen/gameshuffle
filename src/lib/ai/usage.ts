import "server-only";

/**
 * The AI allowances. GS Pro accounts get `ai_pro_per_30d` generations per
 * rolling 30 days across every AI feature; free accounts get `ai_free_per_day`
 * per Pacific day (reset at midnight Pacific) on the features that are free to try (plain-language
 * setup, the night planner, the tournament helper). Staff and admins aren't
 * limited. Both numbers are pricing levers (Platform > Pricing or Platform >
 * AI usage), with the defaults below until a row exists.
 *
 * Counted from `ai_usage` (supabase/ai-usage-m1.sql, tokens from -m2), which
 * stores only who, which feature, when and how many tokens.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { lever } from "@/lib/pricing/catalog";
import type { AiTokens } from "@/lib/ai/tokens";
import type { AiFeature } from "@/lib/ai/features";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";

export type { AiFeature };

export const AI_PRO_PER_30D_DEFAULT = 60;
export const AI_FREE_PER_DAY_DEFAULT = 3;
export const AI_LEVERS = { proPer30d: "ai_pro_per_30d", freePerDay: "ai_free_per_day" } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiLimits { proPer30d: number; freePerDay: number }

export async function aiLimits(): Promise<AiLimits> {
  const [proPer30d, freePerDay] = await Promise.all([
    lever(AI_LEVERS.proPer30d, AI_PRO_PER_30D_DEFAULT).catch(() => AI_PRO_PER_30D_DEFAULT),
    lever(AI_LEVERS.freePerDay, AI_FREE_PER_DAY_DEFAULT).catch(() => AI_FREE_PER_DAY_DEFAULT),
  ]);
  return { proPer30d: Math.max(0, Math.round(proPer30d)), freePerDay: Math.max(0, Math.round(freePerDay)) };
}

/** Generations left since an instant. A read failure (e.g. the table is missing) doesn't block the feature. */
async function remainingSince(userId: string, since: string, limit: number): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since);
  if (error) {
    console.error("[ai] usage read failed:", error.message);
    return limit;
  }
  return Math.max(0, limit - (count ?? 0));
}

/** GS Pro: generations left in the rolling 30 days (null = unlimited, for staff and admins). */
export async function aiRemaining(userId: string, unlimited: boolean, limits?: AiLimits): Promise<number | null> {
  if (unlimited) return null;
  const l = limits ?? (await aiLimits());
  return remainingSince(userId, new Date(Date.now() - 30 * DAY_MS).toISOString(), l.proPer30d);
}

/** Free accounts: generations left today (since midnight Pacific) on the free-to-try features. */
export async function aiRemainingToday(userId: string, limits?: AiLimits): Promise<number> {
  const l = limits ?? (await aiLimits());
  return remainingSince(userId, gsDayStart(gsDay()).toISOString(), l.freePerDay);
}

export async function recordAiUse(userId: string, feature: AiFeature, tokens?: AiTokens): Promise<void> {
  const svc = createServiceClient();
  const row = { user_id: userId, feature };
  const withTokens = tokens && tokens.calls > 0 ? { ...row, input_tokens: tokens.input, output_tokens: tokens.output } : row;
  let { error } = await svc.from("ai_usage").insert(withTokens);
  // Token columns arrive with ai-usage-m2.sql; until then, record the use without them.
  if (error && withTokens !== row && /input_tokens|output_tokens|column/i.test(error.message)) ({ error } = await svc.from("ai_usage").insert(row));
  if (error) console.error("[ai] usage write failed:", error.message);
}
