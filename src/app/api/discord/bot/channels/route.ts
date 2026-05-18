/**
 * GET /api/discord/bot/channels
 *
 * Returns the list of text channels in the streamer's connected Discord
 * guild so the Account UI's channel picker has something to render.
 * Requires the bot to be installed (via /api/discord/bot/install/*) —
 * otherwise the guild call returns 403 from Discord.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { listTextChannels } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("discord_guild_id")
    .eq("id", user.id)
    .maybeSingle();
  const guildId = (profile as { discord_guild_id: string | null } | null)
    ?.discord_guild_id;
  if (!guildId) {
    return NextResponse.json(
      { ok: false, error: "bot_not_installed" },
      { status: 404 },
    );
  }

  const result = await listTextChannels(guildId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    channels: result.channels.map((c) => ({ id: c.id, name: c.name })),
  });
}
