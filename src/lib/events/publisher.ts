/**
 * Outbound domain-event publisher — Spec 02 §4.
 *
 * The seam between "GS thing happened" and "tell the other platforms."
 * Callers fire `publishDomainEvent({ type, actor, payload })` and the
 * publisher:
 *
 *   1. Resolves the effective `FanOutPolicy` (default + per-streamer
 *      override) via `resolvePolicy`.
 *   2. For each `targets[]` platform, constructs the existing
 *      `TwitchAdapter` / `DiscordAdapter` and calls its
 *      `postChatMessage` (Twitch) / `postAnnouncement` (Discord)
 *      method with formatter output. Per-leg failures are isolated.
 *   3. Records a `session_events.fanout_dispatched` row capturing
 *      the policy + per-leg outcome — same audit trail the existing
 *      `dispatchLifecycleEvent` writes for lifecycle hooks.
 *
 * Mode semantics:
 *   - `"silent"`  — record audit, send NOTHING. Lets streamers see
 *                   what was suppressed (e.g. tactile lobby joins)
 *                   without flooding chat.
 *   - `"announce"` — call the platform's chat/post path with the
 *                    formatter's output. Empty `targets[]` is legal
 *                    and means "policy resolved to no platforms"
 *                    (silent equivalent at the routing layer).
 *
 * The publisher does NOT mutate session state, write to economy
 * ledgers, or trigger more domain events. It's a one-way outbound
 * router — if it throws or fails, the originating handler's state is
 * already committed; the audit trail records the fan-out outcome
 * for later reconcile.
 *
 * IMPORTANT — this engine ships ahead of any handler that calls it.
 * No existing user-facing behavior changes until handlers migrate to
 * `publishDomainEvent(...)`. That migration is per-handler follow-up
 * work; the engine being available first is Spec 02 §4's "policy
 * field ships with the publisher from the start" — hard to retrofit,
 * so we don't.
 */

import "server-only";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import {
  getAdapterForSession,
  getAdapterForOwner,
} from "@/lib/adapters/dispatcher";
import type {
  AdapterPlatform,
  AdapterResult,
  PlatformAdapter,
} from "@/lib/adapters/types";
import type {
  DomainEvent,
  PublishLegResult,
  PublishResult,
} from "./types";
import { resolvePolicy } from "./policy";
import { FORMATTERS } from "./formatters";

// ---------------------------------------------------------------------------
// Adapter resolution + dispatch
// ---------------------------------------------------------------------------

/**
 * Resolve the adapter for a single (event, platform) leg. Some events
 * have a session id and some don't (e.g. session_scheduled fires
 * before the session row exists for the open transition's session).
 *
 *   - Has sessionId → use the existing `getAdapterForSession` so
 *     adapter capabilities + attached-platform logic stay in sync.
 *   - No sessionId  → use `getAdapterForOwner` (added below in the
 *     dispatcher) which constructs an adapter from the owner's
 *     account-level routing config.
 */
async function adapterForLeg(
  event: DomainEvent,
  platform: AdapterPlatform,
): Promise<PlatformAdapter | null> {
  if (event.actor.sessionId) {
    return await getAdapterForSession(event.actor.sessionId, platform);
  }
  return await getAdapterForOwner(event.actor.ownerUserId, platform);
}

/**
 * Dispatch the event to one platform. Twitch uses `postChatMessage`
 * (chat line); Discord uses `postAnnouncement` (rich embed). The
 * formatter chooses the per-platform content shape.
 */
async function dispatchLeg(
  event: DomainEvent,
  platform: AdapterPlatform,
): Promise<PublishLegResult> {
  const adapter = await adapterForLeg(event, platform);
  if (!adapter) {
    return {
      platform,
      ok: true,
      skipped: true,
      reason: "no_adapter_attached",
    };
  }

  // Each formatter is keyed off the event type. The discriminated
  // union is preserved by the FORMATTERS map shape; the `never` cast
  // at the call site below silences a TS narrowing limitation
  // around indexed access into the mapped formatter type.
  const formatter = FORMATTERS[event.type];
  let result: AdapterResult;
  try {
    if (platform === "twitch") {
      const text = formatter.twitch(event as never);
      if (text === null) {
        return {
          platform,
          ok: true,
          skipped: true,
          reason: "formatter_returned_null",
        };
      }
      result = await adapter.postChatMessage(text);
    } else if (platform === "discord") {
      const announcement = formatter.discord(event as never);
      if (announcement === null) {
        return {
          platform,
          ok: true,
          skipped: true,
          reason: "formatter_returned_null",
        };
      }
      result = await adapter.postAnnouncement(announcement);
    } else {
      return {
        platform,
        ok: true,
        skipped: true,
        reason: "no_formatter_for_platform",
      };
    }
  } catch (err) {
    return {
      platform,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!result.ok) {
    return { platform, ok: false, error: result.error };
  }
  return { platform, ok: true, skipped: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Publish a domain event. Resolves the fan-out policy, dispatches
 * to each target platform per its mode, writes an audit row, and
 * returns the per-leg outcome.
 *
 * Handlers can fire-and-forget by ignoring the return value; the
 * publisher's failures are all logged + audited and never throw to
 * the caller. Use the return value when the caller wants to react
 * (e.g. show a "couldn't post to Discord" hint to the streamer in
 * the dashboard).
 */
export async function publishDomainEvent(
  event: DomainEvent,
): Promise<PublishResult> {
  const policy = await resolvePolicy(event);

  let legs: PublishLegResult[] = [];

  if (policy.mode === "silent") {
    // Silent — no platform calls. Audit row still lands so the
    // operator can see what was suppressed.
    legs = policy.targets.map((platform) => ({
      platform,
      ok: true as const,
      skipped: true as const,
      reason: "mode_silent",
    }));
  } else {
    // Announce — sequential per-leg dispatch. Sequential (vs
    // parallel) keeps the dispatch order deterministic for audit
    // reads + avoids piling on a rate-limited adapter from N
    // parallel calls.
    for (const platform of policy.targets) {
      legs.push(await dispatchLeg(event, platform));
    }
  }

  // Audit. Best-effort: a publish that fails to record an audit row
  // does NOT throw to the caller — the leg-result return value is
  // the source of truth for the caller, and the catch keeps the
  // publisher one-way.
  if (event.actor.sessionId) {
    try {
      await recordEvent({
        sessionId: event.actor.sessionId,
        eventType: SESSION_EVENT_TYPES.fanout_dispatched,
        actorType: "system",
        actorId: "publisher:domain_event",
        payload: {
          domain_event: event.type,
          policy: {
            targets: [...policy.targets],
            mode: policy.mode,
          },
          legs: legs.map(serializeLeg),
        },
      });
    } catch (err) {
      console.error(
        `[publisher] audit write failed for ${event.type}`,
        err,
      );
    }
  }

  return { policy, legs };
}

/** Strip undefined fields so the audit JSON is compact + greppable. */
function serializeLeg(leg: PublishLegResult): Record<string, unknown> {
  if (leg.ok && leg.skipped) {
    return { platform: leg.platform, ok: true, skipped: true, reason: leg.reason };
  }
  if (leg.ok) {
    return { platform: leg.platform, ok: true };
  }
  return { platform: leg.platform, ok: false, error: leg.error };
}
