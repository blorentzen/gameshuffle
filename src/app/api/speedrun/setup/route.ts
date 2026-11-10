/**
 * The signed-in runner's speedrun setup (phase 1 contract, "Site: surfaces in step 1").
 *   GET   → { ready: true, setup } (made on the first visit), or { ready: false, reason }:
 *           "not_ready" = the database needs supabase/speedrun-m1.sql, "not_configured" = the relay's settings are missing.
 *   PATCH { look?, game?, category?, attempts?, settings?, splitNames? } → { setup, synced }
 *           (only what changed; synced = the relay heard it). settings is partial; turning the prediction on needs
 *           GS Pro (403 pro_required). splitNames = the phone remote's splits, one per line.
 *   POST  { action: "new-timer" | "new-overlay" } → { setup, synced }  (the old address stops working)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { ensureSetup, newAddress, saveSetup, setupView, speedrunReady } from "@/lib/speedrun/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Why the setup can't be shown yet, if it can't. */
async function blocked(): Promise<NextResponse | null> {
  if (!speedrunEnvOrNull()) return NextResponse.json({ ready: false, reason: "not_configured" }, { status: 503 });
  if (!(await speedrunReady())) return NextResponse.json({ ready: false, reason: "not_ready" }, { status: 503 });
  return null;
}

export async function GET() {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const stop = await blocked();
  if (stop) return stop;
  const setup = await ensureSetup(userId);
  if (!setup) return NextResponse.json({ ready: false, reason: "not_ready" }, { status: 503 });
  return NextResponse.json({ ready: true, setup: await setupView(setup) });
}

export async function PATCH(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await rateLimit(`speedrun-save:${userId}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const stop = await blocked();
  if (stop) return stop;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await saveSetup(userId, {
    look: body.look, game: body.game, category: body.category, attempts: body.attempts, settings: body.settings, splitNames: body.splitNames,
  });
  if (!res.ok) {
    const status = res.error === "bad_attempts" || res.error === "bad_splits" ? 400 : res.error === "pro_required" ? 403 : res.error === "not_ready" ? 503 : 500;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ setup: await setupView(res.setup), synced: res.synced });
}

export async function POST(req: NextRequest) {
  const userId = await authUserId();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await rateLimit(`speedrun-address:${userId}`, { max: 10, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const stop = await blocked();
  if (stop) return stop;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const kind = body?.action === "new-timer" ? "timer" : body?.action === "new-overlay" ? "overlay" : null;
  if (!kind) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await newAddress(userId, kind);
  if (!res) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ setup: await setupView(res.setup), synced: res.synced });
}
