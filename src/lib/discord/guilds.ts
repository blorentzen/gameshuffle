/**
 * The Discord servers an account has the bot in (discord_guilds, from
 * supabase/discord-multi-server-m1.sql). Decided 2026-10-07:
 *
 *   * one account per server (the server id is the key)
 *   * free accounts connect 1 server, GS Pro up to 5 (DISCORD_SERVER_LIMITS)
 *   * the main server (the first connected; the streamer can change it) keeps
 *     working if Pro ends; the others pause: they stay connected with their
 *     settings, nothing posts there, and they resume when Pro comes back
 *   * a server the bot was removed from (removed_at, set by the worker) is
 *     shown as removed and frees its slot once forgotten
 *
 * Per-server settings live on the row (default channel, ping role, event
 * posts and pings, QOTD hour, Pro role, logging). users.discord_guild_id keeps
 * mirroring the main server for one release.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { DISCORD_SERVER_LIMITS } from "@/lib/subscription";

export type DiscordEventFlags = Record<string, boolean>;

export interface DiscordGuild {
  guildId: string;
  ownerUserId: string;
  name: string | null;
  isMain: boolean;
  connectedAt: string;
  removedAt: string | null;
  defaultChannelId: string | null;
  notifyRoleId: string | null;
  eventSubscriptions: DiscordEventFlags;
  eventPings: DiscordEventFlags;
  qotdHour: number | null;
  proRoleId: string | null;
  logChannelId: string | null;
  logEvents: Record<string, boolean> | null;
}

type GuildRow = {
  guild_id: string; owner_user_id: string; guild_name: string | null; is_main: boolean; connected_at: string; removed_at: string | null;
  default_channel_id: string | null; notify_role_id: string | null; event_subscriptions: DiscordEventFlags | null; event_pings: DiscordEventFlags | null;
  qotd_hour: number | null; pro_role_id: string | null; log_channel_id: string | null; log_events: Record<string, boolean> | null;
};

const COLS = "guild_id, owner_user_id, guild_name, is_main, connected_at, removed_at, default_channel_id, notify_role_id, event_subscriptions, event_pings, qotd_hour, pro_role_id, log_channel_id, log_events";

function toGuild(r: GuildRow): DiscordGuild {
  return {
    guildId: r.guild_id, ownerUserId: r.owner_user_id, name: r.guild_name, isMain: r.is_main, connectedAt: r.connected_at, removedAt: r.removed_at,
    defaultChannelId: r.default_channel_id, notifyRoleId: r.notify_role_id,
    eventSubscriptions: r.event_subscriptions ?? {}, eventPings: r.event_pings ?? {},
    qotdHour: r.qotd_hour, proRoleId: r.pro_role_id, logChannelId: r.log_channel_id, logEvents: r.log_events,
  };
}

/** Settings a caller may change, in DiscordGuild's names. */
export type GuildSettings = Partial<Pick<DiscordGuild, "defaultChannelId" | "notifyRoleId" | "eventSubscriptions" | "eventPings" | "qotdHour" | "proRoleId" | "logChannelId" | "logEvents" | "name">>;

const SETTING_COLUMNS: Record<keyof GuildSettings, string> = {
  defaultChannelId: "default_channel_id", notifyRoleId: "notify_role_id", eventSubscriptions: "event_subscriptions", eventPings: "event_pings",
  qotdHour: "qotd_hour", proRoleId: "pro_role_id", logChannelId: "log_channel_id", logEvents: "log_events", name: "guild_name",
};

// ─── reads ───────────────────────────────────────────────────────────────────

/** Every server the account has connected, main first, then oldest first. */
export async function listGuilds(ownerUserId: string): Promise<DiscordGuild[]> {
  const { data, error } = await createServiceClient().from("discord_guilds").select(COLS).eq("owner_user_id", ownerUserId)
    .order("is_main", { ascending: false }).order("connected_at", { ascending: true });
  if (error) {
    console.error("[discord/guilds] list failed:", error);
    return [];
  }
  return ((data ?? []) as GuildRow[]).map(toGuild);
}

/** The server's row, whoever owns it. */
export async function getGuild(guildId: string | null | undefined): Promise<DiscordGuild | null> {
  if (!guildId) return null;
  const { data } = await createServiceClient().from("discord_guilds").select(COLS).eq("guild_id", guildId).maybeSingle();
  return data ? toGuild(data as GuildRow) : null;
}

/**
 * Is this server live for posting and Pro tools right now? Removed servers
 * never are; with Pro every connected server is; without it only the main one.
 */
export function guildIsActive(guild: DiscordGuild, ownerIsPro: boolean): boolean {
  if (guild.removedAt) return false;
  return ownerIsPro || guild.isMain;
}

/** The servers that post: connected, and within the plan (all with Pro, the main one without). */
export async function activeGuilds(ownerUserId: string, opts: { isPro?: boolean } = {}): Promise<DiscordGuild[]> {
  const all = await listGuilds(ownerUserId);
  if (all.length === 0) return [];
  const pro = opts.isPro ?? (await isProUser(ownerUserId));
  return all.filter((g) => guildIsActive(g, pro));
}

/**
 * The server a dashboard request is about: the one asked for if this account
 * owns it, else the main server, else the first. Null when none is connected.
 */
export async function pickGuild(ownerUserId: string, requested?: string | null): Promise<DiscordGuild | null> {
  const all = await listGuilds(ownerUserId);
  if (requested) {
    const hit = all.find((g) => g.guildId === requested);
    if (hit) return hit;
  }
  return all.find((g) => g.isMain && !g.removedAt) ?? all.find((g) => !g.removedAt) ?? all[0] ?? null;
}

/** For bot interactions in a server: who owns it, whether they're Pro, and whether the server is live. */
export async function guildContext(guildId: string | null | undefined): Promise<{ guild: DiscordGuild; ownerId: string; isPro: boolean; active: boolean } | null> {
  const guild = await getGuild(guildId);
  if (!guild) return null;
  const isPro = await isProUser(guild.ownerUserId);
  return { guild, ownerId: guild.ownerUserId, isPro, active: guildIsActive(guild, isPro) };
}

export function serverLimit(isPro: boolean): number {
  return isPro ? DISCORD_SERVER_LIMITS.pro : DISCORD_SERVER_LIMITS.free;
}

// ─── writes ──────────────────────────────────────────────────────────────────

/** users.discord_guild_id/name mirror the main server for one release (older readers). */
async function mirrorMain(ownerUserId: string): Promise<void> {
  const svc = createServiceClient();
  const { data } = await svc.from("discord_guilds").select("guild_id, guild_name").eq("owner_user_id", ownerUserId).eq("is_main", true).maybeSingle();
  const main = data as { guild_id: string; guild_name: string | null } | null;
  await svc.from("users").update({ discord_guild_id: main?.guild_id ?? null, discord_guild_name: main?.guild_name ?? null }).eq("id", ownerUserId);
}

export type AddGuildResult =
  | { ok: true; guild: DiscordGuild; added: boolean }
  | { ok: false; error: "server_already_linked" | "server_limit" | "failed"; limit?: number };

/**
 * The bot was installed into a server (install callback). Reconnecting a
 * server this account already has just refreshes it; a new one counts toward
 * the plan's limit. The first server becomes the main one.
 */
export async function addGuild(ownerUserId: string, guildId: string, name: string | null): Promise<AddGuildResult> {
  const svc = createServiceClient();
  const existing = await getGuild(guildId);
  if (existing && existing.ownerUserId !== ownerUserId) return { ok: false, error: "server_already_linked" };

  if (existing) {
    const { data, error } = await svc.from("discord_guilds").update({ guild_name: name ?? existing.name, removed_at: null, updated_at: new Date().toISOString() })
      .eq("guild_id", guildId).select(COLS).single();
    if (error || !data) return { ok: false, error: "failed" };
    await mirrorMain(ownerUserId);
    return { ok: true, guild: toGuild(data as GuildRow), added: false };
  }

  const all = await listGuilds(ownerUserId);
  const connected = all.filter((g) => !g.removedAt);
  const limit = serverLimit(await isProUser(ownerUserId));
  if (connected.length >= limit) return { ok: false, error: "server_limit", limit };

  const isMain = !all.some((g) => g.isMain);
  const { data, error } = await svc.from("discord_guilds").insert({ guild_id: guildId, owner_user_id: ownerUserId, guild_name: name, is_main: isMain })
    .select(COLS).single();
  if (error?.code === "23505") return { ok: false, error: "server_already_linked" };
  if (error || !data) {
    console.error("[discord/guilds] add failed:", error);
    return { ok: false, error: "failed" };
  }
  await mirrorMain(ownerUserId);
  return { ok: true, guild: toGuild(data as GuildRow), added: true };
}

export async function updateGuild(ownerUserId: string, guildId: string, patch: GuildSettings): Promise<boolean> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch) as [keyof GuildSettings, unknown][]) {
    if (v !== undefined) row[SETTING_COLUMNS[k]] = v;
  }
  const { error } = await createServiceClient().from("discord_guilds").update(row).eq("guild_id", guildId).eq("owner_user_id", ownerUserId);
  if (error) console.error("[discord/guilds] update failed:", error);
  return !error;
}

/** Make this server the main one (the one that keeps working without Pro). */
export async function setMainGuild(ownerUserId: string, guildId: string): Promise<boolean> {
  const svc = createServiceClient();
  const target = await getGuild(guildId);
  if (!target || target.ownerUserId !== ownerUserId) return false;
  await svc.from("discord_guilds").update({ is_main: false }).eq("owner_user_id", ownerUserId).eq("is_main", true);
  const { error } = await svc.from("discord_guilds").update({ is_main: true }).eq("guild_id", guildId).eq("owner_user_id", ownerUserId);
  await mirrorMain(ownerUserId);
  return !error;
}

/**
 * Forget a server: its row, its channel routes and its AutoMod record go
 * (the bot itself is removed from the server in Discord). If it was the main
 * server, the oldest remaining one takes over.
 */
export async function removeGuild(ownerUserId: string, guildId: string): Promise<boolean> {
  const svc = createServiceClient();
  const target = await getGuild(guildId);
  if (!target || target.ownerUserId !== ownerUserId) return false;
  await Promise.all([
    svc.from("discord_channel_routes").delete().eq("guild_id", guildId),
    svc.from("discord_automod").delete().eq("guild_id", guildId),
    svc.from("discord_scheduled_posts").delete().eq("guild_id", guildId).eq("status", "pending"),
  ]);
  const { error } = await svc.from("discord_guilds").delete().eq("guild_id", guildId).eq("owner_user_id", ownerUserId);
  if (error) return false;
  if (target.isMain) {
    const rest = await listGuilds(ownerUserId);
    const next = rest.find((g) => !g.removedAt) ?? rest[0];
    if (next) await svc.from("discord_guilds").update({ is_main: true }).eq("guild_id", next.guildId);
  }
  await mirrorMain(ownerUserId);
  return true;
}

/**
 * Account deletion: remove the AutoMod rules GameShuffle created in each of
 * the account's servers and take the bot out of them, so nothing keeps
 * running for an account that's gone. Best-effort; the rows go with the
 * account (on delete cascade).
 */
export async function teardownDiscordServers(ownerUserId: string): Promise<void> {
  const { deleteAutoModRule, leaveGuild } = await import("@/lib/adapters/discord/adapter");
  const svc = createServiceClient();
  const { data: rules } = await svc.from("discord_automod").select("guild_id, keyword_rule_id, preset_rule_id").eq("user_id", ownerUserId);
  for (const r of (rules ?? []) as { guild_id: string; keyword_rule_id: string | null; preset_rule_id: string | null }[]) {
    for (const id of [r.keyword_rule_id, r.preset_rule_id]) if (id) await deleteAutoModRule(r.guild_id, id).catch(() => false);
  }
  for (const g of await listGuilds(ownerUserId)) {
    if (!g.removedAt) await leaveGuild(g.guildId).catch(() => false);
  }
}
