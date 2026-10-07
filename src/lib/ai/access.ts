import "server-only";

/**
 * Who may use an AI feature, for every /api/ai route: a signed-in account on
 * GS Pro (or staff/admin, who also aren't held to the allowance). Features
 * that are free to try (AI_FEATURES in features.ts) give free accounts the
 * daily allowance (`ai_free_per_day`). Returns the account and how many generations
 * it has left. Signed-out visitors never reach Claude; the AI buttons ask them
 * to make a free account first (AiGate).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { aiConfigured } from "@/lib/ai/claude";
import { aiLimits, aiRemaining, aiRemainingToday, type AiLimits } from "@/lib/ai/usage";
import { AI_FEATURES, type AiFeature } from "@/lib/ai/features";

export type AiPlan = "pro" | "free" | "staff";

export type AiAccess =
  | { ok: true; userId: string; remaining: number | null }
  | { ok: false; error: "unauthenticated" | "pro_required" | "allowance_used" | "daily_used" | "not_configured"; status: number; remaining?: number };

/** The signed-in account's AI plan, or null when signed out. */
export async function aiPlanFor(): Promise<{ userId: string; plan: AiPlan } | null> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient()
    .from("users").select("subscription_tier, role, circuit_tier, circuit_status").eq("id", user.id).maybeSingle();
  const p = data as { subscription_tier: string | null; role: string | null; circuit_tier: string | null; circuit_status: string | null } | null;
  if (p?.role === "staff" || p?.role === "admin") return { userId: user.id, plan: "staff" };
  const pro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null, circuitTier: p?.circuit_tier ?? null, circuitStatus: p?.circuit_status ?? null }) === "pro";
  return { userId: user.id, plan: pro ? "pro" : "free" };
}

/** Generations left for this plan: null = unlimited (staff), 0 for a free account on a Pro-only feature. */
export async function aiRemainingFor(userId: string, plan: AiPlan, free: boolean, limits: AiLimits): Promise<number | null> {
  if (plan === "staff") return null;
  if (plan === "pro") return aiRemaining(userId, false, limits);
  return free ? aiRemainingToday(userId, limits) : 0;
}

export async function aiAccess(feature: AiFeature): Promise<AiAccess> {
  const free = AI_FEATURES[feature].free;
  const who = await aiPlanFor();
  if (!who) return { ok: false, error: "unauthenticated", status: 401 };
  if (who.plan === "free" && !free) return { ok: false, error: "pro_required", status: 403 };
  if (!aiConfigured()) return { ok: false, error: "not_configured", status: 503 };
  const remaining = await aiRemainingFor(who.userId, who.plan, free, await aiLimits());
  if (remaining === 0) return { ok: false, error: who.plan === "pro" ? "allowance_used" : "daily_used", status: 429, remaining: 0 };
  return { ok: true, userId: who.userId, remaining };
}
