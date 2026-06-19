/**
 * `/gs-8ball [question]` — magic 8-ball slash command.
 *
 * Pulls the canonical 20-answer pool from
 * `gs_default_command_responses` (community_id IS NULL — platform-
 * curated) so the answer set is identical to Twitch chat's
 * `!8ball`.
 *
 * The optional `question` is echoed back in the response so chat
 * sees the prompt + the answer together. Discord truncates messages
 * past ~2000 chars; we clamp the question at 256 to leave room for
 * the answer + chrome.
 */

import { pickFromPlatformPool } from "@/lib/defaultCommands/poolHelpers";
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

function readQuestionOption(
  interaction: Record<string, unknown>,
): string | null {
  const data = interaction.data as
    | { options?: CommandOption[] }
    | undefined;
  const opt = data?.options?.find((o) => o.name === "question");
  if (typeof opt?.value !== "string") return null;
  const trimmed = opt.value.trim();
  if (!trimmed) return null;
  // Clamp — see header comment.
  return trimmed.length > 256 ? `${trimmed.slice(0, 253)}…` : trimmed;
}

export async function handleEightball(
  interaction: Record<string, unknown>,
): Promise<Response> {
  const caller = callerFrom(interaction);
  if (!caller?.id) {
    return ephemeralMessage("Couldn't read your user info — try again?");
  }
  const result = await pickFromPlatformPool("8ball");
  if (!result) {
    return ephemeralMessage(
      "The magic 8-ball pool isn't set up yet — staff needs to seed `gs_default_command_responses` for `trigger='8ball'`.",
    );
  }
  const question = readQuestionOption(interaction);
  if (question) {
    return channelMessage(
      `🎱 <@${caller.id}> asked: *${question}*\n→ **${result}**`,
    );
  }
  return channelMessage(`🎱 <@${caller.id}> → **${result}**`);
}
