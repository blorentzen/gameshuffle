/**
 * POST /api/billing/waitlist — join the paid-plans waitlist (outside the US).
 * Body: { product?: "pro" | "circuit", email? }. Signed-in visitors use their
 * account email; signed-out visitors give one.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countryFromRequest } from "@/lib/billing/availability";
import { joinPaidPlansWaitlist } from "@/lib/billing/waitlist";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`paid-waitlist:${ip}`, { max: 5, windowMs: 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { product?: string; email?: string };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? (typeof body.email === "string" ? body.email : "");
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  const ok = await joinPaidPlansWaitlist({
    email,
    name: (user?.user_metadata?.display_name as string | undefined) ?? null,
    country: countryFromRequest(request),
    product: body.product === "circuit" ? "circuit" : "pro",
    origin: user ? "account" : "public",
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "failed" }, { status: 502 });
}
