/**
 * Adapter dispatcher — the seam between session lifecycle (Phase 2) and
 * platform-specific behavior (Phase 3A+ adapters). Per
 * gs-pro-v1-phase-3a-spec.md §6.
 *
 * Responsibilities:
 *
 *   1. Look up a session row + walk its `platforms` JSONB to figure out
 *      which adapter classes to instantiate
 *   2. Route lifecycle events (`session_activated`, `session_ending`,
 *      `wrap_up_complete`, `recap_ready`, `session_ended`) to every
 *      attached adapter, isolating per-adapter failures
 *   3. Audit dispatch outcomes to `session_events` with
 *      `event_type='adapter_call'` for successes and
 *      `event_type='adapter_call_failed'` for exceptions — Phase 3B can
 *      use these to retry or replay
 *
 * Failure semantics: if `TwitchAdapter.onRecapReady` throws, the
 * dispatcher logs, writes the failure event, and continues with other
 * adapters. The durable record is the `session_events` row for the
 * triggering event (e.g. `recap_ready`), which is written by the
 * lifecycle layer before dispatch fires. Adapters are best-effort
 * delivery; the audit log is the source of truth.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { TwitchAdapter } from "./twitch";
import type {
  AdapterDispatchEvent,
  AdapterPlatform,
  DispatchResult,
  PlatformAdapter,
} from "./types";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";

interface MinimalSessionRow {
  id: string;
  owner_user_id: string;
  platforms: Record<string, unknown> | null;
}

/**
 * Inspect a session's `platforms` JSONB and return the list of platform
 * identifiers we know how to construct adapters for. v1 only recognizes
 * `streaming.type === 'twitch'`. Phase 3B adds `discord.*`. Future
 * Kick/YouTube extend this same walker.
 */
function listAttachedPlatforms(
  platforms: Record<string, unknown> | null
): AdapterPlatform[] {
  if (!platforms) return [];
  const attached: AdapterPlatform[] = [];

  const streaming = platforms.streaming as { type?: string } | undefined;
  if (streaming?.type === "twitch") attached.push("twitch");
  // Phase 3B extends here:
  // if (platforms.discord) attached.push('discord');

  return attached;
}

async function fetchSessionRow(sessionId: string): Promise<MinimalSessionRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_sessions")
    .select("id, owner_user_id, platforms")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as MinimalSessionRow | null) ?? null;
}

/**
 * Construct one adapter for a session + platform pair. Returns null if the
 * session doesn't exist or the requested platform isn't attached.
 */
export async function getAdapterForSession(
  sessionId: string,
  platform: AdapterPlatform
): Promise<PlatformAdapter | null> {
  const session = await fetchSessionRow(sessionId);
  if (!session) return null;
  const attached = listAttachedPlatforms(session.platforms);
  if (!attached.includes(platform)) return null;
  return instantiateAdapter(platform, session.id, session.owner_user_id);
}

/**
 * Construct every adapter attached to the session. v1 returns 0 or 1
 * adapters (Twitch only); future multi-streaming Pro+ sessions return
 * 2+ for Twitch + Kick + YouTube combinations.
 */
export async function getAllAdaptersForSession(
  sessionId: string
): Promise<PlatformAdapter[]> {
  const session = await fetchSessionRow(sessionId);
  if (!session) return [];
  const attached = listAttachedPlatforms(session.platforms);
  return attached
    .map((p) => instantiateAdapter(p, session.id, session.owner_user_id))
    .filter((a): a is PlatformAdapter => a !== null);
}

function instantiateAdapter(
  platform: AdapterPlatform,
  sessionId: string,
  ownerUserId: string
): PlatformAdapter | null {
  if (platform === "twitch") {
    return new TwitchAdapter({ sessionId, ownerUserId });
  }
  // Phase 3B:
  // if (platform === 'discord') return new DiscordAdapter({ sessionId, ownerUserId });
  return null;
}

/**
 * Route a lifecycle event to every adapter attached to the session.
 * Per-adapter failures are isolated — one platform throwing doesn't
 * block the others.
 *
 * Each call is audited:
 *   - success → `session_events.adapter_call` with payload
 *     `{ platform, hook, ok: true }`
 *   - failure → `session_events.adapter_call_failed` with payload
 *     `{ platform, hook, error }`
 */
export async function dispatchLifecycleEvent(
  event: AdapterDispatchEvent
): Promise<DispatchResult[]> {
  const adapters = await getAllAdaptersForSession(event.session.id);
  if (adapters.length === 0) return [];

  const results: DispatchResult[] = [];
  for (const adapter of adapters) {
    const hook = hookNameFor(event.type);
    try {
      switch (event.type) {
        case "session_activated":
          await adapter.onSessionActivated(event.session);
          break;
        case "session_ending":
          await adapter.onSessionEnding(event.session);
          break;
        case "wrap_up_complete":
          await adapter.onWrapUpComplete(event.session);
          break;
        case "recap_ready":
          await adapter.onRecapReady(event.session, event.recap);
          break;
        case "session_ended":
          await adapter.onSessionEnded(event.session);
          break;
      }
      results.push({ platform: adapter.platform, ok: true });
      await recordEvent({
        sessionId: event.session.id,
        eventType: SESSION_EVENT_TYPES.adapter_call,
        actorType: "system",
        actorId: `adapter:${adapter.platform}`,
        payload: { platform: adapter.platform, hook, ok: true },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[adapter-dispatch] ${adapter.platform} failed on ${event.type}`,
        err
      );
      results.push({
        platform: adapter.platform,
        ok: false,
        error: errorMessage,
      });
      try {
        await recordEvent({
          sessionId: event.session.id,
          eventType: SESSION_EVENT_TYPES.adapter_call_failed,
          actorType: "system",
          actorId: `adapter:${adapter.platform}`,
          payload: {
            platform: adapter.platform,
            hook,
            error: errorMessage,
          },
        });
      } catch (auditErr) {
        // Audit-write failure is logged but doesn't escalate. The console
        // log above is the last-resort breadcrumb.
        console.error("[adapter-dispatch] audit write failed", auditErr);
      }
    }
  }
  return results;
}

function hookNameFor(eventType: AdapterDispatchEvent["type"]): string {
  switch (eventType) {
    case "session_activated":
      return "onSessionActivated";
    case "session_ending":
      return "onSessionEnding";
    case "wrap_up_complete":
      return "onWrapUpComplete";
    case "recap_ready":
      return "onRecapReady";
    case "session_ended":
      return "onSessionEnded";
  }
}
