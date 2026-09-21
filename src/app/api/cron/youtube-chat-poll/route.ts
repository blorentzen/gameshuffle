/**
 * GET /api/cron/youtube-chat-poll
 *
 * The RECEIVE side of the YouTube integration. YouTube has no chat webhook, so
 * this cron polls `liveChatMessages.list` for every connected channel (~every
 * 60s) and routes commands. Auth: Vercel Cron Bearer CRON_SECRET.
 *
 * No-ops cleanly when YouTube isn't configured (no creds) or the connections
 * table isn't migrated — `pollAllYouTubeChats` degrades to zero channels.
 */

import { NextResponse } from "next/server";
import { pollAllYouTubeChats } from "@/lib/youtube/chatPoll";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/youtube-chat-poll] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  // Skip entirely when the integration isn't configured — avoids churning the
  // connections table + Google calls on deployments without YouTube creds.
  if (process.env.YOUTUBE_INTEGRATION_DISABLED === "true" || !process.env.YOUTUBE_CLIENT_ID) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const summary = await pollAllYouTubeChats();
  return NextResponse.json({ ok: true, ...summary });
}
