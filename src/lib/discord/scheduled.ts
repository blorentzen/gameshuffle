import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { postAnnouncementToCategory } from "@/lib/adapters/discord";

/**
 * Scheduled Discord posts — the engine behind announce "schedule" + "follow-up"
 * modes. Rows fire from `/api/cron/discord-scheduled`; the target channel is
 * resolved by `category` at fire time (via the streamer's routing).
 */

export interface ScheduledContent {
  title: string;
  body: string;
  url?: string | null;
}

export async function scheduleDiscordPost(args: {
  userId: string;
  category: string;
  content: ScheduledContent;
  fireAt: string;
  parentId?: string | null;
}): Promise<string | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("discord_scheduled_posts")
    .insert({
      user_id: args.userId,
      category: args.category,
      content: args.content,
      fire_at: args.fireAt,
      parent_id: args.parentId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

/** Fire every pending post whose time has come. Returns counts for the cron log. */
export async function fireDueScheduledPosts(limit = 50): Promise<{ sent: number; failed: number }> {
  const admin = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("discord_scheduled_posts")
    .select("id, user_id, category, content")
    .eq("status", "pending")
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    category: string;
    content: ScheduledContent;
  }>;

  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const res = await postAnnouncementToCategory({
      ownerUserId: r.user_id,
      category: r.category,
      title: r.content.title,
      body: r.content.body,
      url: r.content.url,
    });
    if (res.ok) {
      await admin
        .from("discord_scheduled_posts")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent += 1;
    } else {
      await admin
        .from("discord_scheduled_posts")
        .update({ status: "failed", error: res.reason })
        .eq("id", r.id);
      failed += 1;
    }
  }
  return { sent, failed };
}
