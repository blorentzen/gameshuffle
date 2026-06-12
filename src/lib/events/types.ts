/**
 * Domain events + fan-out policy — Spec 02 §4.
 *
 * The seam between "something happened inside GameShuffle" and
 * "tell the other platforms about it." Per Spec 02:
 *
 *   - Outbound only: domain events flow OUT of GS to Twitch / Discord.
 *     Inbound (Twitch EventSub → Supabase) stays on the existing path
 *     in `src/app/api/twitch/webhook` + the realtime overlay.
 *
 *   - Selective fan-out, NOT broadcast-everything: each event carries
 *     a `FanOutPolicy` saying WHICH platforms get it (`targets`) and
 *     WHETHER it's a visible announcement (`mode: "announce"`) or a
 *     state-only no-op (`mode: "silent"`). This is the load-bearing
 *     design choice that prevents chat noise from web-side state
 *     churn (e.g. a tactile lobby join shouldn't spam Twitch).
 *
 *   - Sane defaults baked in (see `src/lib/events/policy.ts`). A
 *     streamer who configures nothing gets reasonable behavior:
 *     announcements for session-level moments (market opened, session
 *     scheduled), silent for per-user state changes (lobby joins).
 *
 * The publisher (`src/lib/events/publisher.ts`) consumes these types.
 * Adapters are the SAME `TwitchAdapter` / `DiscordAdapter` already in
 * `src/lib/adapters/` — the publisher routes through their existing
 * `postChatMessage` / `postAnnouncement` methods rather than adding
 * new adapter hooks.
 */

import type { AdapterPlatform } from "@/lib/adapters/types";

// ---------------------------------------------------------------------------
// Fan-out policy
// ---------------------------------------------------------------------------

/**
 * Spec 02 §4 — visible message vs. state-only. `"announce"` calls the
 * adapter's chat/post path; `"silent"` records the event in audit but
 * sends nothing to chat / Discord. Per-platform output (rich embed vs.
 * chat line) is determined by the event's formatter, not by the mode.
 */
export type FanOutMode = "announce" | "silent";

/**
 * Resolved fan-out policy for a single event. The publisher computes
 * this from the registered default for the event type, layered with
 * any per-streamer override.
 *
 *   - `targets: []` is legal — means "no platform gets this," which
 *     pairs naturally with `mode: "silent"` for events that only need
 *     state-side audit.
 *
 *   - `targets: ["twitch", "discord"]` with `mode: "announce"` is the
 *     canonical "tell everyone" shape.
 *
 *   - The two fields are orthogonal — the publisher checks BOTH:
 *     mode === "silent" short-circuits even if targets are populated
 *     (records audit, sends nothing).
 */
export interface FanOutPolicy {
  targets: ReadonlyArray<AdapterPlatform>;
  mode: FanOutMode;
}

// ---------------------------------------------------------------------------
// Domain event catalog
// ---------------------------------------------------------------------------

/**
 * Catalog of domain events the publisher knows how to route. Adding a
 * new event = adding the variant here + a default in
 * `DEFAULT_POLICY_TABLE` + an entry in the formatter map in
 * `publisher.ts`.
 *
 * Conventions:
 *   - Past-tense verb (`opened`, `joined`, `resolved`) — events
 *     describe something that already happened.
 *   - Underscore-separated to match the existing `session_events`
 *     vocabulary (lobby_joined, market_opened, etc.).
 *   - Each variant carries enough payload that the formatter can
 *     render a complete announcement without a follow-up DB read.
 *
 * Initial set is deliberately small — Spec 02 §8 phases the wiring
 * of existing handlers separately. This file ships the SHAPE; the
 * MIGRATION of existing chat-post code through the publisher is a
 * per-handler follow-up.
 */
export type DomainEventType =
  | "lobby_joined"
  | "lobby_left"
  | "market_opened"
  | "market_locked"
  | "market_resolved"
  | "bounty_opened"
  | "session_scheduled"
  | "session_opened";

/**
 * The owner identity every event carries — the streamer whose context
 * the event belongs to. Lets the publisher route to the correct
 * adapter without a session lookup per event.
 */
export interface EventActor {
  /** GS `auth.users.id` of the streamer this event belongs to. */
  ownerUserId: string;
  /** Streamer's canonical slug (used by formatters for !live-style
   *  link generation). */
  streamerSlug: string | null;
  /** Active session id, when the event has one. Null for account-
   *  level events (e.g. session_scheduled before a session row
   *  exists). */
  sessionId: string | null;
}

// ---- Per-event-type payload shapes -----------------------------------------

interface ParticipantInfo {
  platformUserId: string;
  displayName: string;
  /** Where the join / leave originated. Determines the default policy
   *  (a web tactile join is silent; a Twitch chat join might trip a
   *  Discord roster feed). */
  source: "twitch" | "discord" | "web";
}

export interface LobbyJoinedPayload {
  participant: ParticipantInfo;
  /** Lobby size after the join. Formatters can render this in chat. */
  lobbySize: number;
}

export interface LobbyLeftPayload {
  participant: ParticipantInfo;
  lobbySize: number;
  reason: "voluntary" | "kicked" | "session_ended";
}

export interface MarketOpenedPayload {
  marketId: string;
  question: string;
  outcomes: ReadonlyArray<{ key: string; label: string }>;
  /** Auto-lock time if the streamer set one; null for manual lock. */
  lockAt: string | null;
}

export interface MarketLockedPayload {
  marketId: string;
  question: string;
  /** Total tokens staked across all outcomes at lock time. */
  totalStaked: number;
}

export interface MarketResolvedPayload {
  marketId: string;
  question: string;
  winningOutcomeKey: string;
  winningOutcomeLabel: string;
  /** Total tokens distributed to winners. */
  payoutTotal: number;
  /** Number of viewers who got paid. */
  payoutCount: number;
}

export interface BountyOpenedPayload {
  bountyId: string;
  amount: number;
  description: string;
}

export interface SessionScheduledPayload {
  /** ISO timestamp the session is scheduled to open. */
  startAt: string;
  /** Whether `scheduled → open` will fire automatically or wait for
   *  manual host action — per Spec 02 §5. */
  openMode: "announce_only" | "auto_open";
  /** Optional one-line description / theme the streamer set. */
  description: string | null;
}

export interface SessionOpenedPayload {
  /** Game slug the session is configured for, or null for sessions
   *  that haven't picked a category yet (no Twitch category set). */
  randomizerSlug: string | null;
  /** Whether this session reached `open` via the auto-open path on
   *  a scheduled session, or via manual streamer action. */
  via: "auto_open" | "manual" | "stream_online";
}

// ---- Discriminated union over the catalog ----------------------------------

export type DomainEvent =
  | { type: "lobby_joined"; actor: EventActor; payload: LobbyJoinedPayload }
  | { type: "lobby_left"; actor: EventActor; payload: LobbyLeftPayload }
  | { type: "market_opened"; actor: EventActor; payload: MarketOpenedPayload }
  | { type: "market_locked"; actor: EventActor; payload: MarketLockedPayload }
  | { type: "market_resolved"; actor: EventActor; payload: MarketResolvedPayload }
  | { type: "bounty_opened"; actor: EventActor; payload: BountyOpenedPayload }
  | { type: "session_scheduled"; actor: EventActor; payload: SessionScheduledPayload }
  | { type: "session_opened"; actor: EventActor; payload: SessionOpenedPayload };

// ---------------------------------------------------------------------------
// Publisher result
// ---------------------------------------------------------------------------

/**
 * Outcome of a single platform's leg of a publish. The publisher
 * returns an array of these — one per `targets[]` entry — so callers
 * can see which platforms received the event and which failed.
 */
export type PublishLegResult =
  | { platform: AdapterPlatform; ok: true; skipped: false }
  | { platform: AdapterPlatform; ok: true; skipped: true; reason: string }
  | { platform: AdapterPlatform; ok: false; error: string };

export interface PublishResult {
  /** Effective policy that was applied — useful for tests + audit. */
  policy: FanOutPolicy;
  /** Per-target outcome. Empty when policy.mode === "silent" or
   *  policy.targets is empty (the event still records to audit). */
  legs: ReadonlyArray<PublishLegResult>;
}
