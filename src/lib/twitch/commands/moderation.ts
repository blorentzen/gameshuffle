/**
 * Moderation commands: !gs-kick @user [minutes] and !gs-clear.
 * Broadcaster + mods only — gating happens in the dispatcher before this
 * file is reached, so the handlers themselves trust the caller is allowed.
 */

import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import {
  cantKickBroadcasterMessage,
  clearMessage,
  kickedMessage,
  kickedTimedMessage,
  kickTargetNotFoundMessage,
} from "./messages";

export interface ModerationContext {
  userId: string;
  broadcasterTwitchId: string;
  botTwitchId: string;
}

interface ParsedKick {
  target: string;
  minutes: number | null;
}

/**
 * Parse `!gs-kick` args. Accepts `@username` or `@username 10`. Strips the
 * leading @ and lowercases the target so the lookup matches `twitch_login`.
 * Returns null when args don't fit either shape.
 */
export function parseKickArgs(args: string): ParsedKick | null {
  const match = /^@?([a-z0-9_]{3,25})(?:\s+(\d{1,4}))?\s*$/i.exec(args.trim());
  if (!match) return null;
  const target = match[1].toLowerCase();
  const minutes = match[2] ? Math.min(parseInt(match[2], 10), 1440) : null;
  return { target, minutes };
}

export async function handleKickCommand(
  ctx: ModerationContext,
  args: string
): Promise<void> {
  const parsed = parseKickArgs(args);
  if (!parsed) return;

  const admin = createTwitchAdminClient();
  const { data: session } = await admin
    .from("twitch_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "test"])
    .order("status", { ascending: true })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return;

  const { data: participant } = await admin
    .from("twitch_session_participants")
    .select("id, twitch_display_name, twitch_user_id, left_at")
    .eq("session_id", session.id)
    .eq("twitch_login", parsed.target)
    .maybeSingle();

  if (participant && participant.twitch_user_id === ctx.broadcasterTwitchId) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: cantKickBroadcasterMessage(),
    });
    return;
  }

  if (!participant || participant.left_at) {
    await sendChatMessage({
      broadcasterId: ctx.broadcasterTwitchId,
      senderId: ctx.botTwitchId,
      message: kickTargetNotFoundMessage(parsed.target),
    });
    return;
  }

  const now = new Date();
  const update: Record<string, string | null> = {
    left_at: now.toISOString(),
    left_reason: "kicked",
  };
  if (parsed.minutes && parsed.minutes > 0) {
    update.kick_until = new Date(now.getTime() + parsed.minutes * 60 * 1000).toISOString();
  }

  await admin.from("twitch_session_participants").update(update).eq("id", participant.id);

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message:
      parsed.minutes && parsed.minutes > 0
        ? kickedTimedMessage(participant.twitch_display_name as string, parsed.minutes)
        : kickedMessage(participant.twitch_display_name as string),
  });
}

export async function handleClearCommand(ctx: ModerationContext): Promise<void> {
  const admin = createTwitchAdminClient();
  const { data: session } = await admin
    .from("twitch_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .in("status", ["active", "test"])
    .order("status", { ascending: true })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return;

  await admin
    .from("twitch_session_participants")
    .update({
      left_at: new Date().toISOString(),
      left_reason: "session_ended",
    })
    .eq("session_id", session.id)
    .is("left_at", null)
    .neq("twitch_user_id", ctx.broadcasterTwitchId);

  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message: clearMessage(),
  });
}
