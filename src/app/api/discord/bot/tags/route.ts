/**
 * GET/POST/DELETE /api/discord/bot/tags: the web side of `/gs-tag` (name, web and docs pick 8A), the account's server
 * replies. Tags belong to the account, so every server it runs the bot in shares them. Anyone can see their own;
 * saving and deleting are GS Pro, like the command.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";

export const runtime = "nodejs";

const NAME = /^[a-z0-9][a-z0-9 _-]{0,31}$/;

async function who() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await who();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  const { data } = await createServiceClient().from("discord_tags").select("name, content, updated_at").eq("owner_user_id", user.id).order("name");
  return NextResponse.json({ tags: data ?? [], pro: await isProUser(user.id) });
}

export async function POST(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await isProUser(user.id))) return NextResponse.json({ error: "pro_required" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; content?: unknown; was?: unknown };
  const name = String(body.name ?? "").trim().toLowerCase();
  const content = String(body.content ?? "").trim().slice(0, 2000);
  if (!NAME.test(name)) return NextResponse.json({ error: "bad_name" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "empty" }, { status: 400 });
  const db = createServiceClient();
  const { error } = await db.from("discord_tags").upsert({ owner_user_id: user.id, name, content, updated_at: new Date().toISOString() }, { onConflict: "owner_user_id,name" });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  // A rename: the old name goes once the new one is saved.
  const was = typeof body.was === "string" ? body.was.trim().toLowerCase() : "";
  if (was && was !== name) await db.from("discord_tags").delete().eq("owner_user_id", user.id).eq("name", was);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await who();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await isProUser(user.id))) return NextResponse.json({ error: "pro_required" }, { status: 403 });
  const name = (new URL(request.url).searchParams.get("name") ?? "").trim().toLowerCase();
  await createServiceClient().from("discord_tags").delete().eq("owner_user_id", user.id).eq("name", name);
  return NextResponse.json({ ok: true });
}
