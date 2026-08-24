/**
 * `/gs-remind in:<duration> message:<text>` — a Carlbot-style reminder, GS Pro.
 *
 * Stores the reminder; a minute cron (`/api/cron/discord-reminders`) fires it by
 * posting in the same channel and pinging the requester. Anyone in a Pro
 * streamer's server can set one for themselves.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { callerFrom, guildOwner } from "../guildOwner";
import { ephemeralMessage } from "../respond";

interface Option {
  name: string;
  value?: string | number | boolean;
}

const MIN_SECONDS = 30;
const MAX_SECONDS = 30 * 86400; // 30 days

/** Parse "30s" / "10m" / "2h" / "1d" (bare number = minutes) into seconds. */
export function parseDuration(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n) return null;
  const unit = m[2] ?? "m";
  const mult = unit === "s" ? 1 : unit === "h" ? 3600 : unit === "d" ? 86400 : 60;
  const secs = n * mult;
  return secs >= MIN_SECONDS && secs <= MAX_SECONDS ? secs : null;
}

function humanize(secs: number): string {
  if (secs % 86400 === 0) return `${secs / 86400} day${secs / 86400 === 1 ? "" : "s"}`;
  if (secs % 3600 === 0) return `${secs / 3600} hour${secs / 3600 === 1 ? "" : "s"}`;
  if (secs % 60 === 0) return `${secs / 60} minute${secs / 60 === 1 ? "" : "s"}`;
  return `${secs} seconds`;
}

export async function handleGsRemind(interaction: Record<string, unknown>): Promise<Response> {
  const owner = await guildOwner((interaction.guild_id as string | undefined) ?? null);
  if (!owner) return ephemeralMessage("GameShuffle isn't linked to this server yet.");
  if (!owner.isPro) return ephemeralMessage("⏰ Reminders are a GS Pro feature.");

  const data = interaction.data as { options?: Option[] };
  const opt = (n: string) => String(data.options?.find((o) => o.name === n)?.value ?? "").trim();
  const secs = parseDuration(opt("in"));
  if (!secs) return ephemeralMessage("Use a duration like `10m`, `2h`, or `1d` (30s–30d).");
  const message = opt("message");
  if (!message) return ephemeralMessage("What should I remind you about?");

  const caller = callerFrom(interaction);
  const channelId = interaction.channel_id as string | undefined;
  if (!caller?.id || !channelId) return ephemeralMessage("Couldn't set that reminder.");

  const { error } = await createServiceClient().from("discord_reminders").insert({
    owner_user_id: owner.ownerId,
    guild_id: (interaction.guild_id as string | undefined) ?? null,
    channel_id: channelId,
    user_discord_id: caller.id,
    message: message.slice(0, 1500),
    remind_at: new Date(Date.now() + secs * 1000).toISOString(),
  });
  if (error) return ephemeralMessage("Couldn't set that reminder — try again.");
  return ephemeralMessage(`⏰ I'll remind you here in ${humanize(secs)}.`);
}
