/**
 * Platform Admin → Pricing.
 *
 *   GET  /api/admin/pricing                  → plans, prices, levers, recent audit
 *   POST /api/admin/pricing  { action, ... } → one of:
 *        price.change   { planId, interval, amountCents }
 *        lever.set      { key, valueNum?, valueText? }
 *        plan.update    { planId, name?, blurb?, capabilities?, limits?, active? }
 *        sync.stripe    {}   (backfill ids by lookup key, report drift + unmapped)
 *
 * Staff/admin only. Price changes create a new Stripe Price and archive the
 * old one; existing subscribers are NOT moved (decided 2026-09-21).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";
import { getCatalog, type PlanId, type PriceInterval } from "@/lib/pricing/catalog";
import { changePrice, reconcile, setLever, updatePlan } from "@/lib/pricing/stripeSync";

export const runtime = "nodejs";

async function requireStaff(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
  if (!isStaffRole((data as { role: string | null } | null)?.role ?? null)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, userId: user.id };
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const c = await getCatalog();
  const { data: audit } = await createServiceClient().from("gs_pricing_audit").select("id, actor_id, action, target, before, after, created_at").order("id", { ascending: false }).limit(25);
  return NextResponse.json({
    plans: c.plans,
    prices: c.prices,
    levers: [...c.levers.values()].sort((a, b) => a.key.localeCompare(b.key)),
    audit: audit ?? [],
    livemode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_"),
  });
}

const PLAN_IDS = new Set<PlanId>(["free", "pro", "pro_addon", "circuit_64", "circuit_256", "circuit_events"]);
const INTERVALS = new Set<PriceInterval>(["month", "year", "once"]);

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  try {
    if (action === "price.change") {
      const planId = body.planId as PlanId; const interval = body.interval as PriceInterval; const amountCents = Number(body.amountCents);
      if (!PLAN_IDS.has(planId) || !INTERVALS.has(interval) || !Number.isInteger(amountCents)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const r = await changePrice({ planId, interval, amountCents, actorId: auth.userId });
      return NextResponse.json({ ok: true, ...r });
    }
    if (action === "lever.set") {
      const key = String(body.key ?? "");
      if (!/^[a-z0-9_.]{3,80}$/.test(key)) return NextResponse.json({ error: "bad_key" }, { status: 400 });
      const valueNum = body.valueNum === undefined ? undefined : body.valueNum === null ? null : Number(body.valueNum);
      if (valueNum !== undefined && valueNum !== null && !Number.isFinite(valueNum)) return NextResponse.json({ error: "bad_value" }, { status: 400 });
      const valueText = body.valueText === undefined ? undefined : body.valueText === null ? null : String(body.valueText).slice(0, 200);
      await setLever({ key, valueNum, valueText, actorId: auth.userId });
      return NextResponse.json({ ok: true });
    }
    if (action === "plan.update") {
      const planId = body.planId as PlanId;
      if (!PLAN_IDS.has(planId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      await updatePlan({
        planId, actorId: auth.userId,
        name: typeof body.name === "string" ? body.name.slice(0, 80) : undefined,
        blurb: body.blurb === undefined ? undefined : body.blurb === null ? null : String(body.blurb).slice(0, 400),
        capabilities: Array.isArray(body.capabilities) ? (body.capabilities as unknown[]).map(String).slice(0, 200) : undefined,
        limits: body.limits && typeof body.limits === "object" ? (body.limits as Record<string, unknown>) : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "sync.stripe") {
      const r = await reconcile(auth.userId);
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
