/**
 * YouTubeAdapter — concrete `PlatformAdapter` for YouTube Live integrations.
 *
 * Mirrors `TwitchAdapter`, with the platform differences that matter:
 *
 *   - **Chat posts come from the streamer's OWN channel**, not a shared bot.
 *     YouTube's liveChatMessages.insert authenticates as the connected channel
 *     (there's no app-token "post on the bot's behalf" like Twitch). So the
 *     GameShuffle voice on YouTube is the streamer's channel account.
 *   - **No channel points.** YouTube's equivalents (memberships, Super Chat)
 *     are a different model; not exposed here.
 *   - **Chat is READ by polling** (see the chat poller / dispatcher notes),
 *     not via push. The adapter still declares `chat_receive` so the command
 *     surface can attach once the poller is wired.
 *
 * The active `liveChatId` is discovered per broadcast: prefer the value cached
 * on the connection row (written by the poller / status check), else resolve it
 * live via `getActiveLiveBroadcast`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getValidYouTubeAccessToken, getYouTubeConnection } from "@/lib/youtube/connection";
import {
  getActiveLiveBroadcast,
  insertLiveChatMessage,
} from "@/lib/youtube/client";
import type { GsSession } from "@/lib/sessions/types";
import type { RecapPayload } from "@/lib/sessions/service";
import type {
  AdapterCapability,
  AdapterResult,
  AnnouncementContent,
  ConnectionHealth,
  ParticipantResolution,
  PlatformAdapter,
  StreamStatusResult,
} from "@/lib/adapters/types";

const SUPPORTED_CAPABILITIES: AdapterCapability[] = [
  "chat_send",
  "chat_receive",
  "announce",
  "participant_join",
  "stream_status",
];

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform = "youtube" as const;
  readonly sessionId: string;
  readonly ownerUserId: string;

  /** Cached valid access token for the life of this adapter instance. */
  private accessToken: string | null | undefined;
  /** Cached active liveChatId. `undefined` = not looked up; `null` = looked up
   *  and the channel isn't live. */
  private liveChatId: string | null | undefined;

  constructor(args: { sessionId: string; ownerUserId: string }) {
    this.sessionId = args.sessionId;
    this.ownerUserId = args.ownerUserId;
  }

  hasCapability(capability: AdapterCapability): boolean {
    return SUPPORTED_CAPABILITIES.includes(capability);
  }

  // -------- Lifecycle hooks ------------------------------------------------

  async onSessionActivated(session: GsSession): Promise<void> {
    const game = (session.config as { game?: string }).game;
    const message = game
      ? `🎲 GameShuffle session started. Game: ${formatGameLabel(game)}. Type !gs-help for commands.`
      : "🎲 GameShuffle session started. Type !gs-help for commands.";
    await this.postChatMessage(message);
  }

  async onSessionEnding(_session: GsSession): Promise<void> {
    // intentional no-op (parity with Twitch)
  }

  async onWrapUpComplete(_session: GsSession): Promise<void> {
    // intentional no-op
  }

  async onRecapReady(_session: GsSession, recap: RecapPayload): Promise<void> {
    const minutes = Math.floor(recap.duration_seconds / 60);
    const message = `🎲 Session ended. ${recap.participant_count} participant${recap.participant_count === 1 ? "" : "s"}, ${recap.shuffle_count} shuffle${recap.shuffle_count === 1 ? "" : "s"}, ${minutes}m total. Thanks for playing!`;
    await this.postChatMessage(message);
  }

  async onSessionEnded(_session: GsSession): Promise<void> {
    // intentional no-op — recap already closed the audience-facing loop
  }

  // -------- Direct actions -------------------------------------------------

  async postChatMessage(message: string): Promise<AdapterResult> {
    const token = await this.getToken();
    if (!token) return adapterError("youtube_not_connected", false);
    const liveChatId = await this.getLiveChatId();
    if (!liveChatId) return adapterError("youtube_not_live", false);
    const res = await insertLiveChatMessage(token, liveChatId, message);
    if (res.ok) return { ok: true, messageId: res.id };
    // 401/403 → auth problem (not retryable); other statuses treated as transient.
    const retryable = res.status !== 401 && res.status !== 403;
    return adapterError(res.error ?? `insert failed (${res.status})`, retryable);
  }

  /** YouTube chat is plain text — the announcement collapses to one post. */
  async postAnnouncement(content: AnnouncementContent): Promise<AdapterResult> {
    const lines: string[] = [`📣 ${content.title}`, content.body];
    for (const f of content.fields ?? []) lines.push(`${f.label}: ${f.value}`);
    if (content.cta) lines.push(`${content.cta.label}: ${content.cta.url}`);
    const result = await this.postChatMessage(lines.join(". "));
    if (result.ok) {
      return { ok: true, metadata: { rendered_as: "chat_text", original: content } };
    }
    return result;
  }

  async resolveParticipant(platformUserId: string): Promise<ParticipantResolution | null> {
    const admin = createServiceClient();
    const { data } = await admin
      .from("session_participants")
      .select("display_name, is_broadcaster")
      .eq("session_id", this.sessionId)
      .eq("platform", "youtube")
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
    const token = await this.getToken();
    if (!token) return { isLive: false };
    try {
      const broadcast = await getActiveLiveBroadcast(token);
      if (!broadcast) return { isLive: false };
      // Cache the discovered liveChatId for subsequent chat posts.
      this.liveChatId = broadcast.liveChatId;
      return { isLive: true, title: broadcast.title };
    } catch (err) {
      console.error("[YouTubeAdapter.checkStreamStatus] API call failed", err);
      return { isLive: false };
    }
  }

  async validateConnection(): Promise<ConnectionHealth> {
    const conn = await getYouTubeConnection(this.ownerUserId);
    if (!conn || !conn.youtube_channel_id) {
      return {
        healthy: false,
        reason: "YouTube is not connected for this account.",
        userActionRequired: true,
      };
    }
    const token = await this.getToken();
    if (!token) {
      return {
        healthy: false,
        reason: "YouTube authorization expired. Reconnect your channel.",
        userActionRequired: true,
      };
    }
    return { healthy: true };
  }

  // -------- Internal -------------------------------------------------------

  private async getToken(): Promise<string | null> {
    if (this.accessToken !== undefined) return this.accessToken;
    this.accessToken = await getValidYouTubeAccessToken(this.ownerUserId);
    return this.accessToken;
  }

  /** Resolve the active liveChatId: cached row value first, else discover it. */
  private async getLiveChatId(): Promise<string | null> {
    if (this.liveChatId !== undefined) return this.liveChatId;
    const conn = await getYouTubeConnection(this.ownerUserId);
    if (conn?.active_live_chat_id) {
      this.liveChatId = conn.active_live_chat_id;
      return this.liveChatId;
    }
    const token = await this.getToken();
    if (!token) {
      this.liveChatId = null;
      return null;
    }
    try {
      const broadcast = await getActiveLiveBroadcast(token);
      this.liveChatId = broadcast?.liveChatId ?? null;
    } catch {
      this.liveChatId = null;
    }
    return this.liveChatId;
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
