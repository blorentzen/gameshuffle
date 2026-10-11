/**
 * POST /api/discord/bot/test-post
 *
 * Sends a one-off test embed to the streamer's configured Discord
 * announcement channel. Used from the Account → Integrations
 * Discord card to confirm the bot is authorized end-to-end — same
 * role as `/api/twitch/bot/test-message` for the Twitch side.
 *
 * Returns 200 with `{ ok: true, messageId }` on success, or a typed
 * `{ ok: false, error }` shape on failure (no_routing, post_failed,
 * missing_access). The UI surfaces each specifically so the streamer
 * knows whether they need to install, configure, or reconfigure.
 *
 * Honors `DISCORD_INTEGRATION_DISABLED` — when set the route returns
 * an `integration_disabled` error so the UI can render an
 * informational banner instead of pretending to test.
 */

import "server-only";
import { NextResponse } from "next/server";
import { botServer } from "@/lib/discord/botServer";
import { createServiceClient } from "@/lib/supabase/admin";
import { postEmbed } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Kill switch — when the integration is paused process-wide, fail
  // the test cleanly. Surfaces "temporarily disabled" copy in the UI
  // rather than letting the streamer think their config is broken.
  if (process.env.DISCORD_INTEGRATION_DISABLED === "true") {
    return NextResponse.json(
      { ok: false, error: "integration_disabled" },
      { status: 503 },
    );
  }

  const ctx = await botServer(request);
  if (!ctx.ok) return ctx.response;
  if (!ctx.guild.defaultChannelId) {
    return NextResponse.json(
      { ok: false, error: "channel_not_configured" },
      { status: 400 },
    );
  }
  const { data } = await createServiceClient()
    .from("users")
    .select("display_name, username, twitch_username")
    .eq("id", ctx.userId)
    .maybeSingle();
  const profile = data as { display_name: string | null; username: string | null; twitch_username: string | null } | null;

  const streamerName =
    profile?.display_name ?? profile?.username ?? profile?.twitch_username ?? "Streamer";

  const result = await postEmbed({
    channelId: ctx.guild.defaultChannelId,
    embed: {
      title: "🎲 GameShuffle test post",
      description:
        `Your Discord routing is working. The bot can reach this channel from ${streamerName}'s GameShuffle account.\n\nWhen you go live, real session embeds will land here automatically.`,
      color: 0x22c55e,
      footer: { text: "GameShuffle • Test post" },
      timestamp: new Date().toISOString(),
    },
  });
  if (!result.ok) {
    // Translate the structured-error string from the adapter into a
    // typed error code the UI can branch on. Status-prefix matching
    // mirrors the convention in src/lib/adapters/discord/index.ts.
    const isMissingAccess = /^4(03|04):/.test(result.error);
    return NextResponse.json(
      {
        ok: false,
        error: isMissingAccess ? "missing_access" : "post_failed",
        detail: result.error,
        retryable: result.retryable,
      },
      { status: isMissingAccess ? 403 : 502 },
    );
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
