/** React to a post. POST { emoji } adds, DELETE ?emoji= removes. `emoji` is one of the six emoji or a sticker ("s:<id>"). */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { reactToPost, removeReaction } from "@/lib/social/feed";
import { isReactionKey } from "@/lib/social/reactions";

export const runtime = "nodejs";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const emoji = typeof (body as { emoji?: unknown })?.emoji === "string" ? (body as { emoji: string }).emoji : "";
  if (!isReactionKey(emoji)) return NextResponse.json({ error: "invalid emoji" }, { status: 400 });

  await reactToPost({ postId: id, userId: user.id, emoji });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  const emoji = req.nextUrl.searchParams.get("emoji") ?? "";
  if (!isReactionKey(emoji)) return NextResponse.json({ error: "invalid emoji" }, { status: 400 });

  await removeReaction({ postId: id, userId: user.id, emoji });
  return NextResponse.json({ ok: true });
}
