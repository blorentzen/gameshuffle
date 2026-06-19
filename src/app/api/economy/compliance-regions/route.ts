/**
 * GET /api/economy/compliance-regions
 *
 * Returns the list of regions currently restricted from full
 * prediction-pool participation. Surfaces:
 *   - Streamer-side module detail modal (Community tab)
 *   - Viewer-side /live markets tab
 *
 * Public read — gs_compliance_rules has a public SELECT RLS policy
 * so anyone can introspect "is my region restricted?" without
 * needing an auth session. Cached server-side via the in-process
 * 5-minute TTL on `listRestrictedRegions`.
 */

import { NextResponse } from "next/server";
import { listRestrictedRegions } from "@/lib/economy/compliance/gate";

export const runtime = "nodejs";

export async function GET() {
  const regions = await listRestrictedRegions();
  return NextResponse.json({ ok: true, regions });
}
