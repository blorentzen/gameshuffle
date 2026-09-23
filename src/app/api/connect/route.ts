/**
 * GET  /api/connect        → this organizer's payout account state
 * POST /api/connect        → { action: "onboard" | "dashboard" | "refresh" }
 *
 * Stripe Connect Express: GameShuffle is the platform, the organizer is the
 * seller. Onboarding and the payout dashboard are hosted by Stripe.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { connectDashboardLink, getConnectAccount, startConnectOnboarding, syncConnectAccount } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ account: await getConnectAccount(user.id) });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; returnTo?: string };
  try {
    if (body.action === "onboard") return NextResponse.json(await startConnectOnboarding(user.id, user.email ?? null, body.returnTo ?? null));
    if (body.action === "dashboard") {
      const url = await connectDashboardLink(user.id);
      return url ? NextResponse.json({ url }) : NextResponse.json({ error: "no_account" }, { status: 404 });
    }
    if (body.action === "refresh") {
      const acct = await getConnectAccount(user.id);
      if (acct) await syncConnectAccount(acct.stripeAccountId);
      return NextResponse.json({ account: await getConnectAccount(user.id) });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
