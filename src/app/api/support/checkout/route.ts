/**
 * POST /api/support/checkout { kind: "once" | "monthly", cents, level?, wallName?, wallNote?, showOnWall?, turnstileToken, returnTo? }
 * → { url } for Stripe Checkout (src/lib/support/store.ts). Anyone can give
 * once (any amount from $3); monthly is a level (supporter, backer or
 * champion; Backer and Champion include GS Pro) and needs an account. An
 * account that already pays for GS Pro gets { error: "already_pro" } (409) for
 * a level with GS Pro. US only for
 * now, like GS Pro: other countries get { error: "us_only" }. A passed
 * Turnstile check is required ({ error: "captcha" } otherwise): an open
 * checkout with a small amount is what card testers look for.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paidPlanAvailability } from "@/lib/billing/availability";
import { rateLimit } from "@/lib/ratelimit";
import { startSupportCheckout } from "@/lib/support/store";
import { supportLevel } from "@/lib/support/rules";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { CHECKOUT_RETURN_PATHS } from "@/lib/stripe/checkoutReturn";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`support-checkout:${ip}`, { max: 10, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const where = paidPlanAvailability(req);
  if (!where.available) return NextResponse.json({ error: "us_only", message: "Support is open in the US for now. Thank you for wanting to help!" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; cents?: unknown; level?: unknown; wallName?: unknown; wallNote?: unknown; showOnWall?: unknown; turnstileToken?: unknown; returnTo?: unknown };
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : null;
  if (!(await verifyTurnstileToken(token, ip === "unknown" ? undefined : ip))) return NextResponse.json({ error: "captcha" }, { status: 400 });
  const kind = body.kind === "monthly" ? "monthly" : "once";
  const cents = typeof body.cents === "number" && Number.isFinite(body.cents) ? Math.round(body.cents) : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const res = await startSupportCheckout({
    kind, cents: cents ?? 0, level: supportLevel(body.level)?.id ?? null, user: user ? { id: user.id, email: user.email ?? null } : null,
    wallName: body.wallName, wallNote: body.wallNote, showOnWall: body.showOnWall === true, origin,
    returnTo: typeof body.returnTo === "string" && CHECKOUT_RETURN_PATHS.includes(body.returnTo) ? body.returnTo : null,
  });
  if (!res.ok) return NextResponse.json({ error: res.error, message: res.message }, { status: res.error === "failed" ? 500 : res.error === "sign_in" ? 401 : res.error === "already_pro" ? 409 : 400 });
  return NextResponse.json({ url: res.url });
}
