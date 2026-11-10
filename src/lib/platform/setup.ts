/**
 * Platform admin ▸ Overview ▸ Setup: how many accounts have each tool connected, whether it still works, and who to
 * reach out to when it broke. Service role, staff only (GET /api/admin/setup).
 *
 * Every "working" rule is the one the streamer's own screens already use, so staff and the streamer see the same
 * thing:
 *   - the bot can post in chat = `bot_authorized` and the chat subscription enabled (Streaming setup's "bot" step,
 *     src/lib/streaming/setup.ts)
 *   - events coming in = all four core EventSub subscriptions enabled (Setup ▸ Twitch's EventSub health,
 *     TwitchHubTab `EXPECTED_SUB_TYPES`, and the hub's setup banner)
 *   - the overlay is in OBS = `overlay_seen_at` (the overlay loaded at least once)
 *   - went live = live now, or a stream opened on their channel in the last 30 days (stream.online opens a
 *     `gs_streams` row for every connected streamer, whatever the game; `live_started_at` clears at offline, so it
 *     can't answer "in the last 30 days")
 *
 * Discord posting isn't counted: most of the bot's posts (go-live, rounds, recaps, game nights, trivia, reminders,
 * announcements) leave no record per server, so "posted lately" would undercount. Backup passwords and two-factor
 * live on auth.users, which can only be read by listing every sign-in account, so they're left out too.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { gsDay } from "@/lib/time/gsClock";

const DAY = 86_400_000;

/** The four subscriptions every Twitch connection needs (TwitchHubTab's EXPECTED_SUB_TYPES). */
const CORE_EVENTS = ["channel.update", "stream.online", "stream.offline", "channel.chat.message"] as const;
const CHAT_EVENT = "channel.chat.message";
/** A subscription Twitch is still verifying isn't broken yet; give it an hour. */
const PENDING_GRACE_MS = 60 * 60_000;

export interface SetupProblem {
  /** The account's id (a stable key; Discord rows add the server). */
  key: string;
  name: string;
  /** Their public profile, when it's public. */
  href: string | null;
  /** "@login on Twitch" or the server's name. */
  detail: string | null;
  /** Plain words, worst first. */
  reasons: string[];
}

export interface SetupSummary {
  accounts: number;
  twitch: {
    connected: number;
    connectedWeek: number;
    /** Bot allowed in chat and the chat subscription on. */
    bot: number;
    /** All four core subscriptions on. */
    events: number;
    overlay: number;
    liveMonth: number;
    /** Bot allowed and all four subscriptions on. */
    working: number;
    channelPoints: number;
    chatFeed: number;
    withMods: number;
    youtube: number;
    problems: SetupProblem[];
  };
  discord: {
    servers: number;
    owners: number;
    serversWeek: number;
    withChannel: number;
    liveAlerts: number;
    qotd: number;
    logs: number;
    loungeRoles: number;
    removedMonth: number;
    problems: SetupProblem[];
  };
  people: {
    twitchSignIn: number;
    discordSignIn: number;
    mmrCards: number;
    loungeConfirmed: number;
  };
  generatedAt: string;
}

type Db = ReturnType<typeof createServiceClient>;

interface ConnRow {
  user_id: string;
  twitch_user_id: string | null;
  twitch_login: string | null;
  twitch_display_name: string | null;
  bot_authorized: boolean | null;
  overlay_seen_at?: string | null;
  is_live: boolean | null;
  channel_points_enabled: boolean | null;
  chat_overlay_enabled?: boolean | null;
  connected_at: string | null;
}

interface SubRow { user_id: string; type: string; status: string | null; created_at: string | null }

interface GuildRow {
  guild_id: string;
  owner_user_id: string;
  guild_name: string | null;
  connected_at: string | null;
  removed_at: string | null;
  default_channel_id: string | null;
  live_alert_channel_id: string | null;
  event_subscriptions: Record<string, boolean> | null;
  log_channel_id: string | null;
  lounge_roles_game: string | null;
}

interface UserRow { id: string; username: string | null; display_name: string | null; is_public: boolean | null }

/** A head count; a missing table or column counts as 0 rather than failing the screen. */
async function headCount(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

/** Every row of a read, or none when the table isn't there yet. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await readAllPages<T>(page);
  if (error) console.warn("[admin/setup] read failed:", error.message);
  return data;
}

function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const recent = (iso: string | null | undefined, since: number) => !!iso && Date.parse(iso) >= since;

async function twitchConnections(db: Db): Promise<ConnRow[]> {
  const base = "user_id, twitch_user_id, twitch_login, twitch_display_name, bot_authorized, is_live, channel_points_enabled, connected_at";
  const full = await readAllPages<ConnRow>((from, to) =>
    db.from("twitch_connections").select(`${base}, overlay_seen_at, chat_overlay_enabled`).order("user_id").range(from, to) as unknown as PromiseLike<{ data: ConnRow[] | null; error: { message: string } | null }>);
  if (!full.error) return full.data;
  // Before stream-setup-m1.sql: the overlay and chat feed columns aren't there yet.
  return allRows<ConnRow>((from, to) =>
    db.from("twitch_connections").select(base).order("user_id").range(from, to) as unknown as PromiseLike<{ data: ConnRow[] | null; error: { message: string } | null }>);
}

/**
 * Accounts with a stream opened on their channel since `since`. stream.online opens the stream on the streamer's
 * community (src/lib/economy/twitchBootstrap.ts); a community belongs to an account by its owner, its owner's
 * linked identity, the Twitch identity that opened it, or its slug (the streamer's username).
 */
async function wentLiveSince(db: Db, since: number, conns: ConnRow[], usernames: Map<string, string>): Promise<Set<string>> {
  type StreamRow = {
    community_id: string;
    gs_communities: { slug: string | null; owner_user_id: string | null; gs_identities: { platform: string | null; platform_id: string | null; gs_account_id: string | null } | null } | null;
  };
  const rows = await allRows<StreamRow>((from, to) =>
    db.from("gs_streams")
      .select("community_id, gs_communities(slug, owner_user_id, gs_identities!owner_identity_id(platform, platform_id, gs_account_id))")
      .gte("started_at", new Date(since).toISOString())
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: StreamRow[] | null; error: { message: string } | null }>);

  const byTwitchId = new Map<string, string>();
  const bySlug = new Map<string, string>();
  const connected = new Set<string>();
  for (const c of conns) {
    connected.add(c.user_id);
    if (c.twitch_user_id) byTwitchId.set(c.twitch_user_id, c.user_id);
    if (c.twitch_login) bySlug.set(c.twitch_login.toLowerCase(), c.user_id);
    const u = usernames.get(c.user_id);
    if (u) bySlug.set(u.toLowerCase(), c.user_id);
  }

  const out = new Set<string>();
  for (const r of rows) {
    const c = r.gs_communities;
    if (!c) continue;
    const id = c.gs_identities;
    const candidates = [
      c.owner_user_id,
      id?.gs_account_id ?? null,
      id?.platform === "twitch" && id.platform_id ? byTwitchId.get(id.platform_id) ?? null : null,
      c.slug ? bySlug.get(c.slug.toLowerCase()) ?? null : null,
    ];
    for (const uid of candidates) if (uid && connected.has(uid)) out.add(uid);
  }
  return out;
}

async function usersById(db: Db, ids: string[]): Promise<Map<string, UserRow>> {
  const out = new Map<string, UserRow>();
  for (const part of chunks([...new Set(ids)])) {
    const { data } = await db.from("users").select("id, username, display_name, is_public").in("id", part);
    for (const u of (data ?? []) as UserRow[]) out.set(u.id, u);
  }
  return out;
}

function accountName(u: UserRow | undefined, fallback?: string | null): string {
  return u?.display_name?.trim() || u?.username || fallback || "An account with no name";
}

const profileHref = (u: UserRow | undefined) => (u?.username && u.is_public ? `/u/${u.username}` : null);

/** What's wrong with one Twitch connection, worst first; empty when it works. */
function twitchReasons(conn: ConnRow, subs: SubRow[], tokensMissing: boolean, now: number): string[] {
  const byType = new Map(subs.map((s) => [s.type, s]));
  const statuses = subs.map((s) => s.status ?? "");
  if (statuses.includes("authorization_revoked")) return ["Removed GameShuffle's access on Twitch"];
  if (statuses.includes("user_removed")) return ["Their Twitch account was suspended or closed"];

  // Reconnecting Twitch sets everything up again (the bot, every subscription), so it's the one thing to say.
  if (tokensMissing) return ["Their Twitch sign-in is missing, so nothing works until they reconnect"];

  const reasons: string[] = [];
  if (!conn.bot_authorized) reasons.push("The bot isn't allowed in chat");

  const broken = (type: string) => {
    const s = byType.get(type);
    if (!s) return true;
    if (s.status === "enabled") return false;
    if (s.status === "webhook_callback_verification_pending" && recent(s.created_at, now - PENDING_GRACE_MS)) return false;
    return true;
  };
  const failing = (type: string) => byType.get(type)?.status === "notification_failures_exceeded";

  if (broken(CHAT_EVENT)) {
    reasons.push(byType.has(CHAT_EVENT) ? (failing(CHAT_EVENT) ? "Chat events stopped after too many failed deliveries" : "Chat events stopped") : "Chat events never started");
  }
  const streamTypes = CORE_EVENTS.filter((t) => t !== CHAT_EVENT);
  const streamBroken = streamTypes.filter(broken);
  if (streamBroken.length > 0) {
    const never = streamBroken.every((t) => !byType.has(t));
    reasons.push(never ? "Going live and game changes never started coming in" : "Going live and game changes stopped coming in");
  }
  return reasons;
}

export async function getSetupSummary(): Promise<SetupSummary> {
  const db = createServiceClient();
  const now = Date.now();
  const weekAgo = now - 7 * DAY;
  const monthAgo = now - 30 * DAY;
  const monthAgoIso = new Date(monthAgo).toISOString();

  const [
    accounts, conns, noTokens, subs, mods, youtube,
    guilds, routes, alerts, skippedCards, failedPosts,
    twitchSignIn, discordSignIn, mmrCards, loungeRows,
  ] = await Promise.all([
    headCount(db.from("users").select("id", { count: "exact", head: true })),
    twitchConnections(db),
    // A filter, never a select, on the token columns: their values never leave the database.
    allRows<{ user_id: string }>((from, to) =>
      db.from("twitch_connections").select("user_id").or("access_token_encrypted.is.null,refresh_token_encrypted.is.null").order("user_id").range(from, to)),
    allRows<SubRow>((from, to) =>
      db.from("twitch_eventsub_subscriptions").select("user_id, type, status, created_at").in("type", [...CORE_EVENTS]).order("id").range(from, to)),
    allRows<{ streamer_user_id: string }>((from, to) =>
      db.from("streamer_mods").select("streamer_user_id").eq("status", "active").order("id").range(from, to)),
    headCount(db.from("youtube_connections").select("id", { count: "exact", head: true })),
    allRows<GuildRow>((from, to) =>
      db.from("discord_guilds")
        .select("guild_id, owner_user_id, guild_name, connected_at, removed_at, default_channel_id, live_alert_channel_id, event_subscriptions, log_channel_id, lounge_roles_game")
        .order("guild_id").range(from, to)),
    allRows<{ guild_id: string | null; channel_id: string | null }>((from, to) =>
      db.from("discord_channel_routes").select("guild_id, channel_id").not("channel_id", "is", null).order("guild_id").order("category").range(from, to)),
    allRows<{ guild_id: string }>((from, to) =>
      db.from("discord_live_alerts").select("guild_id").eq("enabled", true).order("id").range(from, to)),
    // The Daily's channel card marks a channel skipped when Discord refuses the bot (403/404).
    allRows<{ guild_id: string | null; channel_id: string }>((from, to) =>
      db.from("discord_daily_cards").select("guild_id, channel_id").eq("skipped", true).gte("day", gsDay(monthAgo)).order("channel_id").order("day").order("puzzle").range(from, to)),
    allRows<{ user_id: string; guild_id: string | null; error: string | null }>((from, to) =>
      db.from("discord_scheduled_posts").select("user_id, guild_id, error").eq("status", "failed").gte("created_at", monthAgoIso).order("id").range(from, to)),
    headCount(db.from("users").select("id", { count: "exact", head: true }).not("twitch_id", "is", null)),
    headCount(db.from("users").select("id", { count: "exact", head: true }).not("discord_id", "is", null)),
    headCount(db.from("mmr_cards").select("user_id", { count: "exact", head: true })),
    allRows<{ user_id: string }>((from, to) =>
      db.from("lounge_links").select("user_id").not("confirmed_at", "is", null).order("user_id").order("game").range(from, to)),
  ]);

  // ── Twitch ──
  const subsByUser = new Map<string, SubRow[]>();
  for (const s of subs) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
  const enabled = (uid: string, type: string) => (subsByUser.get(uid) ?? []).some((s) => s.type === type && s.status === "enabled");
  const allEvents = (uid: string) => CORE_EVENTS.every((t) => enabled(uid, t));
  const tokenless = new Set(noTokens.map((r) => r.user_id));
  const modStreamers = new Set(mods.map((m) => m.streamer_user_id));

  const guildOwners = guilds.map((g) => g.owner_user_id);
  const users = await usersById(db, [...conns.map((c) => c.user_id), ...guildOwners, ...failedPosts.map((p) => p.user_id)]);
  const usernames = new Map<string, string>();
  for (const [id, u] of users) if (u.username) usernames.set(id, u.username);
  const liveRecently = await wentLiveSince(db, monthAgo, conns, usernames);

  const twitchProblems: SetupProblem[] = [];
  for (const c of conns) {
    const reasons = twitchReasons(c, subsByUser.get(c.user_id) ?? [], tokenless.has(c.user_id), now);
    if (reasons.length === 0) continue;
    const u = users.get(c.user_id);
    const login = c.twitch_login ?? c.twitch_display_name;
    twitchProblems.push({ key: c.user_id, name: accountName(u, c.twitch_display_name), href: profileHref(u), detail: login ? `@${login} on Twitch` : null, reasons });
  }

  // ── Discord ──
  const active = guilds.filter((g) => !g.removed_at);
  const routed = new Map<string, Set<string>>();
  for (const r of routes) {
    if (!r.guild_id || !r.channel_id) continue;
    routed.set(r.guild_id, (routed.get(r.guild_id) ?? new Set()).add(r.channel_id));
  }
  const hasChannel = (g: GuildRow) => !!g.default_channel_id || (routed.get(g.guild_id)?.size ?? 0) > 0;
  const alertGuilds = new Set(alerts.map((a) => a.guild_id));
  const picked = (g: GuildRow) => new Set([g.default_channel_id, g.live_alert_channel_id, ...(routed.get(g.guild_id) ?? [])].filter(Boolean) as string[]);
  const refusedIn = new Map<string, Set<string>>();
  for (const c of skippedCards) if (c.guild_id) refusedIn.set(c.guild_id, (refusedIn.get(c.guild_id) ?? new Set()).add(c.channel_id));
  const failedByGuild = new Map<string, number>();
  const failedAnyServer = new Map<string, number>();
  for (const p of failedPosts) {
    if (p.guild_id) failedByGuild.set(p.guild_id, (failedByGuild.get(p.guild_id) ?? 0) + 1);
    else failedAnyServer.set(p.user_id, (failedAnyServer.get(p.user_id) ?? 0) + 1);
  }

  const discordProblems: SetupProblem[] = [];
  const posts = (n: number) => (n === 1 ? "A scheduled post didn't send" : `${n} scheduled posts didn't send`);
  for (const g of active) {
    const reasons: string[] = [];
    if (!hasChannel(g)) reasons.push("No channel picked for posts");
    const mine = picked(g);
    if ([...(refusedIn.get(g.guild_id) ?? [])].some((ch) => mine.has(ch))) reasons.push("The bot can't post in a channel picked for it");
    if (alertGuilds.has(g.guild_id) && !g.live_alert_channel_id) reasons.push("Go-live alerts are on but have no channel");
    if (g.event_subscriptions?.qotd === true && !g.default_channel_id) reasons.push("Question of the Day is on but has no channel");
    const failed = failedByGuild.get(g.guild_id) ?? 0;
    if (failed > 0) reasons.push(posts(failed));
    if (reasons.length === 0) continue;
    const u = users.get(g.owner_user_id);
    discordProblems.push({ key: `${g.owner_user_id}:${g.guild_id}`, name: accountName(u), href: profileHref(u), detail: g.guild_name ? `Server: ${g.guild_name}` : "Server with no name", reasons });
  }
  // Scheduled posts sent to "all servers" belong to the account, not one server.
  for (const [uid, n] of failedAnyServer) {
    const u = users.get(uid);
    discordProblems.push({ key: `${uid}:all`, name: accountName(u), href: profileHref(u), detail: "All their servers", reasons: [posts(n)] });
  }

  const worstFirst = (a: SetupProblem, b: SetupProblem) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name);

  return {
    accounts,
    twitch: {
      connected: conns.length,
      connectedWeek: conns.filter((c) => recent(c.connected_at, weekAgo)).length,
      bot: conns.filter((c) => c.bot_authorized && enabled(c.user_id, CHAT_EVENT)).length,
      events: conns.filter((c) => allEvents(c.user_id)).length,
      overlay: conns.filter((c) => !!c.overlay_seen_at).length,
      liveMonth: conns.filter((c) => c.is_live || liveRecently.has(c.user_id)).length,
      working: conns.filter((c) => c.bot_authorized && allEvents(c.user_id)).length,
      channelPoints: conns.filter((c) => c.channel_points_enabled).length,
      chatFeed: conns.filter((c) => c.chat_overlay_enabled).length,
      withMods: modStreamers.size,
      youtube,
      problems: twitchProblems.sort(worstFirst),
    },
    discord: {
      servers: active.length,
      owners: new Set(active.map((g) => g.owner_user_id)).size,
      serversWeek: active.filter((g) => recent(g.connected_at, weekAgo)).length,
      withChannel: active.filter(hasChannel).length,
      liveAlerts: active.filter((g) => alertGuilds.has(g.guild_id)).length,
      qotd: active.filter((g) => g.event_subscriptions?.qotd === true).length,
      logs: active.filter((g) => !!g.log_channel_id).length,
      loungeRoles: active.filter((g) => !!g.lounge_roles_game).length,
      removedMonth: guilds.filter((g) => recent(g.removed_at, monthAgo)).length,
      problems: discordProblems.sort(worstFirst),
    },
    people: {
      twitchSignIn,
      discordSignIn,
      mmrCards,
      loungeConfirmed: new Set(loungeRows.map((r) => r.user_id)).size,
    },
    generatedAt: new Date(now).toISOString(),
  };
}
