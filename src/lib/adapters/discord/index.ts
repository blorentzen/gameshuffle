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
import { getGameName } from "@/data/game-registry";
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
import { createThreadFromMessage, editEmbed, postEmbed } from "./adapter";
import {
  recapEmbed,
  roundClosedEmbed,
  roundOpenEmbed,
  streamEndedEmbed,
  streamLiveEmbed,
  streamUpdateEmbed,
} from "./embeds";

const SUPPORTED_CAPABILITIES: ReadonlySet<AdapterCapability> = new Set([
  "announce",
]);

type DiscordEventKey =
  | "stream_live"
  | "round_open"
  | "round_close"
  | "recap";

type DiscordEventFlags = Partial<Record<DiscordEventKey, boolean>>;

interface StreamerDiscordRouting {
  /** Resolved channel id — per-session override wins, then account
   *  default. Always non-null when `resolveRouting` returns a value;
   *  the helper returns null entirely when no channel is configured,
   *  so callers can treat the routing as a presence check. */
  channelId: string;
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

/** Defaults: posting ON, pinging OFF. Used when the column is missing
 *  an event key, so adding new event types doesn't require a backfill. */
function subEnabled(flags: DiscordEventFlags, key: DiscordEventKey): boolean {
  return flags[key] !== false;
}
function pingEnabled(flags: DiscordEventFlags, key: DiscordEventKey): boolean {
  return flags[key] === true;
}

/** Resolve the streamer's effective Discord routing for a specific
 *  session. Returns null when Discord isn't installed OR no channel
 *  is configured — caller treats null as "no-op for this session". */
async function resolveRouting(
  sessionId: string,
  ownerUserId: string,
): Promise<StreamerDiscordRouting | null> {
  const admin = createServiceClient();
  const [profileRes, sessionRes] = await Promise.all([
    admin
      .from("users")
      .select(
        "display_name, username, twitch_username, twitch_avatar, discord_avatar, discord_guild_id, discord_channel_id, discord_notify_role_id, discord_event_subscriptions, discord_event_pings",
      )
      .eq("id", ownerUserId)
      .maybeSingle(),
    admin
      .from("gs_sessions")
      .select("discord_channel_id")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);
  const profile = profileRes.data as
    | {
        display_name: string | null;
        username: string | null;
        twitch_username: string | null;
        twitch_avatar: string | null;
        discord_avatar: string | null;
        discord_guild_id: string | null;
        discord_channel_id: string | null;
        discord_notify_role_id: string | null;
        discord_event_subscriptions: DiscordEventFlags | null;
        discord_event_pings: DiscordEventFlags | null;
      }
    | null;
  if (!profile?.discord_guild_id) return null;

  const sessionOverride =
    (sessionRes.data as { discord_channel_id: string | null } | null)
      ?.discord_channel_id ?? null;
  const channelId = sessionOverride ?? profile.discord_channel_id;
  if (!channelId) return null;

  const streamerName =
    profile.display_name ??
    profile.username ??
    profile.twitch_username ??
    "Streamer";

  const liveUrl = await getLiveUrlForUser(ownerUserId).catch(() => null);

  return {
    channelId,
    notifyRoleId: profile.discord_notify_role_id ?? null,
    subscriptions: profile.discord_event_subscriptions ?? {},
    eventPings: profile.discord_event_pings ?? {},
    streamerName,
    twitchHandle: profile.twitch_username,
    avatarUrl: profile.twitch_avatar ?? profile.discord_avatar ?? null,
    liveUrl,
  };
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

  async onSessionActivated(session: GsSession): Promise<void> {
    const routing = await resolveRouting(this.sessionId, this.ownerUserId);
    if (!routing) return;
    if (!subEnabled(routing.subscriptions, "stream_live")) return;

    // Skip GS Queue mode (no race game = nothing meaningful to embed
    // in the announcement). Per spec §Open decisions.
    const gameSlug = session.active_game ?? session.configured_games?.[0] ?? null;
    if (!gameSlug) return;
    const gameName = getGameName(gameSlug);

    const ping = buildPing(routing, "stream_live");
    const result = await postEmbed({
      channelId: routing.channelId,
      embed: streamLiveEmbed({
        streamerName: routing.streamerName,
        twitchHandle: routing.twitchHandle,
        gameName,
        liveUrl: routing.liveUrl,
        avatarUrl: routing.avatarUrl,
        startedAt: session.activated_at ?? new Date().toISOString(),
      }),
      content: ping.content,
      allowedMentions: ping.allowedMentions,
    });
    if (!result.ok) {
      if (isMissingAccessError(result.error)) {
        // Bot was kicked, channel deleted, or perms changed. Soft-fail
        // — the streamer needs to reconfigure routing; retrying on
        // every lifecycle event just spams the audit log + makes the
        // session hub look broken when it's actually a config issue.
        console.warn(
          `[DiscordAdapter] missing access on channel ${routing.channelId} — skipping post. Streamer should reconfigure routing on /account?tab=integrations.`,
        );
        return;
      }
      // Throw so the dispatcher records an `adapter_call_failed` event —
      // gives the streamer a self-diagnosing trail in their activity log.
      throw new Error(`postEmbed: ${result.error}`);
    }

    // Persist the message id so subsequent events (game pivot, session
    // end) can target the same message in-place.
    const admin = createServiceClient();
    await admin
      .from("gs_sessions")
      .update({ discord_live_message_id: result.messageId })
      .eq("id", this.sessionId);
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
    const routing = await resolveRouting(this.sessionId, this.ownerUserId);
    if (!routing) return;
    if (!subEnabled(routing.subscriptions, "stream_live")) return;
    if (!payload.nextGame) return;

    const admin = createServiceClient();
    const { data } = await admin
      .from("gs_sessions")
      .select("discord_live_message_id")
      .eq("id", this.sessionId)
      .maybeSingle();
    const messageId = (data as { discord_live_message_id: string | null } | null)
      ?.discord_live_message_id;
    if (!messageId) return;

    const editResult = await editEmbed({
      channelId: routing.channelId,
      messageId,
      embed: streamUpdateEmbed({
        streamerName: routing.streamerName,
        twitchHandle: routing.twitchHandle,
        gameName: getGameName(payload.nextGame),
        previousGameName: payload.previousGame
          ? getGameName(payload.previousGame)
          : null,
        liveUrl: routing.liveUrl,
        avatarUrl: routing.avatarUrl,
        startedAt: session.activated_at ?? new Date().toISOString(),
      }),
    });
    if (!editResult.ok && isMissingAccessError(editResult.error)) {
      console.warn(
        `[DiscordAdapter] missing access editing live message on ${routing.channelId} — skipping. Streamer should reconfigure routing.`,
      );
      return;
    }
    if (!editResult.ok) {
      throw new Error(`editEmbed: ${editResult.error}`);
    }
  }

  async onPicksBansOpened(
    _session: GsSession,
    payload: { roundId: string; gameSlug: string },
  ): Promise<void> {
    void _session;
    const routing = await resolveRouting(this.sessionId, this.ownerUserId);
    if (!routing) return;
    if (!subEnabled(routing.subscriptions, "round_open")) return;

    const gameName = getGameName(payload.gameSlug);
    const ping = buildPing(routing, "round_open");
    const result = await postEmbed({
      channelId: routing.channelId,
      embed: roundOpenEmbed({
        streamerName: routing.streamerName,
        gameName,
        liveUrl: routing.liveUrl,
        avatarUrl: routing.avatarUrl,
      }),
      content: ping.content,
      allowedMentions: ping.allowedMentions,
    });
    if (!result.ok) {
      throw new Error(`postEmbed: ${result.error}`);
    }

    // Spawn a thread off the announcement so round-specific banter
    // doesn't drown the announcement channel. Best-effort — thread
    // failure shouldn't bubble up and kill the dispatch.
    try {
      const threadName = `${gameName} picks & bans — ${new Date().toLocaleTimeString(
        "en-US",
        { hour: "numeric", minute: "2-digit" },
      )}`;
      await createThreadFromMessage({
        channelId: routing.channelId,
        messageId: result.messageId,
        name: threadName,
        autoArchiveDurationMinutes: 60,
      });
    } catch (err) {
      console.warn("[discord-adapter] thread create failed", err);
    }
  }

  async onPicksBansClosed(
    _session: GsSession,
    payload: { roundId: string; gameSlug: string; ballotCount: number },
  ): Promise<void> {
    void _session;
    const routing = await resolveRouting(this.sessionId, this.ownerUserId);
    if (!routing) return;
    if (!subEnabled(routing.subscriptions, "round_close")) return;

    const ping = buildPing(routing, "round_close");
    const result = await postEmbed({
      channelId: routing.channelId,
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
    if (!result.ok) {
      throw new Error(`postEmbed: ${result.error}`);
    }
  }

  async onRecapReady(
    _session: GsSession,
    recap: RecapPayload,
  ): Promise<void> {
    void _session;
    const routing = await resolveRouting(this.sessionId, this.ownerUserId);
    if (!routing) return;
    if (!subEnabled(routing.subscriptions, "recap")) return;

    const ping = buildPing(routing, "recap");
    const result = await postEmbed({
      channelId: routing.channelId,
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
    if (!result.ok) {
      throw new Error(`postEmbed: ${result.error}`);
    }
  }

  async onSessionEnded(session: GsSession): Promise<void> {
    // Best-effort: edit the live embed to "stream wrapped" so the
    // announcement doesn't keep saying "🔴 Live" after the stream is
    // over. The standalone recap embed (onRecapReady) is a separate
    // post — these are intentionally distinct surfaces.
    const routing = await resolveRouting(this.sessionId, this.ownerUserId);
    if (!routing) return;
    if (!subEnabled(routing.subscriptions, "stream_live")) return;

    const admin = createServiceClient();
    const { data } = await admin
      .from("gs_sessions")
      .select("discord_live_message_id")
      .eq("id", this.sessionId)
      .maybeSingle();
    const messageId = (data as { discord_live_message_id: string | null } | null)
      ?.discord_live_message_id;
    if (!messageId) return;

    const gameSlug = session.active_game ?? session.configured_games?.[0] ?? null;
    const editResult = await editEmbed({
      channelId: routing.channelId,
      messageId,
      embed: streamEndedEmbed({
        streamerName: routing.streamerName,
        gameName: gameSlug ? getGameName(gameSlug) : null,
        endedAt: session.ended_at ?? new Date().toISOString(),
        avatarUrl: routing.avatarUrl,
      }),
    });
    if (!editResult.ok && isMissingAccessError(editResult.error)) {
      console.warn(
        `[DiscordAdapter] missing access editing end-of-stream message on ${routing.channelId} — skipping.`,
      );
      return;
    }
    // onSessionEnded is best-effort by design (final embed swap) —
    // non-403 errors get swallowed by the dispatcher's catch above us.
    if (!editResult.ok) {
      throw new Error(`editEmbed: ${editResult.error}`);
    }
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
