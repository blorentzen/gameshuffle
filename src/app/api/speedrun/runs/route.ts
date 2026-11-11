/**
 * My runs (speedrun templates picks 2026-11-10, 6A), signed in.
 *   GET                         { ready, runs: SpeedrunRunView[] (the one on stream first), max }
 *   POST { action: "use", id }  puts a saved run on stream (refused while a run is going)
 *   POST { action: "add" }      keeps the run on stream and starts a fresh one
 *   POST { action: "remove", id }  removes a saved run (never the one on stream)
 * Each answers with the setup (as GET /api/speedrun/setup) and the runs.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { setupFor, setupView } from "@/lib/speedrun/store";
import { addRun, listRuns, removeRun, useRun as putOnStream } from "@/lib/speedrun/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await who();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  return NextResponse.json(await listRuns(userId));
}

const STATUS: Record<string, number> = { not_ready: 503, no_setup: 404, not_found: 404, running: 409, too_many: 409, active: 409, failed: 500 };

export async function POST(req: NextRequest) {
  const userId = await who();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await rateLimit(`speedrun-runs:${userId}`, { max: 20, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;
  const id = typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const res = body?.action === "use" && id ? await putOnStream(userId, id)
    : body?.action === "remove" && id ? await removeRun(userId, id)
      : body?.action === "add" ? await addRun(userId)
        : null;
  if (!res) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: STATUS[res.error] ?? 500 });
  const setup = await setupFor(userId);
  return NextResponse.json({ ok: true, setup: setup ? await setupView(setup) : null, ...(await listRuns(userId)) });
}
