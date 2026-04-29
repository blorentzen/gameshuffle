/**
 * Webhook + handler dedupe helpers — defense against Twitch's at-least-
 * once delivery and the Phase 4A.1 bug where duplicate
 * `channel.chat.message` notifications with different `message_id` values
 * fired the same chat command twice.
 *
 * Layer 1 — `buildChatDedupeKey` produces a composite dedupe key that's
 *   unique to the (broadcaster, sender, text, ~2s window) tuple. The
 *   webhook inserts this alongside the message_id; the unique index on
 *   `dedupe_key` rejects the second notification regardless of its
 *   Twitch-issued message_id.
 *
 * Layer 2 — `isWithinRecentShuffleWindow` is the in-handler idempotency
 *   check. After the webhook dedupe (which can still miss if two
 *   notifications straddle a bucket boundary), the shuffle handler
 *   queries session_events for any prior shuffle event for this
 *   participant in the last few seconds; if found, silent no-op.
 *
 * Both layers are pure functions so the test script can verify the
 * logic without a database.
 */

import { createHash } from "node:crypto";

/** Bucket size for the dedupe key timestamp. 2s gives us a single bucket
 * for any pair of duplicate notifications observed in the wild (~40-66ms
 * apart). Boundary straddles fall through to Layer 2. */
const DEDUPE_BUCKET_MS = 2000;

/** Window inside which a second shuffle event for the same participant
 * is treated as a duplicate firing — silent no-op. */
export const SHUFFLE_IDEMPOTENCY_WINDOW_MS = 2000;

export interface ChatDedupeKeyInput {
  /** Twitch user ID of the channel owner the message was sent in. */
  broadcasterId: string;
  /** Twitch user ID of the chatter. */
  senderId: string;
  /** Raw chat text — hashed, not stored verbatim. */
  text: string;
  /** Wall-clock timestamp in ms (use HEADER_TIMESTAMP from the EventSub
   * delivery, not Date.now() — duplicate notifications share the
   * Twitch-side timestamp closely enough that the bucket lines up). */
  timestampMs: number;
}

/**
 * Build the composite dedupe key for a chat-message webhook delivery.
 *
 * Two webhook deliveries for the same logical chat message produce the
 * same key when:
 *   - same broadcaster + sender + text
 *   - timestamps within the same `DEDUPE_BUCKET_MS` window
 *
 * Twitch's observed retry latency (~40-66ms) is far below the bucket
 * size, so the only failure mode is a delivery pair straddling a bucket
 * boundary (~0.05% of cases). Layer 2 covers that.
 */
export function buildChatDedupeKey(input: ChatDedupeKeyInput): string {
  if (!Number.isFinite(input.timestampMs)) {
    throw new Error("buildChatDedupeKey: non-finite timestampMs");
  }
  const hash = createHash("sha256").update(input.text).digest("hex").slice(0, 16);
  const bucket = Math.floor(input.timestampMs / DEDUPE_BUCKET_MS);
  return `chat:${input.broadcasterId}:${input.senderId}:${hash}:${bucket}`;
}

/**
 * Decide whether a recent shuffle event makes the current shuffle a
 * duplicate. Pure function so the tests can exercise it without DB
 * access.
 */
export function isWithinRecentShuffleWindow(args: {
  /** ISO timestamp of the prior shuffle event, or null if none found. */
  recentEventCreatedAt: string | null | undefined;
  /** Current wall clock in ms. */
  nowMs: number;
  /** Override for tests. Defaults to `SHUFFLE_IDEMPOTENCY_WINDOW_MS`. */
  windowMs?: number;
}): boolean {
  if (!args.recentEventCreatedAt) return false;
  const eventMs = Date.parse(args.recentEventCreatedAt);
  if (!Number.isFinite(eventMs)) return false;
  const diff = args.nowMs - eventMs;
  if (diff < 0) return false; // Future-dated event; treat as not-recent.
  return diff < (args.windowMs ?? SHUFFLE_IDEMPOTENCY_WINDOW_MS);
}
