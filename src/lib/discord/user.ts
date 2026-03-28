import { createClient } from "@supabase/supabase-js";
import type { SubscriptionTier } from "@/lib/subscription";

export interface DiscordCommandUser {
  discordId: string;
  discordUsername: string;
  gsUserId: string | null;
  tier: SubscriptionTier;
  linked: boolean;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Extract Discord user from interaction */
export function getDiscordUser(interaction: Record<string, unknown>): { id: string; username: string; global_name?: string } | null {
  if (interaction.member) {
    return (interaction.member as Record<string, unknown>).user as { id: string; username: string; global_name?: string };
  }
  return interaction.user as { id: string; username: string; global_name?: string } | null;
}

/** Resolve a Discord user to their GameShuffle account + tier */
export async function resolveDiscordUser(discordId: string, discordUsername: string): Promise<DiscordCommandUser> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from("users")
    .select("id, subscription_tier")
    .eq("discord_id", discordId)
    .single();

  if (!data) {
    return {
      discordId,
      discordUsername,
      gsUserId: null,
      tier: "free",
      linked: false,
    };
  }

  return {
    discordId,
    discordUsername,
    gsUserId: data.id,
    tier: (data.subscription_tier || "free") as SubscriptionTier,
    linked: true,
  };
}
