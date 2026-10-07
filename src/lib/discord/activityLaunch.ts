/**
 * Opening the Discord Activity from a button on one of our posts.
 *
 * Discord launches an Activity when an interaction is answered with
 * LAUNCH_ACTIVITY (type 12), but the launch carries no data. So we note which
 * game the button was for (discord_activity_intents, read once by
 * /api/activity/token within a few minutes) and the Activity opens on it.
 *
 * Off until DISCORD_ACTIVITY_LIVE=1: an unverified Activity only opens for
 * the team and App Testers in servers under 25 members, so the buttons keep
 * their in-chat forms until Discord has verified the app.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type ActivityTab = "daily" | "weekly" | "brain";

export function activityLive(): boolean {
  return process.env.DISCORD_ACTIVITY_LIVE === "1";
}

export async function launchActivity(discordUserId: string, tab: ActivityTab): Promise<Response> {
  await createServiceClient().from("discord_activity_intents")
    .upsert({ discord_user_id: discordUserId, tab, created_at: new Date().toISOString() }, { onConflict: "discord_user_id" })
    .then(({ error }) => { if (error) console.warn("[discord] activity intent not saved:", error.message); });
  return Response.json({ type: 12 });
}
