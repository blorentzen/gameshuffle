import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/** What every Studio page needs about the streamer: the live page's slug and the profile time zone. */
export async function studioOwner(userId: string): Promise<{ liveSlug: string | null; timezone: string | null }> {
  const { data } = await createServiceClient().from("users").select("username, twitch_username, timezone").eq("id", userId).maybeSingle();
  const r = (data ?? {}) as { username?: string | null; twitch_username?: string | null; timezone?: string | null };
  return { liveSlug: r.username ?? r.twitch_username ?? null, timezone: r.timezone ?? null };
}
