/**
 * GET  /api/chat-brain/updates → { configured }  (is the launch email list set up here?)
 * POST /api/chat-brain/updates  { email? } → join the "email me when it opens" list.
 * Signed-in visitors use their account email; signed-out visitors give one.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { joinChatBrainUpdates, updatesConfigured } from "@/lib/chatbrain/updates";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, configured: updatesConfigured() });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`brain-updates:${ip}`, { max: 5, windowMs: 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!updatesConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? (typeof body.email === "string" ? body.email : "");
  if (!email) return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  const ok = await joinChatBrainUpdates({ email, name: (user?.user_metadata?.display_name as string | undefined) ?? null, origin: user ? "account" : "public" });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "bad_email" }, { status: 400 });
}
