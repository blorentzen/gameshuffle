/**
 * DiscordAdapter — bridges GameShuffle session events into the streamer's
 * Discord server via the bot installed at /api/discord/bot/install/*.
 *
 * Scope is per-session per-platform (one instance per session × Discord).
 * Construction is cheap; per-event work fetches the streamer's routing
 * (channel id, event subscriptions, ping toggles, live URL) just-in-time
 * so a streamer who flips a setting mid-session sees the new behavior on
 * the next event.
 *
 * Two independent toggles per event type:
 *
 *   - **subscriptions** — whether the bot POSTS at all. All ON by
 *     default so the integration feels visible right after install.
 *   - **pings** — whether the bot ALSO @-mentions the streamer's
 *     `notify_role_id` on that post. All OFF by default; we don't
 *     ping unless the streamer has explicitly opted in (avoid the
 *     "noisy bot" failure mode that gets bots kicked).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getLiveUrlForUser } from "@/lib/twitch/streamerSlug";
import { isProUser } from "@/lib/subscription-server";
import { activeGuilds } from "@/lib/discord/guilds";
import { getGameName } from "@/data/game-registry";
import { boxArt, catalogForApp } from "@/data/game-catalog";
import { SITE_URL } from "@/lib/seo";
import type {
  AdapterCapability,
  AdapterResult,
  AnnouncementContent,
  ConnectionHealth,
  ParticipantResolution,
  PlatformAdapter,
  StreamStatusResult,
} from "../types";
import type { GsSession } from "@/lib/sessions/types";
import type { RecapPayload } from "@/lib/sessions/service";
import { createThreadFromMessage, editEmbed, postComponentsMessage, postEmbed, type DiscordEmbed } from "./adapter";
import {
  announcementEmbed,
  qotdEmbed,
  recapEmbed,
  roundClosedEmbed,
  roundOpenEmbed,
  streamEndedEmbed,
  streamLiveEmbed,
  streamUpdateEmbed,
} from "./embeds";

/** Absolute URL of a game's box art for Discord embeds, or null when the catalog has none. */
function gameCoverUrl(gameSlug: string | null | undefined): string | null {
  const art = boxArt(catalogForApp(gameSlug));
  return art ? `${SITE_URL}${art}` : null;
}

const SUPPORTED_CAPABILITIES: ReadonlySet<AdapterCapability> = new Set([
  "announce",
]);

type DiscordEventKey =
  | "stream_live"
  | "round_open"
  | "round_close"
  | "recap"
  | "qotd";

/**
 * Per-key subscription default, used when the streamer's flags column has
 * no entry for a key (so new event types need no backfill).
 *
 * Everything here defaults ON *except* `qotd`: the other events are
 * reactions to something the streamer just did (went live, opened a
 * round), so posting them is expected. QOTD posts on a daily schedule
 * with no action from the streamer — defaulting that ON would drop a
 * recurring post into every connected server uninvited, so it's opt-in.
 */
const SUB_DEFAULTS: Record<DiscordEventKey, boolean> = {
  stream_live: true,
  round_open: true,
  round_close: true,
  recap: true,
  qotd: false,
};

type DiscordEventFlags = Partial<Record<DiscordEventKey, boolean>>;

interface StreamerDiscordRouting {
  /** One of the servers the streamer connected (discord_guilds). */
  guildId: string;
  /** The main server: the one a session's channel override belongs to. */
  isMain: boolean;
  /** Account/session default channel — per-session override wins, then
   *  account default. May be null when only per-category routes are set;
   *  `channelFor(routing, category)` layers category routes on top. */
  defaultChannelId: string | null;
  /** Per-category channel overrides (RouteCategory → channel id). */
  routes: Record<string, string>;
  /** Optional role to ping when both the event's subscription AND its
   *  ping toggle are on. Pings are opt-in, so this is only read when
   *  `eventPings[event] === true`. */
  notifyRoleId: string | null;
  /** Per-event subscription toggles. Missing key defaults to ON (the
   *  bot posts) — keeps newly-added event types from going silent on
   *  existing rows. */
  subscriptions: DiscordEventFlags;
  /** Per-event ping toggles. Missing key defaults to OFF — pings are
   *  opt-in to avoid the "noisy bot" failure mode. */
  eventPings: DiscordEventFlags;
  /** Streamer display info — used in embed copy. */
  streamerName: string;
  twitchHandle: string | null;
  avatarUrl: string | null;
  liveUrl: string | null;
}

/** Posting default is per-key (see SUB_DEFAULTS); pinging is always OFF
 *  by default. Used when the column is missing an event key, so adding
 *  new event types doesn't require a backfill. */
function subEnabled(flags: DiscordEventFlags, key: DiscordEventKey): boolean {
  return flags[key] ?? SUB_DEFAULTS[key];
}
function pingEnabled(flags: DiscordEventFlags, key: DiscordEventKey): boolean {
  return flags[key] === true;
}

/**
 * The streamer's Discord routing for every server that posts right now (all
 * connected servers with GS Pro, the main one without; see discord/guilds.ts).
 * Empty when none: callers treat that as "no-op". `guildId` narrows it to one
 * server. Category routes are a Pro tool, so they only apply while the owner
 * has Pro; otherwise each server posts to its default channel. A session's
 * channel override belongs to the main server.
 */
async function resolveRoutings(
  /** Null for non-session contexts (announcements, the daily QOTD post). */
  sessionId: string | null,
  ownerUserId: string,
  opts: { guildId?: string | null } = {},
): Promise<StreamerDiscordRouting[]> {
  const admin = createServiceClient();
  const isPro = await isProUser(ownerUserId);
  let guilds = await activeGuilds(ownerUserId, { isPro });
  if (opts.guildId) guilds = guilds.filter((g) => g.guildId === opts.guildId);
  if (guilds.length === 0) return [];

  const [profileRes, sessionRes, routesRes] = await Promise.all([
    admin
      .from("users")
      .select("display_name, username, twitch_username, twitch_avatar, discord_avatar")
      .eq("id", ownerUserId)
      .maybeSingle(),
    sessionId
      ? admin.from("gs_sessions").select("discord_channel_id").eq("id", sessionId).maybeSingle()
      : Promise.resolve({ data: null }),
    isPro
      ? admin.from("discord_channel_routes").select("guild_id, category, channel_id").in("guild_id", guilds.map((g) => g.guildId))
      : Promise.resolve({ data: [] }),
  ]);
  const profile = profileRes.data as
    | { display_name: string | null; username: string | null; twitch_username: string | null; twitch_avatar: string | null; discord_avatar: string | null }
    | null;
  const sessionOverride = (sessionRes.data as { discord_channel_id: string | null } | null)?.discord_channel_id ?? null;

  const routesByGuild = new Map<string, Record<string, string>>();
  for (const r of (routesRes.data ?? []) as Array<{ guild_id: string; category: string; channel_id: string }>) {
    const m = routesByGuild.get(r.guild_id) ?? {};
    m[r.category] = r.channel_id;
    routesByGuild.set(r.guild_id, m);
  }

  const streamerName = profile?.display_name ?? profile?.username ?? profile?.twitch_username ?? "Streamer";
  const liveUrl = await getLiveUrlForUser(ownerUserId).catch(() => null);

  return guilds.map((g) => ({
    guildId: g.guildId,
    isMain: g.isMain,
    defaultChannelId: (g.isMain ? sessionOverride : null) ?? g.defaultChannelId,
    routes: routesByGuild.get(g.guildId) ?? {},
    notifyRoleId: g.notifyRoleId,
    subscriptions: g.eventSubscriptions as DiscordEventFlags,
    eventPings: g.eventPings as DiscordEventFlags,
    streamerName,
    twitchHandle: profile?.twitch_username ?? null,
    avatarUrl: profile?.twitch_avatar ?? profile?.discord_avatar ?? null,
    liveUrl,
  }));
}

/** Resolve the posting channel for a category: category route wins, else the
 *  session/account default. Null when neither is configured → caller skips. */
function channelFor(routing: StreamerDiscordRouting, category: string): string | null {
  return routing.routes[category] ?? routing.defaultChannelId;
}

/**
 * Post a standalone announcement to the streamer's channel for a category
 * (session-less — used by the announce API + the scheduled-posts cron). Resolves
 * routing by category, so it lands wherever the streamer routed that category.
 */
export async function postAnnouncementToCategory(args: {
  ownerUserId: string;
  category: string;
  title: string;
  body: string;
  url?: string | null;
  /** Opt-in posts: only send if this category has its own route (no fallback to the default channel). */
  requireRoute?: boolean;
  /** One server; omitted = every server that posts. */
  guildId?: string | null;
}): Promise<{ ok: true; sent: number } | { ok: false; reason: string }> {
  const routings = await resolveRoutings(null, args.ownerUserId, { guildId: args.guildId });
  if (routings.length === 0) return { ok: false, reason: "no_routing" };
  let sent = 0;
  let firstError: string | null = null;
  for (const routing of routings) {
    const channelId = args.requireRoute ? routing.routes[args.category] ?? null : channelFor(routing, args.category);
    if (!channelId) continue;
    const result = await postEmbed({
      channelId,
      embed: announcementEmbed({
        streamerName: routing.streamerName,
        title: args.title,
        body: args.body,
        url: args.url ?? routing.liveUrl,
        avatarUrl: routing.avatarUrl,
        postedAt: new Date().toISOString(),
      }),
    });
    if (result.ok) sent += 1;
    else firstError ??= result.error;
  }
  if (sent > 0) return { ok: true, sent };
  return { ok: false, reason: firstError ?? "no_channel" };
}

/**
 * Post an embed with buttons to the channel routed for a category (the daily
 * Chat Brain question). Same routing rules as postAnnouncementToCategory.
 */
export async function postComponentsToCategory(args: {
  ownerUserId: string;
  category: string;
  requireRoute?: boolean;
  embed: DiscordEmbed;
  components: unknown[];
}): Promise<{ ok: true; posts: { messageId: string; channelId: string; guildId: string }[] } | { ok: false; reason: string }> {
  const routings = await resolveRoutings(null, args.ownerUserId);
  if (routings.length === 0) return { ok: false, reason: "no_routing" };
  const posts: { messageId: string; channelId: string; guildId: string }[] = [];
  let firstError: string | null = null;
  for (const routing of routings) {
    const channelId = args.requireRoute ? routing.routes[args.category] ?? null : channelFor(routing, args.category);
    if (!channelId) continue;
    const result = await postComponentsMessage({ channelId, embeds: [args.embed], components: args.components });
    if (result.ok) posts.push({ messageId: result.messageId, channelId, guildId: routing.guildId });
    else firstError ??= result.error;
  }
  return posts.length ? { ok: true, posts } : { ok: false, reason: firstError ?? "no_channel" };
}

/**
 * Post today's Question of the Day to a streamer's Discord channel.
 *
 * Standalone (not an adapter method) because QOTD is a daily, community-
 * scoped post with no session behind it. Returns a small result so the
 * cron can log/skip precisely rather than swallowing outcomes.
 *
 * Gated by the streamer's `qotd` subscription, which defaults OFF — see
 * SUB_DEFAULTS. The question must come from `resolveQotdForCommunity` so
 * it matches what `!qotd` answers in Twitch chat today.
 */
export async function postQotdToDiscord(args: {
  ownerUserId: string;
  question: string;
  /** The server to post in (each server posts at its own hour). */
  guildId: string;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "no_routing" | "not_subscribed" | "post_failed"; error?: string }
> {
  const [routing] = await resolveRoutings(null, args.ownerUserId, { guildId: args.guildId });
  if (!routing) return { ok: false, reason: "no_routing" };
  if (!subEnabled(routing.subscriptions, "qotd")) {
    return { ok: false, reason: "not_subscribed" };
  }
  const channelId = channelFor(routing, "qotd");
  if (!channelId) return { ok: false, reason: "no_routing" };

  const ping = buildPing(routing, "qotd");
  const result = await postEmbed({
    channelId: channelId,
    embed: qotdEmbed({
      streamerName: routing.streamerName,
      question: args.question,
      liveUrl: routing.liveUrl,
      avatarUrl: routing.avatarUrl,
      postedAt: new Date().toISOString(),
    }),
    content: ping.content,
    allowedMentions: ping.allowedMentions,
  });
  if (!result.ok) {
    return { ok: false, reason: "post_failed", error: result.error };
  }
  return { ok: true };
}

/** Build the (content, allowed_mentions) pair for a post — returns
 *  empty content + no-mentions parse when the streamer hasn't opted in
 *  to a ping for this event, OR has no role configured. */
function buildPing(
  routing: StreamerDiscordRouting,
  key: DiscordEventKey,
):
  | { content?: undefined; allowedMentions?: undefined }
  | {
      content: string;
      allowedMentions: { roles: string[]; parse: Array<"roles"> };
    } {
  if (!pingEnabled(routing.eventPings, key)) return {};
  if (!routing.notifyRoleId) return {};
  return {
    content: `<@&${routing.notifyRoleId}>`,
    allowedMentions: { roles: [routing.notifyRoleId], parse: ["roles"] },
  };
}

/** True when a Discord REST error string indicates the bot can't
 *  reach the configured channel — kicked, channel deleted, perms
 *  changed, etc. In every case, the streamer needs to reconfigure;
 *  retrying on every lifecycle event just spams audit rows and
 *  surfaces a fake "transition error" in the hub UI. */
function isMissingAccessError(error: string): boolean {
  // The adapter formats errors as `${status}: ${body}` — match the
  // 403 (Missing Access) and 404 (Unknown Channel) prefixes. Either
  // means the routing target is gone; soft-fail so the rest of the
  // lifecycle event keeps moving.
  return /^4(03|04):/.test(error);
}

interface DiscordAdapterCtor {
  sessionId: string;
  ownerUserId: string;
}

export class DiscordAdapter implements PlatformAdapter {
  readonly platform = "discord" as const;
  readonly sessionId: string;
  readonly ownerUserId: string;

  constructor(args: DiscordAdapterCtor) {
    this.sessionId = args.sessionId;
    this.ownerUserId = args.ownerUserId;
  }

  hasCapability(capability: AdapterCapability): boolean {
    return SUPPORTED_CAPABILITIES.has(capability);
  }

  // ---- Lifecycle hooks ----------------------------------------------------
  // Each hook runs once per server that posts. A server the bot can't reach
  // (kicked, channel deleted, perms changed) soft-fails; any other failure is
  // collected and thrown once at the end so the dispatcher records an
  // `adapter_call_failed` event without stopping the other servers.

  private async eachServer(fn: (routing: StreamerDiscordRouting) => Promise<void>): Promise<void> {
    const routings = await resolveRoutings(this.sessionId, this.ownerUserId);
    const errors: string[] = [];
    for (const routing of routings) {
      try {
        await fn(routing);
      } catch (err) {
        errors.push(`${routing.guildId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (errors.length) throw new Error(errors.join("; "));
  }

  /** Each server's "now live" message (guild id → message id), with the pre-multi-server column as the main server's. */
  private async liveMessages(): Promise<{ map: Record<string, string>; legacy: string | null }> {
    const { data } = await createServiceClient().from("gs_sessions").select("discord_live_messages, discord_live_message_id").eq("id", this.sessionId).maybeSingle();
    const row = data as { discord_live_messages: Record<string, string> | null; discord_live_message_id: string | null } | null;
    return { map: row?.discord_live_messages ?? {}, legacy: row?.discord_live_message_id ?? null };
  }

  private async saveLiveMessage(routing: StreamerDiscordRouting, messageId: string): Promise<void> {
    const admin = createServiceClient();
    const { map } = await this.liveMessages();
    await admin
      .from("gs_sessions")
      .update({ discord_live_messages: { ...map, [routing.guildId]: messageId }, ...(routing.isMain ? { discord_live_message_id: messageId } : {}) })
      .eq("id", this.sessionId);
  }

  private liveMessageFor(routing: StreamerDiscordRouting, live: { map: Record<string, string>; legacy: string | null }): string | null {
    return live.map[routing.guildId] ?? (routing.isMain ? live.legacy : null);
  }

  async onSessionActivated(session: GsSession): Promise<void> {
    // Skip GS Queue mode (no race game = nothing meaningful to embed
    // in the announcement). Per spec §Open decisions.
    const gameSlug = session.active_game ?? session.configured_games?.[0] ?? null;
    if (!gameSlug) return;
    const gameName = getGameName(gameSlug);

    await this.eachServer(async (routing) => {
      if (!subEnabled(routing.subscriptions, "stream_live")) return;
      const channelId = channelFor(routing, "stream");
      if (!channelId) return;
      const ping = buildPing(routing, "stream_live");
      const result = await postEmbed({
        channelId,
        embed: streamLiveEmbed({
          streamerName: routing.streamerName,
          twitchHandle: routing.twitchHandle,
          gameName,
          liveUrl: routing.liveUrl,
          avatarUrl: routing.avatarUrl,
          coverUrl: gameCoverUrl(gameSlug),
          startedAt: session.activated_at ?? new Date().toISOString(),
        }),
        content: ping.content,
        allowedMentions: ping.allowedMentions,
      });
      if (!result.ok) {
        if (isMissingAccessError(result.error)) {
          console.warn(`[DiscordAdapter] missing access on channel ${channelId} (server ${routing.guildId}): skipping. The streamer should reconfigure that server's channels.`);
          return;
        }
        throw new Error(`postEmbed: ${result.error}`);
      }
      // Kept per server so later events (game pivot, session end) edit the same message.
      await this.saveLiveMessage(routing, result.messageId);
    });
  }

  async onSessionEnding(_session: GsSession): Promise<void> {
    // No-op — we keep the live embed in place until the session
    // formally ends. onSessionEnded handles the final edit.
    void _session;
  }

  async onWrapUpComplete(_session: GsSession): Promise<void> {
    void _session;
  }

  async onActiveGameChanged(
    session: GsSession,
    payload: { previousGame: string | null; nextGame: string | null },
  ): Promise<void> {
    // Subscription-gated to the same toggle as the initial announce —
    // the pivot edit is part of the stream-live story, not a separate
    // event the streamer can opt out of independently.
    if (!payload.nextGame) return;
    const nextGame = payload.nextGame;
    const live = await this.liveMessages();
    await this.eachServer(async (routing) => {
      if (!subEnabled(routing.subscriptions, "stream_live")) return;
      const channelId = channelFor(routing, "stream");
      const messageId = this.liveMessageFor(routing, live);
      if (!channelId || !messageId) return;
      const editResult = await editEmbed({
        channelId,
        messageId,
        embed: streamUpdateEmbed({
          streamerName: routing.streamerName,
          twitchHandle: routing.twitchHandle,
          gameName: getGameName(nextGame),
          previousGameName: payload.previousGame ? getGameName(payload.previousGame) : null,
          liveUrl: routing.liveUrl,
          avatarUrl: routing.avatarUrl,
          coverUrl: gameCoverUrl(nextGame),
          startedAt: session.activated_at ?? new Date().toISOString(),
        }),
      });
      if (!editResult.ok && isMissingAccessError(editResult.error)) {
        console.warn(`[DiscordAdapter] missing access editing live message on ${channelId}: skipping.`);
        return;
      }
      if (!editResult.ok) throw new Error(`editEmbed: ${editResult.error}`);
    });
  }

  async onPicksBansOpened(
    _session: GsSession,
    payload: { roundId: string; gameSlug: string },
  ): Promise<void> {
    void _session;
    const gameName = getGameName(payload.gameSlug);
    await this.eachServer(async (routing) => {
      if (!subEnabled(routing.subscriptions, "round_open")) return;
      const channelId = channelFor(routing, "rounds");
      if (!channelId) return;
      const ping = buildPing(routing, "round_open");
      const result = await postEmbed({
        channelId,
        embed: roundOpenEmbed({ streamerName: routing.streamerName, gameName, liveUrl: routing.liveUrl, avatarUrl: routing.avatarUrl }),
        content: ping.content,
        allowedMentions: ping.allowedMentions,
      });
      if (!result.ok) {
        if (isMissingAccessError(result.error)) return;
        throw new Error(`postEmbed: ${result.error}`);
      }
      // Spawn a thread off the announcement so round-specific banter
      // doesn't drown the announcement channel. Best-effort.
      try {
        const threadName = `${gameName} picks & bans: ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
        await createThreadFromMessage({ channelId, messageId: result.messageId, name: threadName, autoArchiveDurationMinutes: 60 });
      } catch (err) {
        console.warn("[discord-adapter] thread create failed", err);
      }
    });
  }

  async onPicksBansClosed(
    _session: GsSession,
    payload: { roundId: string; gameSlug: string; ballotCount: number },
  ): Promise<void> {
    void _session;
    await this.eachServer(async (routing) => {
      if (!subEnabled(routing.subscriptions, "round_close")) return;
      const channelId = channelFor(routing, "rounds");
      if (!channelId) return;
      const ping = buildPing(routing, "round_close");
      const result = await postEmbed({
        channelId,
        embed: roundClosedEmbed({
          streamerName: routing.streamerName,
          gameName: getGameName(payload.gameSlug),
          ballotCount: payload.ballotCount,
          liveUrl: routing.liveUrl,
          avatarUrl: routing.avatarUrl,
        }),
        content: ping.content,
        allowedMentions: ping.allowedMentions,
      });
      if (!result.ok && !isMissingAccessError(result.error)) throw new Error(`postEmbed: ${result.error}`);
    });
  }

  async onRecapReady(
    _session: GsSession,
    recap: RecapPayload,
  ): Promise<void> {
    void _session;
    await this.eachServer(async (routing) => {
      if (!subEnabled(routing.subscriptions, "recap")) return;
      const channelId = channelFor(routing, "recap");
      if (!channelId) return;
      const ping = buildPing(routing, "recap");
      const result = await postEmbed({
        channelId,
        embed: recapEmbed({
          streamerName: routing.streamerName,
          sessionName: recap.session_name,
          durationSeconds: recap.duration_seconds,
          participantCount: recap.participant_count,
          shuffleCount: recap.shuffle_count,
          liveUrl: routing.liveUrl,
          avatarUrl: routing.avatarUrl,
          endedAt: recap.ended_at,
        }),
        content: ping.content,
        allowedMentions: ping.allowedMentions,
      });
      if (!result.ok && !isMissingAccessError(result.error)) throw new Error(`postEmbed: ${result.error}`);
    });
  }

  async onSessionEnded(session: GsSession): Promise<void> {
    // Best-effort: edit each server's live embed to "stream wrapped" so the
    // announcement doesn't keep saying "🔴 Live" after the stream is over.
    // The recap embed (onRecapReady) is a separate post.
    const live = await this.liveMessages();
    const gameSlug = session.active_game ?? session.configured_games?.[0] ?? null;
    await this.eachServer(async (routing) => {
      if (!subEnabled(routing.subscriptions, "stream_live")) return;
      const channelId = channelFor(routing, "stream");
      const messageId = this.liveMessageFor(routing, live);
      if (!channelId || !messageId) return;
      const editResult = await editEmbed({
        channelId,
        messageId,
        embed: streamEndedEmbed({
          streamerName: routing.streamerName,
          gameName: gameSlug ? getGameName(gameSlug) : null,
          endedAt: session.ended_at ?? new Date().toISOString(),
          avatarUrl: routing.avatarUrl,
        }),
      });
      if (!editResult.ok && isMissingAccessError(editResult.error)) return;
      if (!editResult.ok) throw new Error(`editEmbed: ${editResult.error}`);
    });
  }

  // ---- Direct actions — not supported on Discord (yet) -------------------

  async postChatMessage(_message: string): Promise<AdapterResult> {
    return {
      ok: false,
      error: "discord_adapter_chat_send_unsupported",
      retryable: false,
    };
  }
  async postAnnouncement(_content: AnnouncementContent): Promise<AdapterResult> {
    return {
      ok: false,
      error: "discord_adapter_announce_unsupported",
      retryable: false,
    };
  }
  async resolveParticipant(
    _platformUserId: string,
  ): Promise<ParticipantResolution | null> {
    return null;
  }
  async checkStreamStatus(): Promise<StreamStatusResult> {
    return { isLive: false };
  }
  async validateConnection(): Promise<ConnectionHealth> {
    return { healthy: true };
  }
}
