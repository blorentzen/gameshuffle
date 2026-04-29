/**
 * TwitchAdapter — concrete `PlatformAdapter` for Twitch streamer integrations.
 *
 * Per gs-pro-v1-phase-3a-spec.md §5. Replaces the Phase 1/2 bridge pattern
 * (`src/lib/sessions/twitch-bridge.ts`) with a real adapter class that the
 * dispatcher instantiates per-session.
 *
 * The adapter is the boundary between session-layer code (which knows
 * about sessions, participants, events) and the Twitch SDK in
 * `src/lib/twitch/*` (which knows about Helix, EventSub, OAuth tokens).
 * Direct actions wrap Twitch SDK calls into the structured `AdapterResult`
 * shape; lifecycle hooks are the dispatcher's seam to platform behavior.
 *
 * **State:** lazily caches the streamer's `twitch_connections` row + the
 * bot's user ID after first use. Adapter lifetime is per-session, so the
 * cache lives until the session ends (or the route handler / cron tick
 * finishes, whichever comes first).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import {
  getChannelInfo,
  getStreamsByUserIds,
  sendChatMessage,
} from "@/lib/twitch/client";
import { recordEvent } from "@/lib/sessions/service";
import type { GsSession } from "@/lib/sessions/types";
import type { RecapPayload } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import type {
  AdapterCapability,
  AdapterResult,
  AnnouncementContent,
  ConnectionHealth,
  ParticipantResolution,
  PlatformAdapter,
  StreamStatusResult,
} from "@/lib/adapters/types";

// ----- Connection row shape ------------------------------------------------

interface TwitchConnectionRow {
  user_id: string;
  twitch_user_id: string;
  twitch_login: string | null;
  twitch_display_name: string | null;
  overlay_token: string | null;
  channel_points_enabled: boolean | null;
  channel_point_reward_id: string | null;
  bot_authorized: boolean | null;
  token_expires_at: string | null;
  scopes: string[] | null;
}

const SUPPORTED_CAPABILITIES: AdapterCapability[] = [
  "chat_send",
  "chat_receive",
  "channel_points",
  "announce",
  "participant_join",
  "stream_status",
];

export class TwitchAdapter implements PlatformAdapter {
  readonly platform = "twitch" as const;
  readonly sessionId: string;
  readonly ownerUserId: string;

  private connection: TwitchConnectionRow | null = null;
  private connectionFetched = false;
  private botUserId: string | undefined;

  constructor(args: { sessionId: string; ownerUserId: string }) {
    this.sessionId = args.sessionId;
    this.ownerUserId = args.ownerUserId;
    this.botUserId = process.env.TWITCH_BOT_USER_ID;
  }

  hasCapability(capability: AdapterCapability): boolean {
    return SUPPORTED_CAPABILITIES.includes(capability);
  }

  // -------- Lifecycle hooks ------------------------------------------------

  /**
   * Posts a brief "Session started" chat message. Phase 3A scope: the hook
   * fires; Phase 4 may extend the announcement with module info, channel
   * point reward setup, etc.
   */
  async onSessionActivated(session: GsSession): Promise<void> {
    const conn = await this.requireConnection();
    if (!conn || !this.botUserId) return;
    const game = (session.config as { game?: string }).game;
    const message = game
      ? `🎲 GameShuffle session started — game: ${formatGameLabel(game)}. Type !gs-help for commands.`
      : "🎲 GameShuffle session started. Type !gs-help for commands.";
    await sendChatMessage({
      broadcasterId: conn.twitch_user_id,
      senderId: this.botUserId,
      message,
    });
  }

  /** Phase 3A: no-op. Phase 4 may add a "wrap-up starting" chat notice. */
  async onSessionEnding(_session: GsSession): Promise<void> {
    // intentional no-op
  }

  /** Phase 3A: no-op. Adapter doesn't need to act between wrap_up and recap. */
  async onWrapUpComplete(_session: GsSession): Promise<void> {
    // intentional no-op
  }

  /**
   * Posts the session recap to Twitch chat. Single-line summary keeps it
   * readable in chat; the full payload is durable in `session_events`
   * for richer surfaces (Hub, future post-stream summary email).
   */
  async onRecapReady(_session: GsSession, recap: RecapPayload): Promise<void> {
    const conn = await this.requireConnection();
    if (!conn || !this.botUserId) return;
    const minutes = Math.floor(recap.duration_seconds / 60);
    const message = `🎲 Session ended — ${recap.participant_count} participant${recap.participant_count === 1 ? "" : "s"}, ${recap.shuffle_count} shuffle${recap.shuffle_count === 1 ? "" : "s"}, ${minutes}m total. Thanks for playing!`;
    await sendChatMessage({
      broadcasterId: conn.twitch_user_id,
      senderId: this.botUserId,
      message,
    });
  }

  /** Phase 3A: no-op. The recap message above already covered the audience-facing close. */
  async onSessionEnded(_session: GsSession): Promise<void> {
    // intentional no-op
  }

  // -------- Direct actions -------------------------------------------------

  async postChatMessage(message: string): Promise<AdapterResult> {
    const conn = await this.requireConnection();
    if (!conn) return adapterError("twitch_connection_not_found", false);
    if (!this.botUserId) return adapterError("twitch_bot_user_id_unset", false);
    try {
      await sendChatMessage({
        broadcasterId: conn.twitch_user_id,
        senderId: this.botUserId,
        message,
      });
      return { ok: true };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      // Crude retryability heuristic: 401/403 = auth issue (not retryable);
      // everything else is treated as transient. Phase 5+ may revisit with
      // proper Helix error code mapping.
      const retryable = !/401|403|invalid_token|unauthorized/i.test(errMessage);
      return adapterError(errMessage, retryable);
    }
  }

  /**
   * Twitch chat is plain text — the announcement title + body collapse
   * to a single chat post. Rich embeds aren't a Twitch concept (Discord
   * is). Returns ok with a structured representation in metadata so a
   * caller can verify the rendered shape.
   */
  async postAnnouncement(content: AnnouncementContent): Promise<AdapterResult> {
    const lines: string[] = [`📣 ${content.title}`, content.body];
    for (const f of content.fields ?? []) {
      lines.push(`${f.label}: ${f.value}`);
    }
    if (content.cta) {
      lines.push(`${content.cta.label}: ${content.cta.url}`);
    }
    const text = lines.join(" — ");
    const result = await this.postChatMessage(text);
    if (result.ok) {
      return {
        ok: true,
        metadata: { rendered_as: "chat_text", original: content },
      };
    }
    return result;
  }

  /**
   * Looks up a Twitch viewer by user ID. Phase 3A returns the cached
   * display name from a user's existing participant row when one exists;
   * otherwise issues a Helix `/users` call. For now (Phase 3A), only the
   * "already a participant" path is implemented — Helix lookup would
   * require new SDK helpers and is deferred to Phase 3B / 4 when the
   * use case lands.
   */
  async resolveParticipant(
    platformUserId: string
  ): Promise<ParticipantResolution | null> {
    const admin = createServiceClient();
    const { data } = await admin
      .from("session_participants")
      .select("display_name, is_broadcaster, metadata")
      .eq("session_id", this.sessionId)
      .eq("platform", "twitch")
      .eq("platform_user_id", platformUserId)
      .maybeSingle();
    if (!data) return null;
    return {
      platformUserId,
      displayName: (data.display_name as string | null) ?? platformUserId,
      isBroadcaster: !!data.is_broadcaster,
    };
  }

  async checkStreamStatus(): Promise<StreamStatusResult> {
    const conn = await this.requireConnection();
    if (!conn) return { isLive: false };
    try {
      const streams = await getStreamsByUserIds([conn.twitch_user_id]);
      const stream = streams[0];
      if (!stream) return { isLive: false };
      const channelInfo = await getChannelInfo(conn.twitch_user_id);
      return {
        isLive: true,
        gameId: stream.game_id,
        gameName: channelInfo?.game_name,
        title: channelInfo?.title,
      };
    } catch (err) {
      console.error("[TwitchAdapter.checkStreamStatus] Helix call failed", err);
      return { isLive: false };
    }
  }

  async validateConnection(): Promise<ConnectionHealth> {
    const conn = await this.requireConnection();
    if (!conn) {
      return {
        healthy: false,
        reason: "Twitch is not connected for this account.",
        userActionRequired: true,
      };
    }
    if (!conn.bot_authorized) {
      return {
        healthy: false,
        reason: "Bot consent missing — re-authorize Twitch to grant channel:bot.",
        userActionRequired: true,
      };
    }
    if (conn.token_expires_at) {
      const expiresMs = Date.parse(conn.token_expires_at);
      // Sub-5min token life is a soft warning, not unhealthy. Token
      // refresh happens lazily inside the Twitch SDK on next call.
      if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
        return {
          healthy: false,
          reason: "Twitch access token expired. Reconnect to refresh.",
          userActionRequired: true,
        };
      }
    }
    return { healthy: true };
  }

  // -------- Internal -------------------------------------------------------

  /** Lazy-fetch the streamer's connection row, cached on the instance. */
  private async requireConnection(): Promise<TwitchConnectionRow | null> {
    if (this.connectionFetched) return this.connection;
    const admin = createServiceClient();
    const { data } = await admin
      .from("twitch_connections")
      .select(
        "user_id, twitch_user_id, twitch_login, twitch_display_name, overlay_token, channel_points_enabled, channel_point_reward_id, bot_authorized, token_expires_at, scopes"
      )
      .eq("user_id", this.ownerUserId)
      .maybeSingle();
    this.connection = (data as TwitchConnectionRow | null) ?? null;
    this.connectionFetched = true;
    return this.connection;
  }

  /**
   * Convenience for callers that need the broadcaster's Twitch IDs
   * (commands/, webhook handlers) without doing the connection lookup
   * themselves. Returns null when the connection row is missing.
   */
  async getConnection(): Promise<TwitchConnectionRow | null> {
    return this.requireConnection();
  }

  /** Bot's Twitch user ID, used as `senderId` for outgoing chat. */
  getBotUserId(): string | undefined {
    return this.botUserId;
  }

  /**
   * Records an audit-log entry that this adapter performed an action.
   * Used by both lifecycle hooks (`adapter_call` events) and direct
   * actions when callers want the audit trail. Failure recording is
   * the dispatcher's responsibility — see dispatchLifecycleEvent.
   */
  async recordAdapterCall(
    eventType: typeof SESSION_EVENT_TYPES.adapter_call,
    payload: Record<string, unknown>
  ): Promise<void> {
    await recordEvent({
      sessionId: this.sessionId,
      eventType,
      actorType: "system",
      actorId: `adapter:${this.platform}`,
      payload,
    });
  }
}

// ----- Helpers -------------------------------------------------------------

function adapterError(error: string, retryable: boolean): AdapterResult {
  return { ok: false, error, retryable };
}

function formatGameLabel(slug: string): string {
  if (slug === "mario-kart-8-deluxe") return "Mario Kart 8 Deluxe";
  if (slug === "mario-kart-world") return "Mario Kart World";
  return slug;
}
