/**
 * POST /api/account/mods/[id]/chat-invite — the bot mentions a Twitch mod
 * from the streamer's pending list in their chat with the self-serve join
 * link (/mod/join/<streamer>). Owner only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { getLiveSlugForUser } from "@/lib/twitch/streamerSlug";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
  const admin = createServiceClient();
  const { data: row } = await admin.from("streamer_mods").select("display_name, twitch_user_id").eq("id", id).eq("streamer_user_id", user.id).maybeSingle();
  if (!row?.twitch_user_id) return NextResponse.json({ ok: false, message: "That mod isn't from your Twitch list." }, { status: 404 });
  const { data: conn } = await admin.from("twitch_connections").select("twitch_user_id").eq("user_id", user.id).maybeSingle();
  const slug = await getLiveSlugForUser(user.id);
  if (!conn?.twitch_user_id || !slug) return NextResponse.json({ ok: false, message: "Connect Twitch in Setup first." }, { status: 400 });
  try {
    await sendChatMessage({
      broadcasterId: conn.twitch_user_id as string,
      senderId: process.env.TWITCH_BOT_USER_ID || "",
      message: `@${(row.display_name as string | null) ?? "mod"} you can help run the stream tools on GameShuffle: gameshuffle.co/mod/join/${encodeURIComponent(slug)} (sign in with Twitch)`,
    });
  } catch (err) {
    console.error("[mods/chat-invite] send failed:", err);
    return NextResponse.json({ ok: false, message: "The bot couldn't post in your chat. Check the bot in Setup ▸ Twitch." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
