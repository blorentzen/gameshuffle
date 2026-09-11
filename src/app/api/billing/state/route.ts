/**
 * GET /api/billing/state — the current account's billing state for the in-app
 * billing manager: Pro source label, renewals, circuit tier, and whether live
 * plan changes are enabled yet (`circuit_billing_live` flag). Read-only.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";
import { getAccountBilling } from "@/lib/billing/planState";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const admin = createServiceClient();
  const [billing, billingLive] = await Promise.all([
    getAccountBilling(user.id, admin),
    getPlatformFlag("circuit_billing_live", false),
  ]);

  return NextResponse.json({ ok: true, display: billing.display, state: billing.state, billingLive });
}
