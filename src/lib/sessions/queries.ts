/**
 * Read-only query helpers for Hub surfaces.
 *
 * Lightweight projections + event-fetch helpers that don't belong in
 * `service.ts` (which is mostly write-side). Hub server components
 * import from here for list / detail / activity-feed reads.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionEventRow {
  id: string;
  session_id: string;
  event_type: string;
  actor_type: "streamer" | "mod" | "viewer" | "system" | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Fetch the most recent session events for a session, ordered newest-first.
 * Use a generous limit for activity-feed displays; the page renders a
 * "show more" affordance if needed (Phase 4B).
 */
export async function listSessionEvents(
  sessionId: string,
  opts: { limit?: number; client?: SupabaseClient } = {}
): Promise<SessionEventRow[]> {
  const client = opts.client ?? createServiceClient();
  const { data } = await client
    .from("session_events")
    .select("id, session_id, event_type, actor_type, actor_id, payload, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 25);
  return ((data ?? []) as SessionEventRow[]) ?? [];
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  platform: string;
  platform_user_id: string;
  display_name: string | null;
  is_broadcaster: boolean;
  joined_at: string;
  left_at: string | null;
  current_combo: Record<string, unknown> | null;
}

/**
 * Active participants for a session, ordered by join time.
 */
export async function listActiveParticipants(
  sessionId: string,
  opts: { client?: SupabaseClient } = {}
): Promise<ParticipantRow[]> {
  const client = opts.client ?? createServiceClient();
  const { data } = await client
    .from("session_participants")
    .select(
      "id, session_id, platform, platform_user_id, display_name, is_broadcaster, joined_at, left_at, current_combo"
    )
    .eq("session_id", sessionId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });
  return ((data ?? []) as ParticipantRow[]) ?? [];
}
