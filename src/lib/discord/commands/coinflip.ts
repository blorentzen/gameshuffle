/**
 * `/gs-flip` — coin flip slash command.
 *
 * Pulls the heads/tails pool from `gs_default_command_responses`
 * (community_id IS NULL — the platform-curated set) so an admin
 * edit to the canonical 2-entry pool flows to both Twitch chat
 * (`!coinflip`) and Discord (`/gs-flip`) without a deploy.
 *
 * Public response (not ephemeral) — the whole point of a coin flip
 * is everyone seeing it.
 */

import { pickFromPlatformPool } from "@/lib/defaultCommands/poolHelpers";
import { channelMessage, ephemeralMessage } from "../respond";

interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
}

function callerFrom(interaction: Record<string, unknown>): DiscordUser | null {
  const member = interaction.member as
    | { user?: DiscordUser }
    | undefined;
  const direct = interaction.user as DiscordUser | undefined;
  return member?.user ?? direct ?? null;
}

export async function handleCoinflip(
  interaction: Record<string, unknown>,
): Promise<Response> {
  const caller = callerFrom(interaction);
  if (!caller?.id) {
    return ephemeralMessage("Couldn't read your user info — try again?");
  }
  const result = await pickFromPlatformPool("coinflip");
  if (!result) {
    return ephemeralMessage(
      "The coinflip pool isn't set up yet — staff needs to seed `gs_default_command_responses` for `trigger='coinflip'`.",
    );
  }
  return channelMessage(`🪙 <@${caller.id}> flipped a coin — **${result}**!`);
}
