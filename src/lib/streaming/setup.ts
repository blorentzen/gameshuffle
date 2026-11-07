import "server-only";

/**
 * Streaming's setup checklist (menus and account picks 2026-11-05, 4A): five steps that stay at the top of Account ▸
 * Streaming until each is done. Every check reads what's already there: the Twitch connection, the bot in chat (bot
 * authorized and the chat subscription on), the overlay loading in OBS (`overlay_seen_at`, stream-setup-m1.sql), a
 * stream run (test or real), and a Discord server.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export interface SetupStep { id: "twitch" | "overlay" | "bot" | "stream" | "discord"; label: string; href: string; done: boolean }

export async function streamSetup(userId: string): Promise<SetupStep[]> {
  const db = createServiceClient();
  const [conn, chatSub, streamed, guild] = await Promise.all([
    db.from("twitch_connections").select("*").eq("user_id", userId).maybeSingle().then((r) => r.data as { broadcaster_id?: string | null; bot_authorized?: boolean | null; overlay_seen_at?: string | null } | null),
    db.from("twitch_eventsub_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "channel.chat.message").eq("status", "enabled").then((r) => (r.error ? 0 : r.count ?? 0)),
    db.from("gs_sessions").select("id", { count: "exact", head: true }).eq("owner_user_id", userId).not("activated_at", "is", null).then((r) => r.count ?? 0),
    db.from("discord_guilds").select("guild_id", { count: "exact", head: true }).eq("owner_user_id", userId).is("removed_at", null).then((r) => r.count ?? 0),
  ]);
  return [
    { id: "twitch", label: "Connect Twitch", href: "/hub/setup?step=twitch", done: !!conn },
    { id: "bot", label: "The bot replies in your chat", href: "/hub/setup?step=bot", done: !!conn?.bot_authorized && chatSub > 0 },
    { id: "overlay", label: "Add the overlay to OBS", href: "/hub/setup?step=overlay", done: !!conn?.overlay_seen_at },
    { id: "stream", label: "Run a test stream", href: "/hub/setup?step=stream", done: streamed > 0 },
    { id: "discord", label: "Add a Discord bot", href: "/hub/setup?step=discord", done: guild > 0 },
  ];
}

const seen = new Map<string, number>();
/** The overlay loaded: remember it (once every ten minutes per instance; a missing column is ignored). */
export function noteOverlaySeen(token: string): void {
  const now = Date.now();
  if ((seen.get(token) ?? 0) > now - 10 * 60_000) return;
  seen.set(token, now);
  if (seen.size > 5000) seen.clear();
  void createServiceClient().from("twitch_connections").update({ overlay_seen_at: new Date(now).toISOString() }).eq("overlay_token", token)
    .then(({ error }) => { if (error && !/overlay_seen_at/.test(error.message)) console.warn("[stream-setup] overlay seen:", error.message); });
}
