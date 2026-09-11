/**
 * POST /api/billing/change — apply a Pro × Circuit plan change.
 *
 * GATED. Per gs-circuit-pro-addendum Phase C, we build the flow but PAUSE
 * before wiring live Stripe operations. This endpoint resolves the change and,
 * while the `circuit_billing_live` platform flag is OFF, returns the resolved
 * plan WITHOUT executing any Stripe operation. When the flag is turned on, the
 * executor (a later commit, behind the "live Stripe operations" commit gate)
 * runs `preview.ops`. It never performs a live billing operation today.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";
import { getAccountBilling } from "@/lib/billing/planState";
import { resolvePlanChange, type PlanTarget } from "@/lib/billing/planChange";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let target: PlanTarget;
  try {
    const body = await request.json();
    target = body.target as PlanTarget;
    if (!target || typeof target.kind !== "string") throw new Error("bad target");
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_target" }, { status: 400 });
  }

  const admin = createServiceClient();
  const billing = await getAccountBilling(user.id, admin);
  const preview = resolvePlanChange(billing.state, target);

  if (preview.errors?.length) {
    return NextResponse.json({ ok: false, error: "invalid_change", detail: preview.errors, preview }, { status: 409 });
  }

  const billingLive = await getPlatformFlag("circuit_billing_live", false);
  if (!billingLive) {
    // Flow is wired; live execution is deliberately paused (commit gate).
    return NextResponse.json({ ok: false, reason: "billing_not_live", preview });
  }

  // NOTE: live executor slots in here once the add-on Stripe product exists and
  // the "live Stripe operations" commit gate is cleared. It executes
  // `preview.ops` in order. Intentionally not implemented yet.
  return NextResponse.json({ ok: false, reason: "executor_not_implemented", preview }, { status: 501 });
}
