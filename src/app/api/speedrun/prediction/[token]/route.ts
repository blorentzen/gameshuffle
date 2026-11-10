/**
 * The overlay's prediction line (OBS, by the overlay link): GET /api/speedrun/prediction/<overlay token>
 *   → { prediction: SpeedrunPredictionView | null }   (one in play, or a result from the last few minutes)
 * Public by link like the overlay itself, cached a few seconds at the edge. Null while the runner has the prediction
 * switched off or has no GS Pro (the result of one already running still shows).
 */

import { NextResponse } from "next/server";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { setupForOverlayToken, speedrunReady } from "@/lib/speedrun/store";
import { shownPrediction } from "@/lib/speedrun/prediction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "cache-control": "public, max-age=0, s-maxage=3, stale-while-revalidate=5" };

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!speedrunEnvOrNull() || !(await speedrunReady())) return NextResponse.json({ prediction: null }, { headers: CACHE });
  const setup = await setupForOverlayToken(token);
  if (!setup) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const prediction = await shownPrediction(setup.relayId).catch(() => null);
  return NextResponse.json({ prediction }, { headers: CACHE });
}
