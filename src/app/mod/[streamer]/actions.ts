"use server";

/**
 * Server actions for the /mod/[streamer] operational view.
 *
 * Authorization is double-gated on every action: the caller must be
 * authenticated AND either (a) the streamer themselves OR (b) hold
 * an `active` row in `streamer_mods` for that streamer. The page
 * server-renders past the access gate too, but actions repeat the
 * check so a stale page token or DOM tampering can't slip a write
 * past it.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import {
  kickedMessage,
  kickedTimedMessage,
} from "@/lib/twitch/commands/messages";

export interface ModActionResult {
  ok: boolean;
  error?: string;
}

/** Returns `{ streamerUserId }` if the caller may act as mod (or as
 *  the streamer themselves) on this slug; otherwise an error result.
 *  Service-role lookups so RLS doesn't block the cross-account read. */
async function authorizeModForSlug(
  slug: string,
): Promise<{ ok: true; streamerUserId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createServiceClient();

  // Slug → streamer user id. Username first, then twitch_username.
  let streamerUserId: string | null = null;
  {
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("username", slug)
      .maybeSingle();
    streamerUserId = (data as { id: string } | null)?.id ?? null;
  }
  if (!streamerUserId) {
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("twitch_username", slug)
      .maybeSingle();
    streamerUserId = (data as { id: string } | null)?.id ?? null;
  }
  if (!streamerUserId) return { ok: false, error: "streamer_not_found" };

  // Streamer self-access — implicit mod on their own surfaces.
  if (streamerUserId === user.id) {
    return { ok: true, streamerUserId };
  }

  // Active mod check.
  const { data: modRow } = await admin
    .from("streamer_mods")
    .select("id")
    .eq("streamer_user_id", streamerUserId)
    .eq("gs_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!modRow) return { ok: false, error: "not_a_mod" };

  return { ok: true, streamerUserId };
}

/**
 * Kick a participant from the streamer's currently-active session.
 *
 * @param slug         streamer slug from the route
 * @param participantId session_participants.id
 * @param minutes      optional ban duration; null/undefined = permanent kick
 *                     for this session
 */
export async function kickParticipantAction(
  slug: string,
  participantId: string,
  minutes: number | null,
): Promise<ModActionResult> {
  const auth = await authorizeModForSlug(slug);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createServiceClient();

  // Pull the participant row + verify it belongs to the streamer's
  // active session. Without this, a mod could pass any participant id
  // and the row patch wouldn't notice.
  const { data: participantRow } = await admin
    .from("session_participants")
    .select(
      "id, session_id, platform, platform_user_id, display_name, is_broadcaster, left_at",
    )
    .eq("id", participantId)
    .maybeSingle();
  if (!participantRow) return { ok: false, error: "participant_not_found" };

  const { data: sessionRow } = await admin
    .from("gs_sessions")
    .select("id, owner_user_id, status")
    .eq("id", (participantRow as { session_id: string }).session_id)
    .maybeSingle();
  if (!sessionRow) return { ok: false, error: "session_not_found" };
  if ((sessionRow as { owner_user_id: string }).owner_user_id !== auth.streamerUserId) {
    return { ok: false, error: "participant_not_in_streamer_session" };
  }
  const status = (sessionRow as { status: string }).status;
  if (status !== "active" && status !== "ending") {
    return { ok: false, error: "session_not_active" };
  }
  if ((participantRow as { is_broadcaster: boolean }).is_broadcaster) {
    return { ok: false, error: "cant_kick_broadcaster" };
  }
  if ((participantRow as { left_at: string | null }).left_at) {
    return { ok: false, error: "participant_already_left" };
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    left_at: now.toISOString(),
    left_reason: "kicked",
  };
  // Clamp to 1..1440 to keep parity with the chat-command `!gs-kick`
  // — no instant-rejoin abuse, no permanent-via-timer.
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    const clamped = Math.min(Math.floor(minutes), 1440);
    update.kick_until = new Date(now.getTime() + clamped * 60 * 1000).toISOString();
  }

  const { error: updateErr } = await admin
    .from("session_participants")
    .update(update)
    .eq("id", participantId);
  if (updateErr) {
    console.error("[mod/actions] kick update failed:", updateErr);
    return { ok: false, error: "update_failed" };
  }

  // Best-effort chat post — failure here doesn't undo the kick. Posts
  // mirror the !gs-kick chat command so kicks from the web view look
  // the same as kicks from chat. Skipped silently if Twitch isn't the
  // attached platform.
  try {
    const sessionId = (participantRow as { session_id: string }).session_id;
    const displayName =
      (participantRow as { display_name: string | null; platform_user_id: string }).display_name ??
      (participantRow as { platform_user_id: string }).platform_user_id;
    const adapter = new TwitchAdapter({
      sessionId,
      ownerUserId: auth.streamerUserId,
    });
    const message =
      typeof update.kick_until === "string"
        ? kickedTimedMessage(
            displayName,
            Math.min(Math.floor(minutes as number), 1440),
          )
        : kickedMessage(displayName);
    await adapter.postChatMessage(message);
  } catch (err) {
    console.error("[mod/actions] kick chat post failed:", err);
  }

  revalidatePath(`/mod/${slug}`);
  return { ok: true };
}
