/**
 * GET/DELETE /api/account/reminders: the web side of `/gs-remind` (name, web and docs pick 8A), on Comms. Reminders
 * belong to the Discord account that set them, so the list is the signed-in account's Discord's upcoming ones, with
 * the server they'll post in; Cancel removes one before it fires.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function discordIdOf(): Promise<{ userId: string; discordId: string | null } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("discord_id").eq("id", user.id).maybeSingle();
  return { userId: user.id, discordId: (data as { discord_id: string | null } | null)?.discord_id ?? null };
}

export async function GET() {
  const me = await discordIdOf();
  if (!me) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!me.discordId) return NextResponse.json({ discord: false, reminders: [] });
  const db = createServiceClient();
  const { data } = await db.from("discord_reminders").select("id, guild_id, message, remind_at").eq("user_discord_id", me.discordId).eq("fired", false).order("remind_at").limit(50);
  const rows = (data ?? []) as { id: string; guild_id: string; message: string; remind_at: string }[];
  const guilds = rows.length ? await db.from("discord_guilds").select("guild_id, guild_name").in("guild_id", [...new Set(rows.map((r) => r.guild_id))]) : { data: [] };
  const names = new Map(((guilds.data ?? []) as { guild_id: string; guild_name: string | null }[]).map((g) => [g.guild_id, g.guild_name]));
  return NextResponse.json({ discord: true, reminders: rows.map((r) => ({ id: r.id, message: r.message, at: r.remind_at, server: names.get(r.guild_id) ?? null })) });
}

export async function DELETE(request: Request) {
  const me = await discordIdOf();
  if (!me) return NextResponse.json({ error: "signin" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!me.discordId || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data } = await createServiceClient().from("discord_reminders").delete().eq("id", id).eq("user_discord_id", me.discordId).eq("fired", false).select("id");
  return data?.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
