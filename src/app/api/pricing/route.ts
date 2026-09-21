/**
 * GET /api/pricing → public pricing snapshot for marketing + account surfaces.
 * Amounts come from the lever model (gs_pricing_prices) so a price change in
 * Platform → Pricing shows up everywhere without a deploy. Cached 60s at the
 * edge; falls back to the code constants when the tables aren't applied yet.
 */

import { NextResponse } from "next/server";
import { getPublicPricing } from "@/lib/pricing/public";

export const runtime = "nodejs";

export async function GET() {
  const pricing = await getPublicPricing();
  return NextResponse.json(pricing, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
