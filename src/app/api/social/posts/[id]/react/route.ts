/** React to a post. POST { emoji } — add. DELETE ?emoji= — remove. */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { reactToPost, removeReaction } from "@/lib/social/feed";

export const runtime = "nodejs";

// The CDS Reactions emoji set — reject anything else.
const ALLOWED = new Set(["👍", "❤️", "😄", "🎉", "😕", "👀"]);

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
  if (!ALLOWED.has(emoji)) return NextResponse.json({ error: "invalid emoji" }, { status: 400 });

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
  if (!ALLOWED.has(emoji)) return NextResponse.json({ error: "invalid emoji" }, { status: 400 });

  await removeReaction({ postId: id, userId: user.id, emoji });
  return NextResponse.json({ ok: true });
}
