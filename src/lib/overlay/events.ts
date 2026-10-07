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
 * The most recent overlay events for an owner (newest first): a small window
 * of recent events, plus the latest persistent event (no ttl) of every type.
 * Without the second part a running timer, bingo board or tier list fell out
 * of the window once a few dice rolls came after it, and an OBS reload lost
 * it. Persistent events older than PERSISTENT_WINDOW_MS stay out. The client
 * dedups by `id` and keeps the latest persistent event per type. Degrades to
 * [] on any read error.
 */
/** How far back an OBS reload restores a running timer, bingo board or tier list. */
const PERSISTENT_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function getLatestOverlayEvents(
  ownerUserId: string,
  limit = 6,
): Promise<OverlayEvent[]> {
  const admin = createServiceClient();
  const cols = "id, type, payload, ttl_ms, created_at, announced_at";
  const [recent, persistent] = await Promise.all([
    admin.from("session_overlay_events").select(cols).eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false }).limit(limit),
    // Only this stream's: a board left up weeks ago shouldn't come back on load.
    admin.from("session_overlay_events").select(cols).eq("owner_user_id", ownerUserId).is("ttl_ms", null)
      .gte("created_at", new Date(Date.now() - PERSISTENT_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false }).limit(40),
  ]);
  if (recent.error) {
    console.error("[overlay/events] read failed:", recent.error.message);
    return [];
  }
  const rows = new Map<string, DbRow>();
  for (const r of (recent.data ?? []) as DbRow[]) rows.set(r.id, r);
  const typesSeen = new Set<string>();
  for (const r of (persistent.data ?? []) as DbRow[]) {
    if (typesSeen.has(r.type)) continue;
    typesSeen.add(r.type);
    rows.set(r.id, r);
  }
  return [...rows.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(mapRow);
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
