/**
 * Fire due Discord reminders — posts in the origin channel and pings the
 * requester. Each row is claimed (fired=true) before posting so overlapping
 * cron runs can't double-fire.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { postChannelMessage } from "@/lib/adapters/discord/adapter";

interface ReminderRow {
  id: string;
  channel_id: string;
  user_discord_id: string;
  message: string;
}

export async function fireDueReminders(now: number = Date.now()): Promise<number> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("discord_reminders")
    .select("id, channel_id, user_discord_id, message")
    .eq("fired", false)
    .lte("remind_at", new Date(now).toISOString())
    .limit(100);

  let fired = 0;
  for (const r of (data as ReminderRow[] | null) ?? []) {
    // Claim before posting; a concurrent run loses the race and skips.
    const { data: claimed } = await admin
      .from("discord_reminders")
      .update({ fired: true })
      .eq("id", r.id)
      .eq("fired", false)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const res = await postChannelMessage({
      channelId: r.channel_id,
      content: `⏰ <@${r.user_discord_id}> ${r.message}`,
      mentionUserIds: [r.user_discord_id],
    });
    if (res.ok) fired++;
  }
  return fired;
}
