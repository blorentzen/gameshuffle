/**
 * GET  /api/account/appeal  → caller's moderation status + open-appeal flag
 * POST /api/account/appeal { message } → submit an appeal (suspended/banned only)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createAppeal, getOpenAppeal } from "@/lib/moderation/appeals";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const { data: u } = await admin
    .from("users")
    .select("moderation_status, moderation_until, moderation_reason")
    .eq("id", user.id)
    .maybeSingle();
  const open = await getOpenAppeal(user.id);

  return NextResponse.json({
    ok: true,
    moderationStatus: (u?.moderation_status as string | null) ?? "ok",
    moderationUntil: (u?.moderation_until as string | null) ?? null,
    moderationReason: (u?.moderation_reason as string | null) ?? null,
    hasOpenAppeal: !!open,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (message.length < 10) {
    return NextResponse.json({ error: "message_too_short" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: u } = await admin
    .from("users")
    .select("moderation_status")
    .eq("id", user.id)
    .maybeSingle();
  const status = (u?.moderation_status as string | null) ?? "ok";
  if (status !== "suspended" && status !== "banned") {
    return NextResponse.json({ error: "not_moderated" }, { status: 400 });
  }

  try {
    await createAppeal(user.id, message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "appeal_failed" }, { status: 500 });
  }
}
