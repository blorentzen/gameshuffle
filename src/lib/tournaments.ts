import { createClient } from "@/lib/supabase/client";
import { effectiveTier, normalizeTier, TOURNAMENT_LIMITS } from "@/lib/subscription";

export async function canCreateTournament(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createClient();
  const [countRes, userRes] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", userId)
      .in("status", ["draft", "open", "in_progress"]),
    supabase.from("users").select("subscription_tier, role").eq("id", userId).maybeSingle(),
  ]);

  const tier = effectiveTier({ tier: normalizeTier(userRes.data?.subscription_tier), role: userRes.data?.role });
  const limit = TOURNAMENT_LIMITS[tier]; // free: 1 active, pro: unlimited
  if ((countRes.count || 0) >= limit) {
    return {
      allowed: false,
      reason:
        tier === "free"
          ? "Free accounts can have 1 active tournament at a time. Complete or cancel it, or upgrade to Pro for unlimited."
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
