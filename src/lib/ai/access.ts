import "server-only";

/**
 * Who may use an AI feature, for every /api/ai route: a signed-in account on
 * GS Pro (or staff/admin, who also aren't held to the allowance). Features
 * that are free with a daily cap pass `freePerDay`: free accounts get that
 * many a day. Returns the account and how many generations it has left.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { aiConfigured } from "@/lib/ai/claude";
import { aiRemaining, aiRemainingToday } from "@/lib/ai/usage";

export type AiAccess =
  | { ok: true; userId: string; remaining: number | null }
  | { ok: false; error: "unauthenticated" | "pro_required" | "allowance_used" | "daily_used" | "not_configured"; status: number; remaining?: number };

export async function aiAccess(opts: { freePerDay?: number } = {}): Promise<AiAccess> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated", status: 401 };
  const { data } = await createServiceClient()
    .from("users").select("subscription_tier, role, circuit_tier, circuit_status").eq("id", user.id).maybeSingle();
  const p = data as { subscription_tier: string | null; role: string | null; circuit_tier: string | null; circuit_status: string | null } | null;
  const staff = p?.role === "staff" || p?.role === "admin";
  const pro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null, circuitTier: p?.circuit_tier ?? null, circuitStatus: p?.circuit_status ?? null }) === "pro";
  if (!pro && !opts.freePerDay) return { ok: false, error: "pro_required", status: 403 };
  if (!aiConfigured()) return { ok: false, error: "not_configured", status: 503 };
  const remaining = pro ? await aiRemaining(user.id, staff) : await aiRemainingToday(user.id, opts.freePerDay ?? 0);
  if (remaining === 0) return { ok: false, error: pro ? "allowance_used" : "daily_used", status: 429, remaining: 0 };
  return { ok: true, userId: user.id, remaining };
}
