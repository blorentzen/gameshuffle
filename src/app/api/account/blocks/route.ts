/**
 * GET    /api/account/blocks                       → accounts you've blocked
 * POST   /api/account/blocks { blockedUserId }     → block someone
 * DELETE /api/account/blocks?blockedUserId=<id>    → unblock
 *
 * Caller is always the blocker. Blocking is enforced as mutual hide +
 * interaction-stop via isBlocked() on customer-facing surfaces.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addBlock, listBlockedByUser, removeBlock } from "@/lib/moderation/blocks";

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
  const blocked = await listBlockedByUser(userId);
  return NextResponse.json({ ok: true, blocked });
}

export async function POST(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { blockedUserId?: unknown } | null;
  const blockedUserId = typeof body?.blockedUserId === "string" ? body.blockedUserId : "";
  if (!blockedUserId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (blockedUserId === userId) {
    return NextResponse.json({ error: "cannot_block_self" }, { status: 400 });
  }

  await addBlock(userId, blockedUserId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const blockedUserId = req.nextUrl.searchParams.get("blockedUserId") ?? "";
  if (!blockedUserId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  await removeBlock(userId, blockedUserId);
  return NextResponse.json({ ok: true });
}
