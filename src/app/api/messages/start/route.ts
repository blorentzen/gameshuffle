/** POST /api/messages/start { toUserId } → get-or-create a conversation. */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateConversation } from "@/lib/social/messaging";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { toUserId?: unknown } | null;
  const toUserId = typeof body?.toUserId === "string" ? body.toUserId : "";
  if (!toUserId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const res = await getOrCreateConversation(user.id, toUserId);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason ?? "failed" },
      { status: res.reason === "blocked" ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true, id: res.id });
}
