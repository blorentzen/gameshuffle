/** React to a comment. POST { emoji } adds, DELETE ?emoji= removes. `emoji` is one of the six emoji or a sticker ("s:<id>"). */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { rateLimit } from "@/lib/ratelimit";
import { reactToComment, unreactComment } from "@/lib/social/feed";
import { isReactionKey } from "@/lib/social/reactions";

export const runtime = "nodejs";

async function viewer() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!(await userCanUseCommunity(user.id))) return { error: NextResponse.json({ error: "unavailable" }, { status: 403 }) };
  if (!(await rateLimit(`comment-react:${user.id}`, { max: 60, windowMs: 60_000 })).ok) return { error: NextResponse.json({ error: "slow_down" }, { status: 429 }) };
  return { user };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await viewer();
  if ("error" in v) return v.error;
  const body = (await req.json().catch(() => null)) as { emoji?: unknown } | null;
  if (!isReactionKey(body?.emoji)) return NextResponse.json({ error: "invalid emoji" }, { status: 400 });
  const ok = await reactToComment(id, v.user.id, body.emoji);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await viewer();
  if ("error" in v) return v.error;
  const emoji = req.nextUrl.searchParams.get("emoji") ?? "";
  if (!isReactionKey(emoji)) return NextResponse.json({ error: "invalid emoji" }, { status: 400 });
  await unreactComment(id, v.user.id, emoji);
  return NextResponse.json({ ok: true });
}
