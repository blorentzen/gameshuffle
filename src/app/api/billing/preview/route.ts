/**
 * POST /api/billing/preview — resolve a Pro × Circuit plan change WITHOUT
 * executing it. Returns the ordered billing ops, resulting entitlements, any
 * opt-in offer, and confirm-screen copy (prorated-credit notes). Read-only and
 * safe: it never touches Stripe. The in-app billing UI calls this to build the
 * confirm screen before a change.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
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

  return NextResponse.json({ ok: true, preview, display: billing.display });
}
