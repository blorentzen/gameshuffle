/**
 * GET /api/comms/unread → { notifications, messages, total }
 * Combined unread for the user-menu Comms indicator.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unreadCount } from "@/lib/social/notifications";
import { listConversations } from "@/lib/social/messaging";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [notifications, conversations] = await Promise.all([
    unreadCount(user.id),
    listConversations(user.id),
  ]);
  const messages = conversations.reduce((n, c) => n + (c.unreadCount || 0), 0);

  return NextResponse.json({ ok: true, notifications, messages, total: notifications + messages });
}
