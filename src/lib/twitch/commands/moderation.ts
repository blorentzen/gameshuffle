/**
 * Moderation commands: !gs-kick @user [minutes] and !gs-clear.
 * Broadcaster + mods only — gating happens in the dispatcher before this
 * file is reached, so the handlers themselves trust the caller is allowed.
 */

import { createTwitchAdminClient } from "@/lib/twitch/admin";
import {
  findTwitchSessionForUser,
  patchTwitchParticipantById,
  leaveAllTwitchParticipantsExcept,
} from "@/lib/sessions/twitch-platform";
import { TwitchAdapter } from "@/lib/adapters/twitch";
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
 * leading @ and lowercases the target so the lookup matches the Twitch login.
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

  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  // Look up the participant by Twitch login (stored in metadata.twitch_login).
  // The platform helpers don't expose a login-based lookup — that would be a
  // Twitch-specific shape and the helpers intentionally stay platform-
  // agnostic-friendly.
  const admin = createTwitchAdminClient();
  const { data: participant } = await admin
    .from("session_participants")
    .select("id, display_name, platform_user_id, left_at, metadata")
    .eq("session_id", session.id)
    .eq("platform", "twitch")
    .filter("metadata->>twitch_login", "eq", parsed.target)
    .maybeSingle();

  if (participant && participant.platform_user_id === ctx.broadcasterTwitchId) {
    await adapter.postChatMessage(cantKickBroadcasterMessage());
    return;
  }

  if (!participant || participant.left_at) {
    await adapter.postChatMessage(kickTargetNotFoundMessage(parsed.target));
    return;
  }

  const now = new Date();
  const update: Parameters<typeof patchTwitchParticipantById>[1] = {
    left_at: now.toISOString(),
    left_reason: "kicked",
  };
  if (parsed.minutes && parsed.minutes > 0) {
    update.kick_until = new Date(now.getTime() + parsed.minutes * 60 * 1000).toISOString();
  }

  await patchTwitchParticipantById(participant.id as string, update);

  await adapter.postChatMessage(
    parsed.minutes && parsed.minutes > 0
      ? kickedTimedMessage(participant.display_name as string, parsed.minutes)
      : kickedMessage(participant.display_name as string)
  );
}

export async function handleClearCommand(ctx: ModerationContext): Promise<void> {
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  await leaveAllTwitchParticipantsExcept(
    [session.id],
    ctx.broadcasterTwitchId,
    "session_ended"
  );

  await adapter.postChatMessage(clearMessage());
}
