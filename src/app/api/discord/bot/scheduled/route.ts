/**
 * GET / DELETE /api/discord/bot/scheduled
 *
 * The streamer's upcoming scheduled Discord announcements (+ follow-ups) so they
 * can find and cancel them. GET lists pending; DELETE ?id= cancels one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { data } = await createServiceClient()
    .from("discord_scheduled_posts")
    .select("id, category, content, fire_at")
    .eq("user_id", user.id)
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
