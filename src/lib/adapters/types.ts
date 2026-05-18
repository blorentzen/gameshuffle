/**
 * PlatformAdapter — the platform-agnostic interface every concrete adapter
 * implements (TwitchAdapter today; Phase 3B adds DiscordAdapter; future
 * Kick + YouTube). Per gs-pro-v1-phase-3a-spec.md §4.
 *
 * Adapter scope is per-session, per-platform: one instance lives for the
 * duration of a session's attachment to a platform. The dispatcher
 * (`src/lib/adapters/dispatcher.ts`) constructs them from
 * `gs_sessions.platforms` JSONB, routes lifecycle events to them, and
 * isolates per-adapter failures so one platform's outage doesn't block
 * others.
 *
 * Two surfaces:
 *
 *   - **Lifecycle hooks** (onSessionActivated, onSessionEnding,
 *     onWrapUpComplete, onRecapReady, onSessionEnded) — called by the
 *     dispatcher when the session's lifecycle progresses
 *
 *   - **Direct actions** (postChatMessage, postAnnouncement,
 *     resolveParticipant, checkStreamStatus, validateConnection) — called
 *     by service-layer code (chat command handlers, route handlers, etc.)
 *     when they need the platform to do something specific
 *
 * AdapterResult is structured rather than throw-based so callers can
 * distinguish recoverable failures (rate limits) from unrecoverable
 * (auth revoked) without parsing exception messages.
 */

import type { GsSession } from "@/lib/sessions/types";
import type { RecapPayload } from "@/lib/sessions/service";

export type AdapterPlatform = "twitch" | "discord" | "youtube" | "kick";

export type AdapterCapability =
  /** Can post messages to chat. */
  | "chat_send"
  /** Can subscribe to incoming chat messages. */
  | "chat_receive"
  /** Can create / manage channel-point rewards. */
  | "channel_points"
  /** Can post audience-facing announcements (rich embeds, etc.). */
  | "announce"
  /** Can resolve viewers as session participants from the platform's user IDs. */
  | "participant_join"
  /** Can query the streamer's live/offline status. */
  | "stream_status";

/**
 * Per-session, per-platform adapter instance. Instantiated by the
 * dispatcher's `getAdapterForSession` / `getAllAdaptersForSession`.
 */
export interface PlatformAdapter {
  // --- Static identification ---
  readonly platform: AdapterPlatform;
  readonly sessionId: string;
  readonly ownerUserId: string;

  // --- Capability discovery ---
  hasCapability(capability: AdapterCapability): boolean;

  // --- Lifecycle hooks (called by dispatcher in response to session_events) ---
  onSessionActivated(session: GsSession): Promise<void>;
  onSessionEnding(session: GsSession): Promise<void>;
  onWrapUpComplete(session: GsSession): Promise<void>;
  onRecapReady(session: GsSession, recap: RecapPayload): Promise<void>;
  onSessionEnded(session: GsSession): Promise<void>;

  // --- Optional hooks (Phase 1.2+) — dispatcher checks for presence
  // before calling so adapters that don't care can opt out by simply
  // not implementing them. ---
  onActiveGameChanged?(
    session: GsSession,
    payload: { previousGame: string | null; nextGame: string | null },
  ): Promise<void>;
  onPicksBansOpened?(
    session: GsSession,
    payload: { roundId: string; gameSlug: string },
  ): Promise<void>;
  onPicksBansClosed?(
    session: GsSession,
    payload: { roundId: string; gameSlug: string; ballotCount: number },
  ): Promise<void>;

  // --- Direct actions (called by service / chat command layer) ---
  postChatMessage(message: string): Promise<AdapterResult>;
  postAnnouncement(content: AnnouncementContent): Promise<AdapterResult>;
  resolveParticipant(platformUserId: string): Promise<ParticipantResolution | null>;
  checkStreamStatus(): Promise<StreamStatusResult>;

  // --- Connection health ---
  validateConnection(): Promise<ConnectionHealth>;
}

export type AdapterResult =
  | {
      ok: true;
      messageId?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
    };

export interface AnnouncementContent {
  title: string;
  body: string;
  fields?: Array<{ label: string; value: string }>;
  cta?: { label: string; url: string };
}

export interface ParticipantResolution {
  platformUserId: string;
  displayName: string;
  isModerator?: boolean;
  isBroadcaster?: boolean;
}

export type StreamStatusResult =
  | { isLive: true; gameId?: string; gameName?: string; title?: string }
  | { isLive: false };

export type ConnectionHealth =
  | { healthy: true }
  | { healthy: false; reason: string; userActionRequired: boolean };

// ---- Dispatcher event types ---------------------------------------------

export type AdapterDispatchEvent =
  | { type: "session_activated"; session: GsSession }
  | { type: "session_ending"; session: GsSession }
  | { type: "wrap_up_complete"; session: GsSession }
  | { type: "recap_ready"; session: GsSession; recap: RecapPayload }
  | { type: "session_ended"; session: GsSession }
  // Optional-hook events — adapters that don't implement the
  // corresponding method are skipped silently by the dispatcher.
  | {
      type: "active_game_changed";
      session: GsSession;
      previousGame: string | null;
      nextGame: string | null;
    }
  | {
      type: "picks_bans_opened";
      session: GsSession;
      roundId: string;
      gameSlug: string;
    }
  | {
      type: "picks_bans_closed";
      session: GsSession;
      roundId: string;
      gameSlug: string;
      ballotCount: number;
    };

export type DispatchResult =
  | { platform: AdapterPlatform; ok: true }
  | { platform: AdapterPlatform; ok: false; error: string };
