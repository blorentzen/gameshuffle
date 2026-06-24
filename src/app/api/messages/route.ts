/** GET /api/messages → the caller's conversation inbox. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/social/messaging";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const conversations = await listConversations(user.id);
  return NextResponse.json({ ok: true, conversations });
}
