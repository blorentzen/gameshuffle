/**
 * Name Picker raffles (Streamer Tools Integration, Phase 2). Viewers join a
 * per-session entrant pool with !enter; the streamer draws N random winners
 * (server-side), which reveal on the overlay. Winners can be removed so a
 * multi-draw giveaway doesn't repeat.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { trackServerEvent } from "@/lib/analytics/server";
import type { ToolSource } from "./dice";

const DRAW_TTL_MS = 8000;

/** Add (or refresh) a raffle entrant. Idempotent per (session, viewer). */
export async function addEntrant(args: {
  sessionId: string;
  viewerTwitchUserId: string;
  displayName: string;
}): Promise<{ ok: boolean }> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_name_picker_entrants")
    .upsert(
      {
        session_id: args.sessionId,
        viewer_twitch_user_id: args.viewerTwitchUserId,
        display_name: args.displayName,
      },
      { onConflict: "session_id,viewer_twitch_user_id" },
    );
  return { ok: !error };
}

/** Add a manual entrant by name (streamer-typed from the Hub). Deduped by name
 *  via a synthetic `manual:<name>` id so re-adding the same name is a no-op. */
export async function addManualEntrant(args: {
  sessionId: string;
  displayName: string;
}): Promise<{ ok: boolean }> {
  const name = args.displayName.trim().slice(0, 80);
  if (!name) return { ok: false };
  const admin = createServiceClient();
  const { error } = await admin.from("session_name_picker_entrants").upsert(
    {
      session_id: args.sessionId,
      viewer_twitch_user_id: `manual:${name.toLowerCase()}`,
      display_name: name,
    },
    { onConflict: "session_id,viewer_twitch_user_id" },
  );
  return { ok: !error };
}

/** All entrants for a session (name-sorted), for the Hub entry manager. */
export async function listEntrants(
  sessionId: string,
): Promise<{ id: string; displayName: string }[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_name_picker_entrants")
    .select("id, display_name")
    .eq("session_id", sessionId)
    .order("display_name");
  return ((data ?? []) as { id: string; display_name: string }[]).map((r) => ({
    id: r.id,
    displayName: r.display_name,
  }));
}

/** Remove one entrant by id (scoped to the session). */
export async function removeEntrant(args: { sessionId: string; id: string }): Promise<void> {
  const admin = createServiceClient();
  await admin
    .from("session_name_picker_entrants")
    .delete()
    .eq("session_id", args.sessionId)
    .eq("id", args.id);
}

export async function countEntrants(sessionId: string): Promise<number> {
  const admin = createServiceClient();
  const { count } = await admin
    .from("session_name_picker_entrants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return count ?? 0;
}

export async function clearEntrants(sessionId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("session_name_picker_entrants").delete().eq("session_id", sessionId);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface DrawResult {
  winners: string[];
  entries: number;
}

/**
 * Draw `count` winners from the session's entrants, record an overlay event
 * (with a sample of names for the spin animation), and optionally remove the
 * winners for a follow-up draw. Returns [] winners when the pool is empty.
 */
export async function triggerDraw(args: {
  ownerUserId: string;
  sessionId: string;
  count?: number;
  removeWinners?: boolean;
  source?: ToolSource;
}): Promise<DrawResult> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("session_name_picker_entrants")
    .select("id, viewer_twitch_user_id, display_name")
    .eq("session_id", args.sessionId);
  const rows = (data ?? []) as { id: string; viewer_twitch_user_id: string; display_name: string }[];

  const entries = rows.length;
  const n = Math.max(1, Math.min(args.count ?? 1, entries));
  const drawn = shuffle(rows).slice(0, entries ? n : 0);
  const winners = drawn.map((r) => r.display_name);

  void trackServerEvent("Streamer Tool", {
    props: { tool: "name_picker", surface: args.source ?? "unknown", entries },
  });

  // A handful of names to flash during the overlay spin.
  const sample = shuffle(rows.map((r) => r.display_name)).slice(0, 12);
  await recordOverlayEvent({
    ownerUserId: args.ownerUserId,
    sessionId: args.sessionId,
    type: "name_picker",
    payload: { winners, entries, sample },
    ttlMs: DRAW_TTL_MS,
  });

  if (args.removeWinners && drawn.length) {
    await admin
      .from("session_name_picker_entrants")
      .delete()
      .in(
        "id",
        drawn.map((r) => r.id),
      );
  }

  return { winners, entries };
}
