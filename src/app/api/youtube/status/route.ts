/**
 * GET /api/youtube/status
 *
 * Connection status for the signed-in user's YouTube integration, for the
 * Integrations tab card. Reports whether the platform is configured at all
 * (creds present) so the UI can show "coming soon" vs a real Connect button.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getYouTubeConnection } from "@/lib/youtube/connection";

export const runtime = "nodejs";

export async function GET() {
  const configured = !!process.env.YOUTUBE_CLIENT_ID;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, configured, connected: false });

  const conn = await getYouTubeConnection(user.id);
  return NextResponse.json({
    ok: true,
    configured,
    connected: !!conn?.youtube_channel_id,
    channelTitle: conn?.youtube_channel_title ?? null,
    channelHandle: conn?.youtube_channel_handle ?? null,
    isLive: !!conn?.is_live,
  });
}
