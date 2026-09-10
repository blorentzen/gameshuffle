/**
 * GET /api/tournaments/billing-status — public read of the single
 * `organizer_billing_enabled` flag, so the create flow can show the right
 * "free while in preview" vs. paid messaging. Exposes only this one flag.
 */

import { NextResponse } from "next/server";
import { getPlatformFlag } from "@/lib/platform/flags";

export const runtime = "nodejs";

export async function GET() {
  const billingEnabled = await getPlatformFlag("organizer_billing_enabled", false);
  return NextResponse.json({ billingEnabled });
}
