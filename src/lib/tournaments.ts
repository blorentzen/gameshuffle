import { createClient } from "@/lib/supabase/client";
import { circuitPlanActive, effectiveTier, normalizeTier, TOURNAMENT_LIMITS } from "@/lib/subscription";
import { isActiveTournament } from "@/lib/events/lifecycle";

/** What a free account hears at its one active tournament (the database trigger says the same). */
export const FREE_TOURNAMENT_LIMIT_MESSAGE = "Free accounts can have 1 active tournament at a time. Complete, cancel or archive it, or get unlimited with GS Pro or GS Circuit.";

export async function canCreateTournament(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createClient();
  const [rowsRes, userRes] = await Promise.all([
    // Same rule as the database trigger: archived and stale tournaments don't hold the slot.
    supabase
      .from("tournaments")
      .select("status, date_time, archived_at")
      .eq("organizer_id", userId)
      .is("championship_id", null)
      .in("status", ["draft", "open", "in_progress"]),
    supabase.from("users").select("subscription_tier, role, circuit_tier, circuit_status").eq("id", userId).maybeSingle(),
  ]);

  const tier = effectiveTier({ tier: normalizeTier(userRes.data?.subscription_tier), role: userRes.data?.role, circuitTier: userRes.data?.circuit_tier ?? null, circuitStatus: userRes.data?.circuit_status ?? null });
  // GS Pro, or a live GS Circuit 64 or 256 plan: unlimited. Same rule as the database trigger.
  const limit = circuitPlanActive(userRes.data?.circuit_tier, userRes.data?.circuit_status) ? Infinity : TOURNAMENT_LIMITS[tier];
  const active = ((rowsRes.data ?? []) as { status: string; date_time: string | null; archived_at: string | null }[]).filter((t) => isActiveTournament(t)).length;
  if (active >= limit) {
    return {
      allowed: false,
      reason:
        tier === "free"
          ? FREE_TOURNAMENT_LIMIT_MESSAGE
          : "You've reached your active tournament limit.",
    };
  }
  return { allowed: true };
}

export function generateShareToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 8; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
