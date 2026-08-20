/**
 * GET / POST / DELETE /api/discord/bot/role-menus
 *
 * Self-assign role menus (GS Pro). POST builds a button-per-role message and
 * posts it to a channel; clicking a button toggles that role (handled in
 * /api/discord/interactions). GET lists the streamer's menus; DELETE removes one
 * (and best-effort deletes the Discord message).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  listTextChannels,
  listGuildRoles,
  postComponentsMessage,
  deleteMessage,
} from "@/lib/adapters/discord/adapter";
import { buildRoleMenuComponents } from "@/lib/discord/commands/roleMenu";

export const runtime = "nodejs";

async function requireProInstalled(userId: string) {
  const { data } = await createServiceClient()
    .from("users")
    .select("discord_guild_id, subscription_tier, role")
    .eq("id", userId)
    .maybeSingle();
  const p = data as { discord_guild_id: string | null; subscription_tier: string | null; role: string | null } | null;
  const isPro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) === "pro";
  return { isPro, guildId: p?.discord_guild_id ?? null };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data: menus } = await admin
    .from("discord_role_menus")
    .select("id, channel_id, title, message_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const menuList = (menus ?? []) as Array<{ id: string; channel_id: string; title: string; message_id: string | null; created_at: string }>;

  const optionsByMenu: Record<string, Array<{ roleId: string; label: string; emoji: string | null }>> = {};
  if (menuList.length) {
    const { data: opts } = await admin
      .from("discord_role_menu_options")
      .select("menu_id, role_id, label, emoji, position")
      .in("menu_id", menuList.map((m) => m.id))
      .order("position", { ascending: true });
    for (const o of (opts ?? []) as Array<{ menu_id: string; role_id: string; label: string; emoji: string | null }>) {
      (optionsByMenu[o.menu_id] ??= []).push({ roleId: o.role_id, label: o.label, emoji: o.emoji });
    }
  }

  return NextResponse.json({
    ok: true,
    menus: menuList.map((m) => ({ ...m, options: optionsByMenu[m.id] ?? [] })),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { isPro, guildId } = await requireProInstalled(user.id);
  if (!isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!guildId) return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const b = body as { channelId?: unknown; title?: unknown; options?: unknown };
  const channelId = typeof b.channelId === "string" ? b.channelId : "";
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  const rawOptions = Array.isArray(b.options) ? b.options : [];
  if (!channelId || !title || rawOptions.length === 0) {
    return NextResponse.json({ ok: false, error: "channel_title_options_required" }, { status: 400 });
  }

  // Validate channel + roles against the live guild.
  const [channelsRes, rolesRes] = await Promise.all([listTextChannels(guildId), listGuildRoles(guildId)]);
  if (!channelsRes.ok || !rolesRes.ok) {
    return NextResponse.json({ ok: false, error: "guild_lookup_failed" }, { status: 502 });
  }
  if (!channelsRes.channels.some((c) => c.id === channelId)) {
    return NextResponse.json({ ok: false, error: "invalid_channel" }, { status: 400 });
  }
  const validRoles = new Set(rolesRes.roles.map((r) => r.id));

  const options = rawOptions
    .map((o) => o as { roleId?: unknown; label?: unknown; emoji?: unknown })
    .filter((o) => typeof o.roleId === "string" && validRoles.has(o.roleId))
    .slice(0, 25)
    .map((o) => ({
      roleId: o.roleId as string,
      label: typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 80) : "Role",
      emoji: typeof o.emoji === "string" && o.emoji.trim() ? o.emoji.trim().slice(0, 8) : null,
    }));
  if (options.length === 0) {
    return NextResponse.json({ ok: false, error: "no_valid_roles" }, { status: 400 });
  }

  // Post the menu message.
  const posted = await postComponentsMessage({
    channelId,
    embeds: [{ title, description: "Click a button below to add or remove a role.", color: 0x0e75c1 }],
    components: buildRoleMenuComponents(options),
  });
  if (!posted.ok) {
    return NextResponse.json({ ok: false, error: posted.error }, { status: 502 });
  }

  const admin = createServiceClient();
  const { data: menu, error } = await admin
    .from("discord_role_menus")
    .insert({ user_id: user.id, guild_id: guildId, channel_id: channelId, message_id: posted.messageId, title })
    .select("id")
    .single();
  if (error || !menu) {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
  const menuId = menu.id as string;
  await admin.from("discord_role_menu_options").insert(
    options.map((o, i) => ({ menu_id: menuId, role_id: o.roleId, label: o.label, emoji: o.emoji, position: i })),
  );

  return NextResponse.json({ ok: true, id: menuId, messageId: posted.messageId });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const admin = createServiceClient();
  const { data: menu } = await admin
    .from("discord_role_menus")
    .select("id, channel_id, message_id, user_id")
    .eq("id", id)
    .maybeSingle();
  const m = menu as { channel_id: string; message_id: string | null; user_id: string } | null;
  if (!m || m.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (m.message_id) await deleteMessage(m.channel_id, m.message_id).catch(() => false);
  await admin.from("discord_role_menus").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
