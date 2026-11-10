/**
 * Is LiveSplit One talking to the relay? The setup screen asks every few seconds (signed in, the runner's own).
 *   GET → SpeedrunStatus, or { reason } with 503 when the database or the relay's settings aren't there yet.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { relayState } from "@/lib/speedrun/relay";
import { setupFor, speedrunReady } from "@/lib/speedrun/store";
import type { SpeedrunStatus } from "@/lib/speedrun/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await rateLimit(`speedrun-status:${user.id}`, { max: 40, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  if (!speedrunEnvOrNull()) return NextResponse.json({ reason: "not_configured" }, { status: 503 });
  if (!(await speedrunReady())) return NextResponse.json({ reason: "not_ready" }, { status: 503 });
  const setup = await setupFor(user.id);
  if (!setup) return NextResponse.json({ reason: "no_setup" }, { status: 404 });

  const res = await relayState(setup.relayId);
  const st = res.ok ? res.state : null;
  const status: SpeedrunStatus = {
    reachable: res.ok,
    connected: !!st?.connected,
    phase: st?.phase ?? "idle",
    started: setup.attempts > setup.attemptBase || (!!st && (st.phase !== "idle" || !!st.last)),
    last: st?.last?.kind ?? null,
    lastAgoMs: st?.last && st.at ? Math.max(0, Date.now() - st.at) : null,
    splits: st?.segments.length ?? setup.run.length,
  };
  return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
}
