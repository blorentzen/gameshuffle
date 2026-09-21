/**
 * YouTube live-chat poller — the RECEIVE side of the integration.
 *
 * YouTube has no push, so this is invoked by a cron (`/api/cron/youtube-chat-poll`,
 * ~every 60s per the chosen cadence). For each connected channel it:
 *   1. Discovers the active live broadcast (→ liveChatId) when we don't have one
 *      cached, and maintains `is_live` / `active_live_chat_id` on the row.
 *   2. Polls `liveChatMessages.list` from the stored cursor (`live_chat_poll_cursor`)
 *      so each run only sees NEW messages.
 *   3. Routes `!`-commands to `dispatchYouTubeChat`.
 *
 * Backlog safety: the first poll after going live (no stored cursor) returns the
 * recent history — we store the cursor but DON'T act on that batch, so the bot
 * never replays old chat when a stream starts.
 *
 * Command coverage: the full economy/shuffle command suite is Twitch-shaped
 * (Twitch ids + the Twitch client for replies) and the economy identity layer
 * only knows twitch/discord/account today. So this dispatches the
 * platform-agnostic starter set (info/help) now; the economy bridge (a
 * platform-generic command context + a 'youtube' identity) is a separate pass.
 *
 * Node.js runtime only.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getValidYouTubeAccessToken } from "./connection";
import {
  getActiveLiveBroadcast,
  insertLiveChatMessage,
  listLiveChatMessages,
  type LiveChatMessage,
} from "./client";
import { parseCommand } from "@/lib/twitch/commands/parse";
import { dispatchCommand } from "@/lib/twitch/commands/dispatch";
import { recordChatMessage } from "@/lib/overlay/chat";
import { ensureYouTubeAutoSession, endYouTubeAutoSessions } from "./session";

interface PollableConnection {
  id: string;
  user_id: string;
  youtube_channel_id: string;
  active_live_chat_id: string | null;
  live_chat_poll_cursor: string | null;
  is_live: boolean | null;
  overlay_token: string | null;
}

export interface PollSummary {
  channels: number;
  live: number;
  messages: number;
  commands: number;
  errors: number;
}

/** Poll every connected YouTube channel once. Per-channel failures are isolated. */
export async function pollAllYouTubeChats(): Promise<PollSummary> {
  const summary: PollSummary = { channels: 0, live: 0, messages: 0, commands: 0, errors: 0 };
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("youtube_connections")
    .select("id, user_id, youtube_channel_id, active_live_chat_id, live_chat_poll_cursor, is_live, overlay_token")
    .not("youtube_channel_id", "is", null);
  if (error || !data) return summary;

  const connections = data as PollableConnection[];
  summary.channels = connections.length;

  for (const conn of connections) {
    try {
      const res = await pollConnectionChat(conn);
      if (res.live) summary.live += 1;
      summary.messages += res.messages;
      summary.commands += res.commands;
    } catch (err) {
      summary.errors += 1;
      console.error(`[youtube-chat-poll] channel ${conn.youtube_channel_id} failed`, err);
    }
  }
  return summary;
}

async function pollConnectionChat(
  conn: PollableConnection,
): Promise<{ live: boolean; messages: number; commands: number }> {
  const admin = createServiceClient();
  const token = await getValidYouTubeAccessToken(conn.user_id);
  if (!token) return { live: false, messages: 0, commands: 0 };

  // Resolve the active live chat. Re-discover when we don't have one cached
  // (either never live, or the last stream ended).
  let liveChatId = conn.active_live_chat_id;
  let hadCursor = !!conn.live_chat_poll_cursor;
  if (!liveChatId) {
    const broadcast = await getActiveLiveBroadcast(token);
    if (!broadcast?.liveChatId) {
      // Not live — clear any stale state and end our auto-created session.
      if (conn.is_live || conn.active_live_chat_id || conn.live_chat_poll_cursor) {
        await admin
          .from("youtube_connections")
          .update({ is_live: false, active_live_chat_id: null, live_chat_poll_cursor: null, updated_at: new Date().toISOString() })
          .eq("id", conn.id);
        await endYouTubeAutoSessions(conn.user_id).catch(() => {});
      }
      return { live: false, messages: 0, commands: 0 };
    }
    liveChatId = broadcast.liveChatId;
    hadCursor = false; // fresh chat — treat the first batch as backlog
    await admin
      .from("youtube_connections")
      .update({ is_live: true, active_live_chat_id: liveChatId, updated_at: new Date().toISOString() })
      .eq("id", conn.id);
    // Went live — open a session so shuffle/lobby work (no-op if one exists).
    // The broadcast title feeds auto game-detection (queue-mode when unknown).
    await ensureYouTubeAutoSession({
      userId: conn.user_id,
      channelId: conn.youtube_channel_id,
      channelTitle: broadcast.title,
      broadcastTitle: broadcast.title,
    }).catch(() => {});
  }

  let page;
  try {
    page = await listLiveChatMessages(token, liveChatId, conn.live_chat_poll_cursor);
  } catch (err) {
    // 403/404 on the chat endpoint means the live chat ended — reset so the
    // next run re-discovers. Re-throw other errors to the per-channel catch.
    const status = (err as { status?: number }).status;
    if (status === 403 || status === 404) {
      await admin
        .from("youtube_connections")
        .update({ is_live: false, active_live_chat_id: null, live_chat_poll_cursor: null, updated_at: new Date().toISOString() })
        .eq("id", conn.id);
      await endYouTubeAutoSessions(conn.user_id).catch(() => {});
      return { live: false, messages: 0, commands: 0 };
    }
    throw err;
  }

  // Persist the new cursor + live flag regardless of whether we dispatch.
  await admin
    .from("youtube_connections")
    .update({ is_live: true, live_chat_poll_cursor: page.nextPageToken, updated_at: new Date().toISOString() })
    .eq("id", conn.id);

  // First batch after going live = backlog; store the cursor, don't act.
  if (!hadCursor) {
    return { live: true, messages: page.messages.length, commands: 0 };
  }

  // Persist every new message to the chat-timeline overlay store (owner-keyed,
  // best-effort, parallel). The overlay applies its own hide-commands filter,
  // so we store commands too — matching the Twitch chat-timeline behavior.
  await Promise.all(
    page.messages.map((msg) =>
      recordChatMessage({
        ownerUserId: conn.user_id,
        senderLogin: null,
        senderDisplay: msg.authorDisplayName,
        senderColor: null,
        roles: msg.isOwner ? ["broadcaster"] : msg.isModerator ? ["moderator"] : [],
        isGsUser: false,
        gsUsername: null,
        text: msg.text,
      }).catch(() => {}),
    ),
  );

  // Resolve the streamer's slug once for this batch (community lookups).
  const { data: userRow } = await admin
    .from("users")
    .select("username, twitch_username")
    .eq("id", conn.user_id)
    .maybeSingle();
  const streamerSlug =
    (userRow as { username?: string | null; twitch_username?: string | null } | null)?.username ??
    (userRow as { twitch_username?: string | null } | null)?.twitch_username ??
    conn.youtube_channel_id;

  let commands = 0;
  for (const msg of page.messages) {
    const handled = await dispatchYouTubeChat({ conn, token, liveChatId, streamerSlug, msg });
    if (handled) commands += 1;
  }
  return { live: true, messages: page.messages.length, commands };
}

/**
 * Route one YouTube chat message through the shared command dispatcher. Returns
 * true when it was a parsed command (handled or gated).
 *
 * The dispatcher is platform-generic via `CmdContext.platform` + `.reply`: we
 * build a dispatch context keyed on the YouTube author + channel, hand it a
 * `reply` that posts back to this live chat, and set `isLiveOverride` (we only
 * poll active chats). Identity/economy resolution keys on `platform: 'youtube'`.
 *
 * Coverage note: economy + info commands (!tokens/!give/!leaderboard/!bet/!gs)
 * reply through the adapter seam and work here. Session/shuffle commands and the
 * Twitch-only fallback chains (custom commands, mention events) don't yet — they
 * post via empty Twitch ids and no-op safely (caught by the dispatcher).
 */
async function dispatchYouTubeChat(args: {
  conn: PollableConnection;
  token: string;
  liveChatId: string;
  streamerSlug: string;
  msg: LiveChatMessage;
}): Promise<boolean> {
  const parsed = parseCommand(args.msg.text);
  if (!parsed) return false;

  const reply = (text: string) =>
    insertLiveChatMessage(args.token, args.liveChatId, text)
      .then(() => undefined)
      .catch((err) => {
        console.error("[youtube-chat-poll] reply failed", err);
      });

  try {
    await dispatchCommand(parsed, {
      userId: args.conn.user_id,
      platform: "youtube",
      // No Twitch ids on YouTube; the broadcaster's platform id is the channel.
      broadcasterTwitchId: "",
      broadcasterPlatformId: args.conn.youtube_channel_id,
      botTwitchId: "",
      senderTwitchId: args.msg.authorChannelId,
      senderLogin: args.msg.authorDisplayName,
      senderDisplayName: args.msg.authorDisplayName,
      isBroadcaster: args.msg.isOwner,
      isModerator: args.msg.isModerator || args.msg.isOwner,
      isVIP: false,
      overlayToken: args.conn.overlay_token,
      streamerSlug: args.streamerSlug,
      reply,
      isLiveOverride: true,
    });
  } catch (err) {
    console.error("[youtube-chat-poll] dispatch failed", err);
  }
  return true;
}
