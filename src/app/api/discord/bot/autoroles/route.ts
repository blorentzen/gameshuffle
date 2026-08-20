/**
 * GET / PUT /api/discord/bot/autoroles
 *
 * Roles auto-assigned to every new member on join (GS Pro). The gateway worker
 * applies them on GuildMemberAdd. PUT replaces the full set for the guild.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { listGuildRoles } from "@/lib/adapters/discord/adapter";

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

  const { data } = await createServiceClient()
    .from("discord_autoroles")
    .select("role_id")
    .eq("user_id", user.id);
  return NextResponse.json({ ok: true, roleIds: ((data ?? []) as Array<{ role_id: string }>).map((r) => r.role_id) });
}

export async function PUT(request: Request) {
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
  const rawIds = Array.isArray((body as { roleIds?: unknown })?.roleIds) ? (body as { roleIds: unknown[] }).roleIds : [];

  const rolesRes = await listGuildRoles(guildId);
  if (!rolesRes.ok) return NextResponse.json({ ok: false, error: "guild_lookup_failed" }, { status: 502 });
  const validRoles = new Set(rolesRes.roles.map((r) => r.id));
  const roleIds = [...new Set(rawIds.filter((id): id is string => typeof id === "string" && validRoles.has(id)))].slice(0, 10);

  const admin = createServiceClient();
  await admin.from("discord_autoroles").delete().eq("user_id", user.id);
  if (roleIds.length) {
    await admin.from("discord_autoroles").insert(
      roleIds.map((role_id) => ({ user_id: user.id, guild_id: guildId, role_id })),
    );
  }
  return NextResponse.json({ ok: true });
}
