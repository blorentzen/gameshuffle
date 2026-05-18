/**
 * GET /api/discord/bot/roles
 *
 * Returns the mentionable roles in the streamer's connected Discord
 * guild so the Account UI can render a role picker for the per-event
 * ping toggles. `@everyone` is intentionally stripped server-side —
 * the bot pings opt-in roles only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { listGuildRoles } from "@/lib/adapters/discord/adapter";

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

  const result = await listGuildRoles(guildId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, retryable: result.retryable },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    roles: result.roles.map((r) => ({ id: r.id, name: r.name })),
  });
}
