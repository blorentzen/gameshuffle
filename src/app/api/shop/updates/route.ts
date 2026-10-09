/**
 * POST /api/shop/updates { email? } → join the "email me when the packs go live" list.
 * Signed-in visitors use their account email; signed-out visitors give one.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { joinShopUpdates, shopUpdatesConfigured } from "@/lib/store/updates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`shop-updates:${ip}`, { max: 5, windowMs: 60_000 });
  if (!under) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  if (!shopUpdatesConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? (typeof body.email === "string" ? body.email : "");
  if (!email) return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  const ok = await joinShopUpdates({ email, name: (user?.user_metadata?.display_name as string | undefined) ?? null, origin: user ? "account" : "public" });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "bad_email" }, { status: 400 });
}
