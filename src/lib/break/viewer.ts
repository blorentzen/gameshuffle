/**
 * Who's answering a break round from the live page. A viewer with Twitch
 * linked plays as their Twitch account, so a tap on the live page and a
 * message in chat are the same player; anyone else plays as their site
 * account. Server only.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export interface BreakViewer { platform: "twitch" | "site"; viewer: string; name: string }

export async function breakViewer(): Promise<BreakViewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("twitch_id, display_name, username").eq("id", user.id).maybeSingle();
  const row = data as { twitch_id: string | null; display_name: string | null; username: string | null } | null;
  const name = (row?.display_name || row?.username || "Someone").slice(0, 40);
  return row?.twitch_id ? { platform: "twitch", viewer: row.twitch_id, name } : { platform: "site", viewer: user.id, name };
}
