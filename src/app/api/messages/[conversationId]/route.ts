/**
 * GET  /api/messages/[conversationId] → thread messages (+ marks read)
 * POST /api/messages/[conversationId] { body } → send a message
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMessages, sendMessage } from "@/lib/social/messaging";

export const runtime = "nodejs";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { conversationId } = await params;
  const res = await getMessages(conversationId, userId);
  if (!res.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, messages: res.messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { conversationId } = await params;
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body : "";

  const res = await sendMessage(conversationId, userId, text);
  if (!res.ok) {
    return NextResponse.json(
      { error: res.reason ?? "failed" },
      { status: res.reason === "blocked" ? 403 : 400 },
    );
  }
  return NextResponse.json({ ok: true, message: res.message });
}
