/**
 * Generic overlay-event store (Streamer Tools Integration, Phase 0).
 *
 * Any streamer tool records a typed event; the OBS overlay polls /latest and
 * renders by `type` via its render registry. Owner-keyed + service-role only
 * (mirrors the wheel-spin pattern). One-shot events carry `ttlMs`; persistent
 * ones (e.g. a running timer) omit it. `announcedAt` supports the atomic
 * chat-announce claim for tools that announce after their animation lands.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface OverlayEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  ttlMs: number | null;
  createdAt: string;
  announcedAt: string | null;
}

interface DbRow {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  ttl_ms: number | null;
  created_at: string;
  announced_at: string | null;
}

function mapRow(r: DbRow): OverlayEvent {
  return {
    id: r.id,
    type: r.type,
    payload: r.payload ?? {},
    ttlMs: r.ttl_ms,
    createdAt: r.created_at,
    announcedAt: r.announced_at,
  };
}

/** Record a new overlay event. Returns the created event (or null on error). */
export async function recordOverlayEvent(args: {
  ownerUserId: string;
  sessionId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  ttlMs?: number | null;
}): Promise<OverlayEvent | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("session_overlay_events")
    .insert({
      owner_user_id: args.ownerUserId,
      session_id: args.sessionId ?? null,
      type: args.type,
      payload: args.payload,
      ttl_ms: args.ttlMs ?? null,
    })
    .select("id, type, payload, ttl_ms, created_at, announced_at")
    .single();
  if (error || !data) {
    console.error("[overlay/events] record failed:", error?.message);
    return null;
  }
  return mapRow(data as DbRow);
}

/**
 * The most recent overlay events for an owner (newest first). The overlay
 * client dedups one-shots by `id` and shows the latest persistent event per
 * type, so a small window is enough. Degrades to [] on any read error.
 */
export async function getLatestOverlayEvents(
  ownerUserId: string,
  limit = 6,
): Promise<OverlayEvent[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("session_overlay_events")
    .select("id, type, payload, ttl_ms, created_at, announced_at")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[overlay/events] read failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as DbRow));
}

/**
 * Atomically claim the chat announce for an event — only the first caller to
 * flip `announced_at` from NULL wins. Returns true if this caller claimed it.
 */
export async function claimOverlayAnnounce(eventId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("session_overlay_events")
    .update({ announced_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("announced_at", null)
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
