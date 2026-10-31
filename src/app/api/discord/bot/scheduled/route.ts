/**
 * GET / DELETE /api/discord/bot/scheduled
 *
 * One server's upcoming scheduled Discord announcements (+ follow-ups, ?guild=)
 * so the streamer can find and cancel them. GET lists pending; DELETE ?id= cancels one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { botServer } from "@/lib/discord/botServer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await botServer(request, { allowRemoved: true });
  if (!ctx.ok) return ctx.response.status === 404 ? NextResponse.json({ ok: true, posts: [] }) : ctx.response;

  // The picked server's posts; ones scheduled before servers had their own
  // (no guild) show on the main server.
  const { data } = await createServiceClient()
    .from("discord_scheduled_posts")
    .select("id, category, content, fire_at")
    .eq("user_id", ctx.userId)
    .or(ctx.guild.isMain ? `guild_id.eq.${ctx.guild.guildId},guild_id.is.null` : `guild_id.eq.${ctx.guild.guildId}`)
    .eq("status", "pending")
    .order("fire_at", { ascending: true })
    .limit(50);
  return NextResponse.json({
    ok: true,
    posts: ((data ?? []) as Array<{ id: string; category: string; content: { title?: string }; fire_at: string }>).map((p) => ({
      id: p.id,
      category: p.category,
      title: p.content?.title ?? "(untitled)",
      fireAt: p.fire_at,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  await createServiceClient()
    .from("discord_scheduled_posts")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending");
  return NextResponse.json({ ok: true });
}
