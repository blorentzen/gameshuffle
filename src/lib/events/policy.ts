/**
 * Default fan-out policy table — Spec 02 §4.
 *
 * Defaults must be sane out of the box: "a streamer who configures
 * nothing should get reasonable behavior — announcements for
 * session-level events, silent for per-user state churn." This file
 * encodes that rule for every `DomainEventType`.
 *
 * Two layered sources of truth, resolved by `resolvePolicy`:
 *
 *   1. **`DEFAULT_POLICY_TABLE`** (this file) — hardcoded per-event-
 *      type defaults. The product opinion baked into the engine.
 *
 *   2. **Per-streamer overrides** — read from
 *      `gs_fanout_policies` (table not yet shipped — migration
 *      planned per Spec 02 consult-before-committing trigger).
 *      `resolveStoredOverride` is a stub that returns `null` until
 *      the migration lands; once the table exists, the stub becomes
 *      a `select` and the publisher behavior is unchanged for
 *      streamers without an override row.
 *
 * The split is intentional. The defaults table ships now so the
 * engine has somewhere to land; the override mechanism ships
 * separately when there's a configure surface for streamers to
 * write to it. Per Spec 02 §9, the configure UX is deferred to the
 * UX track — engine-first.
 */

import type {
  DomainEvent,
  DomainEventType,
  FanOutPolicy,
} from "./types";

/**
 * Hardcoded default policy per event type. The product opinion: tell
 * everyone about session-level moments, stay quiet about per-user
 * state churn that would create chat noise.
 *
 *   - **Session-level moments → announce both platforms.** When a
 *     market opens, a bounty drops, a session is scheduled — these
 *     are the streamer's "tell viewers something is happening" beats,
 *     and both Twitch chat AND Discord (for raid-the-Discord
 *     announcements + lobby pre-roll) want to know.
 *
 *   - **Per-user state churn → silent.** Lobby join / leave fire
 *     constantly; broadcasting each one would flood Twitch chat and
 *     spam Discord. They get silent fan-out: the audit row lands,
 *     no chat post. A streamer can opt in to a Discord roster feed
 *     by adding an override (`targets: ["discord"]`) once the
 *     configure surface ships.
 *
 *   - **`session_scheduled` → Discord only (default).** The whole
 *     point of scheduling is the heads-up announcement before the
 *     stream starts. Twitch chat doesn't exist yet at scheduled
 *     time; Discord is the natural surface.
 *
 *   - **`session_opened` (`auto_open` path) → both.** When a
 *     scheduled session auto-opens, both Twitch (now-live viewers)
 *     and Discord (lobby-watching folks) want the "go time" ping.
 *     The manual-open path falls through to the same default since
 *     a streamer manually opening at the scheduled time is the same
 *     viewer experience — they may have changed their mind about
 *     auto-opening but not about announcing.
 */
export const DEFAULT_POLICY_TABLE: Readonly<
  Record<DomainEventType, FanOutPolicy>
> = {
  // Per-user state churn — silent by default. Streamer opts in to a
  // platform-specific roster feed via an override row.
  lobby_joined: { targets: [], mode: "silent" },
  lobby_left: { targets: [], mode: "silent" },

  // Session-level market moments — announce both platforms.
  market_opened: { targets: ["twitch", "discord"], mode: "announce" },
  market_locked: { targets: ["twitch", "discord"], mode: "announce" },
  market_resolved: { targets: ["twitch", "discord"], mode: "announce" },

  // Bounty open is the streamer setting a payout — announce.
  bounty_opened: { targets: ["twitch", "discord"], mode: "announce" },

  // Schedule lives ahead of the stream — Discord is the natural
  // channel since Twitch chat doesn't exist yet at scheduled time.
  session_scheduled: { targets: ["discord"], mode: "announce" },

  // Announcement at the scheduled moment for `announce_only` mode —
  // streamer hasn't necessarily started yet. Discord-only by
  // default (same logic as session_scheduled — Twitch chat may not
  // exist yet); streamer can override to add Twitch if they want a
  // "next session" line during the current stream.
  session_announced: { targets: ["discord"], mode: "announce" },

  // Session opening is the go-live moment — both surfaces light up.
  session_opened: { targets: ["twitch", "discord"], mode: "announce" },
};

/**
 * Look up a per-streamer override for an event type. Returns the
 * stored policy if one exists, or `null` to fall through to the
 * default.
 *
 * **Stub during the engine-first ship.** The publisher already
 * threads the override through; this returns `null` until the
 * `gs_fanout_policies` migration lands. Once the table exists,
 * implementation switches to a `select` against
 * `gs_fanout_policies(owner_user_id, event_type)`.
 *
 * Keeping the stub in place ensures the publisher's call shape is
 * stable across the migration — when the table lands, no caller
 * needs to change.
 */
export async function resolveStoredOverride(
  _ownerUserId: string,
  _eventType: DomainEventType,
): Promise<FanOutPolicy | null> {
  // TODO(Spec 02 follow-up): replace with a `select` from
  // gs_fanout_policies once that migration lands. Until then every
  // streamer gets the hardcoded default — which is sane per §4.
  return null;
}

/**
 * Compute the effective fan-out policy for an event. Layers the
 * stored per-streamer override (if any) on top of the hardcoded
 * default. The publisher calls this once per event.
 *
 *   resolvedPolicy = override (per streamer) ?? default (per event type)
 *
 * Returns a frozen object — callers MUST treat the policy as
 * read-only since it's cached and shared across handlers.
 */
export async function resolvePolicy(
  event: DomainEvent,
): Promise<FanOutPolicy> {
  const override = await resolveStoredOverride(
    event.actor.ownerUserId,
    event.type,
  );
  const base = override ?? DEFAULT_POLICY_TABLE[event.type];
  return Object.freeze({
    targets: Object.freeze([...base.targets]),
    mode: base.mode,
  }) as FanOutPolicy;
}
