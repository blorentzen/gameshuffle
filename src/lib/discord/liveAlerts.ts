/**
 * Discord go-live alerts (GS Pro): a streamer picks creators (someone they
 * follow on GameShuffle, or any Twitch channel) for each of their servers, up
 * to 25 per server; when one goes live the bot posts in that server's alert
 * channel, with an optional role ping. Schema: supabase/discord-live-alerts-m1.sql.
 *
 * Twitch lets the app token subscribe to stream.online for any broadcaster, so
 * creators don't need GameShuffle. Connected streamers already have that
 * subscription; anyone else gets one row in twitch_watched_channels, removed
 * when the last alert for them goes. One post per stream per server
 * (last_stream_id). Service role only.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAppAccessToken, getStreamsByUserIds, getUserByLogin, type HelixStream } from "@/lib/twitch/client";
import { unwatchStreamOnline, watchStreamOnline } from "@/lib/twitch/eventsub";
import { postEmbed } from "@/lib/adapters/discord/adapter";
import { isProUser } from "@/lib/subscription-server";
import { isBlockedText } from "@/lib/text/filter";

export const LIVE_ALERT_LIMIT = 25;
const TWITCH_PURPLE = 0x9146ff;
/** The words a custom message can use. */
export const ALERT_WORDS = ["{name}", "{game}", "{title}", "{link}"] as const;

export interface LiveAlert {
  id: string;
  broadcasterId: string;
  login: string;
  name: string;
  gsUserId: string | null;
  gsUsername: string | null;
  message: string | null;
  enabled: boolean;
  lastPostedAt: string | null;
}

export interface AlertRouting { channelId: string | null; roleId: string | null }

type AlertRow = {
  id: string; broadcaster_id: string; broadcaster_login: string; broadcaster_name: string | null;
  gs_user_id: string | null; message: string | null; enabled: boolean; last_posted_at: string | null;
};

const COLS = "id, broadcaster_id, broadcaster_login, broadcaster_name, gs_user_id, message, enabled, last_posted_at";

export async function listAlerts(guildId: string): Promise<LiveAlert[]> {
  const admin = createServiceClient();
  const { data } = await admin.from("discord_live_alerts").select(COLS).eq("guild_id", guildId).order("created_at", { ascending: true });
  const rows = (data as AlertRow[] | null) ?? [];
  const gsIds = rows.map((r) => r.gs_user_id).filter((x): x is string => !!x);
  const names = new Map<string, string>();
  if (gsIds.length) {
    const { data: users } = await admin.from("users").select("id, username").in("id", gsIds);
    for (const u of (users as { id: string; username: string | null }[] | null) ?? []) if (u.username) names.set(u.id, u.username);
  }
  return rows.map((r) => ({
    id: r.id, broadcasterId: r.broadcaster_id, login: r.broadcaster_login, name: r.broadcaster_name ?? r.broadcaster_login,
    gsUserId: r.gs_user_id, gsUsername: r.gs_user_id ? names.get(r.gs_user_id) ?? null : null,
    message: r.message, enabled: r.enabled, lastPostedAt: r.last_posted_at,
  }));
}

export async function getRouting(guildId: string): Promise<AlertRouting> {
  const { data } = await createServiceClient().from("discord_guilds").select("live_alert_channel_id, live_alert_role_id").eq("guild_id", guildId).maybeSingle();
  const r = data as { live_alert_channel_id: string | null; live_alert_role_id: string | null } | null;
  return { channelId: r?.live_alert_channel_id ?? null, roleId: r?.live_alert_role_id ?? null };
}

export async function setRouting(ownerId: string, guildId: string, routing: AlertRouting): Promise<boolean> {
  const { error } = await createServiceClient().from("discord_guilds")
    .update({ live_alert_channel_id: routing.channelId, live_alert_role_id: routing.roleId })
    .eq("guild_id", guildId).eq("owner_user_id", ownerId);
  return !error;
}

/** People this account follows on GameShuffle who have Twitch linked (the "someone you follow" list). */
export async function followedCreators(ownerId: string): Promise<{ userId: string; username: string | null; name: string; twitchLogin: string }[]> {
  const admin = createServiceClient();
  const { data: follows } = await admin.from("follows").select("followee_id").eq("follower_id", ownerId).limit(500);
  const ids = ((follows as { followee_id: string }[] | null) ?? []).map((f) => f.followee_id).filter((id) => id !== ownerId);
  if (!ids.length) return [];
  const { data } = await admin.from("users").select("id, username, display_name, twitch_id, twitch_username").in("id", ids).not("twitch_id", "is", null);
  return ((data as { id: string; username: string | null; display_name: string | null; twitch_id: string; twitch_username: string | null }[] | null) ?? [])
    .filter((u) => u.twitch_username)
    .map((u) => ({ userId: u.id, username: u.username, name: u.display_name || u.twitch_username!, twitchLogin: u.twitch_username! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "twitch.tv/Kart_Queen", "@kart_queen" or "kart_queen" → "kart_queen" (null if it can't be a Twitch name). */
export function twitchLoginFrom(input: string): string | null {
  const s = input.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?twitch\.tv\//i, "").replace(/^@/, "").split(/[/?#\s]/)[0].toLowerCase();
  return /^[a-z0-9_]{3,25}$/.test(s) ? s : null;
}

export type AddResult = { ok: true; alert: LiveAlert } | { ok: false; error: "limit" | "not_found" | "no_twitch" | "not_following" | "exists" | "bad_name" | "failed" };

/** Adds a creator to a server's alerts and makes sure we hear when they go live. */
export async function addAlert(args: { ownerId: string; guildId: string; login?: string; gsUserId?: string }): Promise<AddResult> {
  const admin = createServiceClient();
  const { count } = await admin.from("discord_live_alerts").select("id", { count: "exact", head: true }).eq("guild_id", args.guildId);
  if ((count ?? 0) >= LIVE_ALERT_LIMIT) return { ok: false, error: "limit" };

  let broadcaster: { id: string; login: string; name: string } | null = null;
  let gsUserId: string | null = null;
  if (args.gsUserId) {
    const { data: f } = await admin.from("follows").select("followee_id").eq("follower_id", args.ownerId).eq("followee_id", args.gsUserId).maybeSingle();
    if (!f) return { ok: false, error: "not_following" };
    const { data: u } = await admin.from("users").select("id, display_name, twitch_id, twitch_username").eq("id", args.gsUserId).maybeSingle();
    const user = u as { id: string; display_name: string | null; twitch_id: string | null; twitch_username: string | null } | null;
    if (!user?.twitch_id || !user.twitch_username) return { ok: false, error: "no_twitch" };
    broadcaster = { id: user.twitch_id, login: user.twitch_username.toLowerCase(), name: user.display_name || user.twitch_username };
    gsUserId = user.id;
  } else {
    const login = twitchLoginFrom(args.login ?? "");
    if (!login) return { ok: false, error: "bad_name" };
    try {
      const u = await getUserByLogin(login, await getAppAccessToken());
      if (!u) return { ok: false, error: "not_found" };
      broadcaster = { id: u.id, login: u.login, name: u.display_name || u.login };
    } catch (err) {
      console.error("[live-alerts] Twitch lookup failed:", err);
      return { ok: false, error: "failed" };
    }
    // A GameShuffle account with this Twitch linked shows its handle in the list.
    const { data: linked } = await admin.from("users").select("id").eq("twitch_id", broadcaster.id).maybeSingle();
    gsUserId = (linked as { id: string } | null)?.id ?? null;
  }

  const { data, error } = await admin.from("discord_live_alerts").insert({
    guild_id: args.guildId, owner_user_id: args.ownerId, broadcaster_id: broadcaster.id,
    broadcaster_login: broadcaster.login, broadcaster_name: broadcaster.name, gs_user_id: gsUserId,
  }).select(COLS).single();
  if (error) return { ok: false, error: error.code === "23505" ? "exists" : "failed" };
  await ensureWatched(broadcaster.id, broadcaster.login);
  const alert = (await listAlerts(args.guildId)).find((a) => a.id === (data as AlertRow).id);
  return alert ? { ok: true, alert } : { ok: false, error: "failed" };
}

export type UpdateResult = { ok: true } | { ok: false; error: "too_long" | "blocked" | "failed" };

export async function updateAlert(guildId: string, id: string, patch: { message?: string | null; enabled?: boolean }): Promise<UpdateResult> {
  const row: Record<string, unknown> = {};
  if (patch.message !== undefined) {
    const msg = patch.message?.replace(/\s+/g, " ").trim() || null;
    if (msg && msg.length > 300) return { ok: false, error: "too_long" };
    if (msg && isBlockedText(msg)) return { ok: false, error: "blocked" };
    row.message = msg;
  }
  if (typeof patch.enabled === "boolean") row.enabled = patch.enabled;
  const { error } = await createServiceClient().from("discord_live_alerts").update(row).eq("guild_id", guildId).eq("id", id);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export async function removeAlert(guildId: string, id: string): Promise<boolean> {
  const { data } = await createServiceClient().from("discord_live_alerts").delete().eq("guild_id", guildId).eq("id", id).select("broadcaster_id").maybeSingle();
  const broadcasterId = (data as { broadcaster_id: string } | null)?.broadcaster_id;
  if (!broadcasterId) return false;
  await maybeUnwatch(broadcasterId);
  return true;
}

/** Subscribe to stream.online for a creator unless something already does. */
async function ensureWatched(broadcasterId: string, login: string): Promise<void> {
  const admin = createServiceClient();
  const { data: conn } = await admin.from("twitch_connections").select("user_id").eq("twitch_user_id", broadcasterId).maybeSingle();
  if (conn) return; // a connected streamer's own subscriptions include stream.online
  const { data: have } = await admin.from("twitch_watched_channels").select("twitch_subscription_id, status").eq("broadcaster_id", broadcasterId).maybeSingle();
  const row = have as { twitch_subscription_id: string | null; status: string | null } | null;
  if (row && (row.twitch_subscription_id || row.status === "exists") && !["failed", "authorization_revoked", "user_removed", "notification_failures_exceeded"].includes(row.status ?? "")) return;
  const sub = await watchStreamOnline(broadcasterId);
  await admin.from("twitch_watched_channels").upsert({
    broadcaster_id: broadcasterId, broadcaster_login: login, twitch_subscription_id: sub.id, status: sub.status, updated_at: new Date().toISOString(),
  }, { onConflict: "broadcaster_id" });
}

/** Drop our alerts-only subscription once no server wants this creator. */
async function maybeUnwatch(broadcasterId: string): Promise<void> {
  const admin = createServiceClient();
  const { count } = await admin.from("discord_live_alerts").select("id", { count: "exact", head: true }).eq("broadcaster_id", broadcasterId);
  if ((count ?? 0) > 0) return;
  const { data } = await admin.from("twitch_watched_channels").select("twitch_subscription_id").eq("broadcaster_id", broadcasterId).maybeSingle();
  const subId = (data as { twitch_subscription_id: string | null } | null)?.twitch_subscription_id;
  if (subId) await unwatchStreamOnline(subId);
  await admin.from("twitch_watched_channels").delete().eq("broadcaster_id", broadcasterId);
}

/** The post text: the streamer's message with its words filled in, else ours. */
export function alertText(message: string | null, v: { name: string; game: string | null; title: string | null; link: string }): string {
  if (!message) return `**${v.name}** is live${v.game ? ` with ${v.game}` : ""}! ${v.link}`;
  const text = message
    .replaceAll("{name}", v.name).replaceAll("{game}", v.game ?? "something fun")
    .replaceAll("{title}", v.title ?? "").replaceAll("{link}", v.link);
  return message.includes("{link}") ? text : `${text} ${v.link}`;
}

interface OnlineEvent { id?: string; broadcaster_user_id: string; broadcaster_user_login?: string; broadcaster_user_name?: string; started_at?: string }

/**
 * Called from the stream.online webhook for every broadcaster (connected or
 * not). Posts once per stream to each server with an enabled alert, while
 * the server is active and its owner has GS Pro.
 */
export async function postLiveAlerts(event: OnlineEvent): Promise<void> {
  const admin = createServiceClient();
  const { data } = await admin.from("discord_live_alerts")
    .select("id, guild_id, owner_user_id, broadcaster_login, broadcaster_name, message")
    .eq("broadcaster_id", event.broadcaster_user_id).eq("enabled", true);
  const alerts = (data as { id: string; guild_id: string; owner_user_id: string; broadcaster_login: string; broadcaster_name: string | null; message: string | null }[] | null) ?? [];
  if (!alerts.length) return;

  let stream: HelixStream | null = null;
  try {
    stream = (await getStreamsByUserIds([event.broadcaster_user_id]))[0] ?? null;
  } catch (err) {
    console.warn("[live-alerts] stream lookup failed:", err);
  }
  const streamId = event.id ?? stream?.id ?? `${event.broadcaster_user_id}:${event.started_at ?? new Date().toISOString().slice(0, 13)}`;
  const proCache = new Map<string, boolean>();

  for (const a of alerts) {
    try {
      const { data: g } = await admin.from("discord_guilds")
        .select("live_alert_channel_id, live_alert_role_id, is_main, removed_at").eq("guild_id", a.guild_id).maybeSingle();
      const guild = g as { live_alert_channel_id: string | null; live_alert_role_id: string | null; is_main: boolean; removed_at: string | null } | null;
      if (!guild?.live_alert_channel_id || guild.removed_at) continue;
      if (!proCache.has(a.owner_user_id)) proCache.set(a.owner_user_id, await isProUser(a.owner_user_id));
      if (!proCache.get(a.owner_user_id)) continue; // alerts are GS Pro (a paused server is only ever one without it)

      // One post per stream per server, however often Twitch retries.
      const { data: claimed } = await admin.from("discord_live_alerts")
        .update({ last_stream_id: streamId, last_posted_at: new Date().toISOString() })
        .eq("id", a.id).or(`last_stream_id.is.null,last_stream_id.neq.${streamId}`).select("id").maybeSingle();
      if (!claimed) continue;

      const login = stream?.user_login ?? event.broadcaster_user_login ?? a.broadcaster_login;
      const name = stream?.user_name ?? event.broadcaster_user_name ?? a.broadcaster_name ?? login;
      const link = `https://twitch.tv/${login}`;
      const text = alertText(a.message, { name, game: stream?.game_name ?? null, title: stream?.title ?? null, link });
      const ping = guild.live_alert_role_id ? `<@&${guild.live_alert_role_id}> ` : "";
      const res = await postEmbed({
        channelId: guild.live_alert_channel_id,
        content: `${ping}${text}`,
        allowedMentions: guild.live_alert_role_id ? { roles: [guild.live_alert_role_id] } : { parse: [] },
        embed: {
          author: { name: `${name} is live on Twitch`, url: link },
          title: stream?.title || `${name} is live`,
          url: link,
          description: stream?.game_name ? `Playing **${stream.game_name}**` : undefined,
          color: TWITCH_PURPLE,
          ...(stream?.thumbnail_url ? { image: { url: `${stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720")}?t=${Date.now()}` } } : {}),
          footer: { text: "Go-live alert from GameShuffle" },
          timestamp: event.started_at ?? new Date().toISOString(),
        },
      });
      if (!res.ok) console.warn(`[live-alerts] post failed for guild ${a.guild_id}:`, res.error);
    } catch (err) {
      console.error("[live-alerts] alert failed:", err);
    }
  }
}
