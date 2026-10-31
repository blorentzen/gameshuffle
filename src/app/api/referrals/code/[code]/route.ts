/**
 * GET /api/referrals/code/K7Q2MX → { name, finish, start } for the note a
 * friend sees above the game ("Sam sent you today's Daily"): the sharer's
 * display name, what a finish earns them, and what the friend would start
 * with on a new account. { name: null } for an unknown code.
 */

import { NextResponse } from "next/server";
import { referralLevers, referrerFor, welcomeGrant } from "@/lib/referrals/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await referrerFor(code).catch(() => null);
  if (!referrer) return NextResponse.json({ name: null });
  const [levers, grant] = await Promise.all([referralLevers(), welcomeGrant()]);
  return NextResponse.json({ name: referrer.name, finish: levers.finish, start: grant + levers.welcome }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
