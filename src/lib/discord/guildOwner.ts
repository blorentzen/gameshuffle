/**
 * Shared Discord-interaction helpers for the bot-suite commands: resolve the
 * guild's linked GameShuffle owner (+ Pro state), read the caller, and check
 * the "can manage the server" permission bit.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";

const MANAGE_GUILD = BigInt(32); // 1 << 5
const ADMINISTRATOR = BigInt(8); // 1 << 3
const ZERO = BigInt(0);

export interface DiscordCaller {
  id: string;
  username?: string;
}

export function callerFrom(interaction: Record<string, unknown>): DiscordCaller | null {
  const member = interaction.member as { user?: DiscordCaller } | undefined;
  return member?.user ?? (interaction.user as DiscordCaller | undefined) ?? null;
}

export function canManageGuild(interaction: Record<string, unknown>): boolean {
  const perms = (interaction.member as { permissions?: string } | undefined)?.permissions;
  if (!perms) return false;
  try {
    const bits = BigInt(perms);
    return (bits & MANAGE_GUILD) !== ZERO || (bits & ADMINISTRATOR) !== ZERO;
  } catch {
    return false;
  }
}

/** The GameShuffle streamer linked to a Discord guild, + whether they're Pro. */
export async function guildOwner(
  guildId: string | null,
): Promise<{ ownerId: string; isPro: boolean } | null> {
  if (!guildId) return null;
  const { data } = await createServiceClient()
    .from("users")
    .select("id, subscription_tier, role")
    .eq("discord_guild_id", guildId)
    .maybeSingle();
  const u = data as { id: string; subscription_tier: string | null; role: string | null } | null;
  if (!u) return null;
  return {
    ownerId: u.id,
    isPro: effectiveTier({ tier: normalizeTier(u.subscription_tier), role: u.role }) === "pro",
  };
}
