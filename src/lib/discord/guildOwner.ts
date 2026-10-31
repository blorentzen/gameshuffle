/**
 * Shared Discord-interaction helpers for the bot-suite commands: resolve the
 * guild's linked GameShuffle owner (+ Pro state), read the caller, and check
 * the "can manage the server" permission bit.
 */

import "server-only";
import { guildContext } from "./guilds";

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

/**
 * The GameShuffle streamer linked to a Discord guild, + whether the bot's Pro
 * tools are on there: the owner has Pro (a server beyond the main one is
 * paused without it, and pausing only happens without Pro).
 */
export async function guildOwner(
  guildId: string | null,
): Promise<{ ownerId: string; isPro: boolean } | null> {
  const ctx = await guildContext(guildId);
  if (!ctx) return null;
  return { ownerId: ctx.ownerId, isPro: ctx.isPro && ctx.active };
}
