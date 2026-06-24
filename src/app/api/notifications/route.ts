/**
 * GET  /api/notifications → { notifications, unread }
 * POST /api/notifications { action: "read_all" | "read", id? } → mark read
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listNotifications,
  unreadCount,
  markAllRead,
  markRead,
} from "@/lib/social/notifications";

export const runtime = "nodejs";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [notifications, unread] = await Promise.all([
    listNotifications(userId),
    unreadCount(userId),
  ]);
  return NextResponse.json({ ok: true, notifications, unread });
}

export async function POST(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; id?: unknown } | null;
  const action = body?.action;
  if (action === "read_all") {
    await markAllRead(userId);
  } else if (action === "read" && typeof body?.id === "string") {
    await markRead(userId, body.id);
  } else {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
