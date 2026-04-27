/**
 * GET /api/cron/session-lifecycle
 *
 * Vercel Cron entrypoint for the session lifecycle sweep. Runs every 5
 * minutes per `vercel.json`. Per gs-pro-v1-phase-2-spec.md §4.
 *
 * The actual sweep logic lives in src/lib/sessions/lifecycle-sweep.ts.
 * This route is a thin auth + dispatch wrapper.
 *
 * Auth: matches the existing `/api/cron/modules-timer-sweep` and
 * `/api/cron/trial-reminder` pattern — Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`. If CRON_SECRET is unset in
 * production we hard-fail; in dev/local with no secret we let the
 * request through so manual invocations work.
 */

import { NextResponse } from "next/server";
import { runLifecycleSweep } from "@/lib/sessions/lifecycle-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/session-lifecycle] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const result = await runLifecycleSweep();
    const durationMs = Date.now() - startedAt;
    console.log("[cron/session-lifecycle]", { durationMs, ...result });
    return NextResponse.json({ ok: true, durationMs, ...result });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error("[cron/session-lifecycle] sweep threw", { durationMs, err });
    return NextResponse.json(
      { error: "sweep_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
