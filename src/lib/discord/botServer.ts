/**
 * For the Discord Bot tab's API routes: the signed-in account and the server
 * the request is about (`?guild=<id>`, else the main server; see guilds.ts).
 */

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProUser } from "@/lib/subscription-server";
import { guildIsActive, pickGuild, type DiscordGuild } from "./guilds";

export type BotServer =
  | { ok: true; userId: string; guild: DiscordGuild; isPro: boolean; active: boolean }
  | { ok: false; response: NextResponse };

export async function botServer(request: Request, opts: { allowRemoved?: boolean } = {}): Promise<BotServer> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 }) };
  const guild = await pickGuild(user.id, new URL(request.url).searchParams.get("guild"));
  if (!guild || (guild.removedAt && !opts.allowRemoved)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 }) };
  }
  const isPro = await isProUser(user.id);
  return { ok: true, userId: user.id, guild, isPro, active: guildIsActive(guild, isPro) };
}

/** Pro tools on this server: needs Pro (a paused server is only ever one without it). */
export function proRequired(ctx: Extract<BotServer, { ok: true }>): NextResponse | null {
  return ctx.isPro ? null : NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
}
