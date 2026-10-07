/**
 * Opening the Discord Activity from a button on one of our posts.
 *
 * Discord launches an Activity when an interaction is answered with
 * LAUNCH_ACTIVITY (type 12), but the launch carries no data. So we note which
 * game the button was for (discord_activity_intents, read once by
 * /api/activity/token within a few minutes) and the Activity opens on it.
 *
 * On unless DISCORD_ACTIVITY_LIVE=0. The production app is verified (Oct 7,
 * 2026), so the Activity opens for everyone; an unverified app (the dev bot)
 * only opens it for the team and App Testers in servers under 25 members. Set
 * it to 0 to put the buttons back on their in-chat forms.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";
import { ephemeralMessage } from "./respond";

export type ActivityTab = "daily" | "weekly" | "brain";

export function activityLive(): boolean {
  return process.env.DISCORD_ACTIVITY_LIVE !== "0";
}

export async function launchActivity(discordUserId: string, tab: ActivityTab): Promise<Response> {
  await createServiceClient().from("discord_activity_intents")
    .upsert({ discord_user_id: discordUserId, tab, created_at: new Date().toISOString() }, { onConflict: "discord_user_id" })
    .then(({ error }) => { if (error) console.warn("[discord] activity intent not saved:", error.message); });
  return Response.json({ type: 12 });
}

/** /gs-daily: opens the Activity on today's Daily, or links to it on the site when the Activity is off. */
export function handleGsDaily(interaction: Record<string, unknown>): Response | Promise<Response> {
  const member = interaction.member as { user?: { id?: string } } | undefined;
  const id = member?.user?.id ?? (interaction.user as { id?: string } | undefined)?.id;
  if (id && activityLive()) return launchActivity(id, "daily");
  return ephemeralMessage(`Play today's Daily Shuffle: ${SITE_URL}/daily?src=discord`);
}
