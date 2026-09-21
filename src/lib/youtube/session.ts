/**
 * YouTube auto-session lifecycle — the "just works" layer for shuffle/lobby.
 *
 * Shuffle + lobby chat commands need an ACTIVE `gs_session` for the streamer.
 * On Twitch that's created by the `stream.online` webhook; YouTube has no such
 * push, so the chat poller drives it here:
 *   - when the channel goes live → `ensureYouTubeAutoSession` opens a session
 *     (only if the streamer doesn't already have one — a hub-started session
 *     always wins);
 *   - when it goes offline → `endYouTubeAutoSessions` ends only the sessions
 *     THIS layer created (tagged `config.auto_source === 'youtube'`), never a
 *     hub-started one.
 *
 * The session is queue-mode (no bound game) because the YouTube Data API
 * doesn't give a reliable game category — viewers can still `!gs-join` and the
 * streamer can bind a game from the hub, which supersedes the auto-session.
 *
 * All best-effort: callers wrap in try/catch so a session hiccup never breaks
 * the poll loop. Node.js runtime only.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  createSession,
  transitionSessionStatus,
} from "@/lib/sessions/service";
import { findTwitchSessionForUser, endTwitchBoundSession } from "@/lib/sessions/twitch-platform";
import { resolveYouTubeGameFromTitle } from "./games";

/**
 * Ensure the streamer has an active session while live on YouTube. Returns the
 * session id (existing or newly created), or null on failure. Idempotent — a
 * second call while a session is already active is a no-op.
 */
export async function ensureYouTubeAutoSession(args: {
  userId: string;
  channelId: string;
  channelTitle?: string | null;
  /** Broadcast title — used to auto-detect the game (queue-mode when unknown). */
  broadcastTitle?: string | null;
}): Promise<string | null> {
  // A hub-started (or already auto-created) session always wins — don't stack.
  const existing = await findTwitchSessionForUser(args.userId, ["active", "test"]);
  if (existing) return existing.id;

  const game = resolveYouTubeGameFromTitle(args.broadcastTitle);

  try {
    const session = await createSession({
      ownerUserId: args.userId,
      name: args.channelTitle ? `YouTube Live: ${args.channelTitle}` : "YouTube Live",
      platforms: {
        streaming: {
          type: "youtube",
          channel_id: args.channelId,
          channel_name: args.channelTitle ?? undefined,
        },
      },
      config: game ? { auto_source: "youtube", game } : { auto_source: "youtube" },
      isTestSession: false,
    });
    const active = await transitionSessionStatus({
      id: session.id,
      newStatus: "active",
      via: "auto_prompt",
      actorType: "system",
      actorId: "youtube:live",
      payload: { source: "youtube.live" },
    });
    return active.id;
  } catch (err) {
    console.error("[youtube/session] ensureYouTubeAutoSession failed", err);
    return null;
  }
}

/**
 * End every session THIS layer auto-created for the streamer (tagged
 * `config.auto_source === 'youtube'`). Called when the channel goes offline.
 * Leaves hub-started sessions untouched. Best-effort.
 */
export async function endYouTubeAutoSessions(userId: string): Promise<void> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_sessions")
    .select("id, config")
    .eq("owner_user_id", userId)
    .in("status", ["active", "ending"]);
  for (const row of (data ?? []) as { id: string; config: { auto_source?: string } | null }[]) {
    if (row.config?.auto_source === "youtube") {
      try {
        await endTwitchBoundSession(row.id, "stream_ended_grace");
      } catch (err) {
        console.error("[youtube/session] end failed for", row.id, err);
      }
    }
  }
}
