/**
 * The servers an account has one of our other Discord apps in (discord_app_guilds, supabase/discord-apps-m1.sql;
 * picks 2026-10-30). The main app keeps discord_guilds (guilds.ts). One account per app and server, a server can
 * have both apps, and the plan's server limit counts per app (free 1, GS Pro 5).
 * Settings per server live in `settings` (comp: the channels its posts go to).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { serverLimit } from "./guilds";
import type { DiscordAppId } from "./appIds";

export type OtherApp = Exclude<DiscordAppId, "main">;

export interface AppGuild {
  app: OtherApp;
  guildId: string;
  ownerUserId: string;
  name: string | null;
  connectedAt: string;
  removedAt: string | null;
  settings: Record<string, unknown>;
}

type Row = { app: OtherApp; guild_id: string; owner_user_id: string; guild_name: string | null; connected_at: string; removed_at: string | null; settings: Record<string, unknown> | null };
const COLS = "app, guild_id, owner_user_id, guild_name, connected_at, removed_at, settings";
const toGuild = (r: Row): AppGuild => ({ app: r.app, guildId: r.guild_id, ownerUserId: r.owner_user_id, name: r.guild_name, connectedAt: r.connected_at, removedAt: r.removed_at, settings: r.settings ?? {} });

/** Whether the table exists (before the migration runs, every read is empty and adding says so). */
let ready: boolean | null = null;
export async function appGuildsReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("discord_app_guilds").select("guild_id", { head: true, count: "exact" }).limit(1);
  ready = !error;
  return ready;
}

/** The account's servers for an app, oldest first. */
export async function listAppGuilds(ownerUserId: string, app: OtherApp): Promise<AppGuild[]> {
  const { data, error } = await createServiceClient().from("discord_app_guilds").select(COLS).eq("owner_user_id", ownerUserId).eq("app", app).order("connected_at");
  if (error) return [];
  return ((data ?? []) as Row[]).map(toGuild);
}

/** One server's row for an app (any owner). */
export async function getAppGuild(app: OtherApp, guildId: string): Promise<AppGuild | null> {
  const { data } = await createServiceClient().from("discord_app_guilds").select(COLS).eq("app", app).eq("guild_id", guildId).maybeSingle();
  return data ? toGuild(data as Row) : null;
}

export type AddAppGuildResult = { ok: true; added: boolean; guild: AppGuild } | { ok: false; error: "server_taken" | "server_limit" | "not_ready" };

/** Adds a server for an app: another account's server is refused, a new one past the plan's limit too; adding again refreshes it. */
export async function addAppGuild(ownerUserId: string, app: OtherApp, guildId: string, name: string | null): Promise<AddAppGuildResult> {
  if (!(await appGuildsReady())) return { ok: false, error: "not_ready" };
  const db = createServiceClient();
  const existing = await getAppGuild(app, guildId);
  if (existing && existing.ownerUserId !== ownerUserId) return { ok: false, error: "server_taken" };
  if (existing) {
    const { data } = await db.from("discord_app_guilds").update({ guild_name: name ?? existing.name, removed_at: null }).eq("app", app).eq("guild_id", guildId).select(COLS).single();
    return { ok: true, added: false, guild: toGuild(data as Row) };
  }
  const [mine, pro] = await Promise.all([listAppGuilds(ownerUserId, app), isProUser(ownerUserId)]);
  if (mine.filter((g) => !g.removedAt).length >= serverLimit(pro)) return { ok: false, error: "server_limit" };
  const { data, error } = await db.from("discord_app_guilds").insert({ app, guild_id: guildId, owner_user_id: ownerUserId, guild_name: name }).select(COLS).single();
  if (error) return error.code === "23505" ? { ok: false, error: "server_taken" } : { ok: false, error: "not_ready" };
  return { ok: true, added: true, guild: toGuild(data as Row) };
}

/** Merges settings into the account's server row; false when it isn't theirs. */
export async function updateAppGuildSettings(ownerUserId: string, app: OtherApp, guildId: string, patch: Record<string, unknown>): Promise<boolean> {
  const g = await getAppGuild(app, guildId);
  if (!g || g.ownerUserId !== ownerUserId) return false;
  const { error } = await createServiceClient().from("discord_app_guilds").update({ settings: { ...g.settings, ...patch } }).eq("app", app).eq("guild_id", guildId);
  return !error;
}

/** Forgets a server for an app (the bot stays until someone removes it in Discord). */
export async function removeAppGuild(ownerUserId: string, app: OtherApp, guildId: string): Promise<boolean> {
  const { error, count } = await createServiceClient().from("discord_app_guilds").delete({ count: "exact" }).eq("app", app).eq("guild_id", guildId).eq("owner_user_id", ownerUserId);
  return !error && (count ?? 0) > 0;
}
