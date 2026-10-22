/**
 * GET/PATCH /api/discord/bot/lounge?guild= : a server's Mario Kart lounge settings (GS Pro):
 * the game its division roles follow and the game its Monday board covers (null = off).
 * Rank-up posts are the free "Lounge rank-ups" switch on the routing card instead.
 * `ready: false` = the database doesn't have the lounge columns yet.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { pickGuild } from "@/lib/discord/guilds";
import { isMmrGame } from "@/lib/mmr/rules";

async function owner(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 }) };
  const guild = await pickGuild(user.id, new URL(request.url).searchParams.get("guild"));
  if (!guild) return { error: NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 }) };
  return { user, guild };
}

export async function GET(request: Request) {
  const o = await owner(request);
  if ("error" in o) return o.error;
  const { data, error } = await createServiceClient().from("discord_guilds").select("lounge_roles_game, lounge_board_game").eq("guild_id", o.guild.guildId).maybeSingle();
  if (error) return NextResponse.json({ ok: true, ready: false, rolesGame: null, boardGame: null });
  const row = data as { lounge_roles_game: string | null; lounge_board_game: string | null } | null;
  return NextResponse.json({ ok: true, ready: true, rolesGame: row?.lounge_roles_game ?? null, boardGame: row?.lounge_board_game ?? null });
}

export async function PATCH(request: Request) {
  const o = await owner(request);
  if ("error" in o) return o.error;
  if (!(await isProUser(o.user.id))) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { roles_game?: unknown; board_game?: unknown };
  const patch: Record<string, unknown> = {};
  const game = (v: unknown) => (v === null || v === "" ? null : isMmrGame(v) ? v : undefined);
  if (body.roles_game !== undefined) { const g = game(body.roles_game); if (g === undefined) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 }); patch.lounge_roles_game = g; }
  if (body.board_game !== undefined) { const g = game(body.board_game); if (g === undefined) return NextResponse.json({ ok: false, error: "bad_game" }, { status: 400 }); patch.lounge_board_game = g; }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });
  const { error } = await createServiceClient().from("discord_guilds").update(patch).eq("guild_id", o.guild.guildId).eq("owner_user_id", o.user.id);
  if (error) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
