/**
 * GET / PUT /api/discord/bot/pro-role
 *
 * The streamer's chosen "GS Pro" role — GameShuffle keeps it in sync with each
 * linked member's GS Pro tier (worker on join + reconcile cron). GS Pro only.
 * PUT { roleId: string | null } (null clears it).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { listGuildRoles } from "@/lib/adapters/discord/adapter";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data } = await createServiceClient()
    .from("users")
    .select("discord_pro_role_id")
    .eq("id", user.id)
    .maybeSingle();
  return NextResponse.json({ ok: true, roleId: (data as { discord_pro_role_id: string | null } | null)?.discord_pro_role_id ?? null });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("discord_guild_id, subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { discord_guild_id: string | null; subscription_tier: string | null; role: string | null } | null;
  const isPro = effectiveTier({ tier: normalizeTier(p?.subscription_tier ?? null), role: p?.role ?? null }) === "pro";
  if (!isPro) return NextResponse.json({ ok: false, error: "pro_required" }, { status: 403 });
  if (!p?.discord_guild_id) return NextResponse.json({ ok: false, error: "bot_not_installed" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const roleId = (body as { roleId?: unknown })?.roleId;

  let value: string | null = null;
  if (typeof roleId === "string" && roleId) {
    const rolesRes = await listGuildRoles(p.discord_guild_id);
    if (!rolesRes.ok) return NextResponse.json({ ok: false, error: "guild_lookup_failed" }, { status: 502 });
    if (!rolesRes.roles.some((r) => r.id === roleId)) {
      return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
    }
    value = roleId;
  }

  const { error } = await admin.from("users").update({ discord_pro_role_id: value }).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
