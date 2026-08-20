/** GET /api/discord/bot/emojis — the connected guild's custom emojis (for the
 *  role-menu emoji picker). Requires the bot installed. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { listGuildEmojis } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await createServiceClient()
    .from("users")
    .select("discord_guild_id")
    .eq("id", user.id)
    .maybeSingle();
  const guildId = (profile as { discord_guild_id: string | null } | null)?.discord_guild_id;
  if (!guildId) return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });

  const result = await listGuildEmojis(guildId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, emojis: result.emojis });
}
