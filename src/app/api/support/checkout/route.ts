/**
 * POST /api/support/checkout { kind: "once" | "monthly", cents, wallName?, wallNote?, showOnWall? }
 * → { url } for Stripe Checkout (src/lib/support/store.ts). Anyone can give
 * once; monthly needs an account (managed in Plans & billing). US only for
 * now, like GS Pro: other countries get { error: "us_only" }.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { paidPlanAvailability } from "@/lib/billing/availability";
import { rateLimit } from "@/lib/ratelimit";
import { startSupportCheckout } from "@/lib/support/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok: under } = await rateLimit(`support-checkout:${ip}`, { max: 10, windowMs: 10 * 60_000 });
  if (!under) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const where = paidPlanAvailability(req);
  if (!where.available) return NextResponse.json({ error: "us_only", message: "Support is open in the US for now. Thank you for wanting to help!" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; cents?: unknown; wallName?: unknown; wallNote?: unknown; showOnWall?: unknown };
  const kind = body.kind === "monthly" ? "monthly" : "once";
  const cents = typeof body.cents === "number" && Number.isFinite(body.cents) ? Math.round(body.cents) : null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const res = await startSupportCheckout({
    kind, cents: cents ?? 0, user: user ? { id: user.id, email: user.email ?? null } : null,
    wallName: body.wallName, wallNote: body.wallNote, showOnWall: body.showOnWall === true, origin,
  });
  if (!res.ok) return NextResponse.json({ error: res.error, message: res.message }, { status: res.error === "failed" ? 500 : res.error === "sign_in" ? 401 : 400 });
  return NextResponse.json({ url: res.url });
}
