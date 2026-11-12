/**
 * GET /api/speedrun/race/<overlay token>: the race this runner is in (counting down, running, or finished in the last
 * two minutes), for their OBS overlay: { race: { watchUrl, key, code } | null }. The overlay token is the OBS link's.
 */

import { NextResponse, type NextRequest } from "next/server";
import { setupForOverlayToken } from "@/lib/speedrun/store";
import { overlayRaceFor } from "@/lib/versus/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const setup = await setupForOverlayToken((await params).token).catch(() => null);
  if (!setup) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const race = await overlayRaceFor(setup.userId).catch(() => null);
  return NextResponse.json({ race }, { headers: { "cache-control": "no-store" } });
}
