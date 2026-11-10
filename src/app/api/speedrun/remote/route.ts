/**
 * The phone remote (/speedrun/remote), signed in, the runner's own relay only.
 *   GET  → { reachable, state, overlays, prediction }   (the run, how many overlays are open, chat's prediction)
 *   POST { command: start | split | undo | skip | reset | pause | resume } → { ok: true, state, overlays }
 *        or { ok: false, error } (LiveSplit One's refusals by name: busy = it's on a settings screen, no_run,
 *        run_finished, cant_undo_first_split…). With LiveSplit One connected the command drives it; without, the
 *        relay keeps the time itself (remote mode).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { REMOTE_COMMANDS, relayCmd, relayState, type RemoteCommand } from "@/lib/speedrun/relay";
import { ensureSetup, speedrunReady, syncRelay } from "@/lib/speedrun/store";
import { shownPrediction } from "@/lib/speedrun/prediction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!speedrunEnvOrNull()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!(await speedrunReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  return { userId: user.id };
}

export async function GET() {
  const who = await owner();
  if (who instanceof NextResponse) return who;
  if (!(await rateLimit(`speedrun-remote-read:${who.userId}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const setup = await ensureSetup(who.userId);
  if (!setup) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const [res, prediction] = await Promise.all([relayState(setup.relayId), shownPrediction(setup.relayId).catch(() => null)]);
  return NextResponse.json(
    {
      reachable: res.ok,
      state: res.ok ? res.state : null,
      overlays: res.ok ? res.overlays : null,
      prediction: prediction && res.ok && res.state && prediction.attempt === res.state.attempt ? prediction : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const who = await owner();
  if (who instanceof NextResponse) return who;
  // Splits come seconds apart at most; this only stops a stuck button.
  if (!(await rateLimit(`speedrun-remote:${who.userId}`, { max: 120, windowMs: 60_000 })).ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { command?: unknown } | null;
  const command = typeof body?.command === "string" && (REMOTE_COMMANDS as readonly string[]).includes(body.command) ? (body.command as RemoteCommand) : null;
  if (!command) return NextResponse.json({ ok: false, error: "bad_command" }, { status: 400 });
  const setup = await ensureSetup(who.userId);
  if (!setup) return NextResponse.json({ ok: false, error: "not_ready" }, { status: 503 });
  let res = await relayCmd(setup.relayId, command);
  // A relay that lost the run (a fresh object): send the saved splits and try once more.
  if (!res.ok && res.error === "no_splits" && setup.run.length && (await syncRelay(setup))) res = await relayCmd(setup.relayId, command);
  return NextResponse.json(res, { headers: { "cache-control": "no-store" } });
}
