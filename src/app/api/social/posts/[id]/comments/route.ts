/** Post comments. GET — threaded list (viewer-aware likes). POST { body, parentId? } — add. */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userCanUseCommunity } from "@/lib/community/guard";
import { listComments, markLiked, addComment } from "@/lib/social/feed";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await userCanUseCommunity(user.id))) return NextResponse.json({ error: "unavailable" }, { status: 403 });

  const tree = await listComments(id);
  await markLiked(id, user.id, tree);
  return NextResponse.json({ ok: true, comments: tree });
}

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
  const b = body as { body?: unknown; parentId?: unknown };
  const text = typeof b?.body === "string" ? b.body : "";
  const parentId = typeof b?.parentId === "string" ? b.parentId : null;

  const res = await addComment({ postId: id, authorId: user.id, parentId, body: text });
  if (!res.ok) {
    const status = res.reason === "rate_limited" ? 429 : res.reason === "not_found" ? 404 : 400;
    return NextResponse.json({ error: res.reason }, { status });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
