/**
 * `/gs-roll [dice]` — dice roll slash command.
 *
 * Thin wrapper around the existing `rollHandler` in
 * `src/lib/twitch/commands/defaultHandlers.ts` so the dice grammar
 * (`!roll`, `!roll 20`, `!roll 2d6`) is identical across Twitch and
 * Discord — including the 100-die / 1000-side caps and the format
 * of multi-die results (`[3, 7] = 10`).
 *
 * The handler is pure (no Discord-specific imports), so calling it
 * from Discord land doesn't pull any Twitch dependencies into the
 * cold-start path.
 */

import { rollHandler } from "@/lib/twitch/commands/defaultHandlers";
import { channelMessage, ephemeralMessage } from "../respond";

interface DiscordUser {
  id: string;
}

interface CommandOption {
  name: string;
  value?: string | number | boolean;
}

function callerFrom(interaction: Record<string, unknown>): DiscordUser | null {
  const member = interaction.member as
    | { user?: DiscordUser }
    | undefined;
  const direct = interaction.user as DiscordUser | undefined;
  return member?.user ?? direct ?? null;
}

function readDiceOption(interaction: Record<string, unknown>): string {
  const data = interaction.data as
    | { options?: CommandOption[] }
    | undefined;
  const opt = data?.options?.find((o) => o.name === "dice");
  return typeof opt?.value === "string" ? opt.value.trim() : "";
}

export function handleRoll(
  interaction: Record<string, unknown>,
): Response {
  const caller = callerFrom(interaction);
  if (!caller?.id) {
    return ephemeralMessage("Couldn't read your user info — try again?");
  }
  const result = rollHandler(readDiceOption(interaction));
  if (!result.ok) {
    return ephemeralMessage(result.errorMessage);
  }
  return channelMessage(
    `🎲 <@${caller.id}> rolled **${result.result}**`,
  );
}
