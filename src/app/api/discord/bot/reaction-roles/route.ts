/**
 * GET / POST / DELETE /api/discord/bot/reaction-roles
 *
 * Emoji reaction roles (GS Pro). POST posts a message, seeds it with each
 * emoji as a reaction, and stores the emoji→role mappings; the gateway worker
 * assigns roles when members react. GET lists them; DELETE removes one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  listTextChannels,
  listGuildRoles,
  postEmbed,
  addReaction,
  deleteMessage,
} from "@/lib/adapters/discord/adapter";

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
    .from("discord_reaction_roles")
    .select("channel_id, message_id, emoji, role_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Array<{ channel_id: string; message_id: string; emoji: string; role_id: string }>;

  const byMessage = new Map<string, { messageId: string; channelId: string; mappings: Array<{ emoji: string; roleId: string }> }>();
  for (const r of rows) {
    let m = byMessage.get(r.message_id);
    if (!m) byMessage.set(r.message_id, (m = { messageId: r.message_id, channelId: r.channel_id, mappings: [] }));
    m.mappings.push({ emoji: r.emoji, roleId: r.role_id });
  }
  return NextResponse.json({ ok: true, messages: [...byMessage.values()] });
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
  const b = body as { channelId?: unknown; title?: unknown; description?: unknown; mappings?: unknown };
  const channelId = typeof b.channelId === "string" ? b.channelId : "";
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 1500) : "";
  const rawMappings = Array.isArray(b.mappings) ? b.mappings : [];
  if (!channelId || !title || rawMappings.length === 0) {
    return NextResponse.json({ ok: false, error: "channel_title_mappings_required" }, { status: 400 });
  }

  const [channelsRes, rolesRes] = await Promise.all([listTextChannels(guildId), listGuildRoles(guildId)]);
  if (!channelsRes.ok || !rolesRes.ok) {
    return NextResponse.json({ ok: false, error: "guild_lookup_failed" }, { status: 502 });
  }
  if (!channelsRes.channels.some((c) => c.id === channelId)) {
    return NextResponse.json({ ok: false, error: "invalid_channel" }, { status: 400 });
  }
  const validRoles = new Set(rolesRes.roles.map((r) => r.id));

  const seenEmoji = new Set<string>();
  const mappings = rawMappings
    .map((m) => m as { emoji?: unknown; roleId?: unknown })
    .filter((m) => typeof m.emoji === "string" && m.emoji.trim() && typeof m.roleId === "string" && validRoles.has(m.roleId))
    .map((m) => ({ emoji: (m.emoji as string).trim(), roleId: m.roleId as string }))
    .filter((m) => (seenEmoji.has(m.emoji) ? false : (seenEmoji.add(m.emoji), true)))
    .slice(0, 20);
  if (mappings.length === 0) {
    return NextResponse.json({ ok: false, error: "no_valid_mappings" }, { status: 400 });
  }

  // Post the message: title + optional blurb + an emoji→role legend.
  const legend = mappings.map((m) => `${m.emoji} <@&${m.roleId}>`).join("\n");
  const posted = await postEmbed({
    channelId,
    embed: {
      title,
      description: [description, legend].filter(Boolean).join("\n\n"),
      color: 0x0e75c1,
    },
  });
  if (!posted.ok) {
    return NextResponse.json({ ok: false, error: posted.error }, { status: 502 });
  }

  // Seed the reactions so members can click them.
  for (const m of mappings) {
    await addReaction(channelId, posted.messageId, m.emoji);
  }

  const admin = createServiceClient();
  await admin.from("discord_reaction_roles").insert(
    mappings.map((m) => ({
      user_id: user.id,
      guild_id: guildId,
      channel_id: channelId,
      message_id: posted.messageId,
      emoji: m.emoji,
      role_id: m.roleId,
    })),
  );

  return NextResponse.json({ ok: true, messageId: posted.messageId });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const messageId = request.nextUrl.searchParams.get("messageId");
  if (!messageId) return NextResponse.json({ ok: false, error: "missing_messageId" }, { status: 400 });

  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("discord_reaction_roles")
    .select("channel_id, user_id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .limit(1);
  const row = (rows ?? [])[0] as { channel_id: string } | undefined;
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  await deleteMessage(row.channel_id, messageId).catch(() => false);
  await admin.from("discord_reaction_roles").delete().eq("message_id", messageId).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
