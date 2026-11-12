import "server-only";

/**
 * Who gets the opt-in daily and weekly posts (the Monday Weekly card, the daily
 * Chat Brain question): owners who routed the category to a channel (GS Pro
 * routing), plus owners whose server turned the post on in Channels and posts
 * (free since 2026-11-11: it goes to that server's default channel). One entry
 * per owner; postComponentsToCategory covers each of their active servers.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type OptInPost = "weekly" | "chatbrain";

export async function optInOwners(category: OptInPost): Promise<string[]> {
  const admin = createServiceClient();
  const [routes, switched] = await Promise.all([
    admin.from("discord_channel_routes").select("user_id").eq("category", category).limit(5000),
    admin.from("discord_guilds").select("owner_user_id").eq(`event_subscriptions->>${category}`, "true").is("removed_at", null).limit(5000),
  ]);
  if (switched.error) console.warn(`[discord] ${category} opt-in read failed`, switched.error.message);
  return [
    ...new Set([
      ...((routes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
      ...((switched.data ?? []) as { owner_user_id: string }[]).map((r) => r.owner_user_id),
    ]),
  ];
}
