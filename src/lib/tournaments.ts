import { createClient } from "@/lib/supabase/client";

const FREE_ACTIVE_TOURNAMENT_LIMIT = 1;

export async function canCreateTournament(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createClient();
  const { count } = await supabase
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("organizer_id", userId)
    .in("status", ["draft", "open", "in_progress"]);

  if ((count || 0) >= FREE_ACTIVE_TOURNAMENT_LIMIT) {
    return {
      allowed: false,
      reason: "You already have an active tournament. Complete or cancel it to create a new one.",
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
