/**
 * GET /api/cron/modules-timer-sweep
 *
 * Daily-running sweep that auto-locks picks/bans modules whose collection
 * timer has expired. Per gs-feature-modules-picks-bans.md §4 — when
 * `confirm_mode` is `auto` or `manual_with_timeout`, an unattended round
 * should snap to `locked` once `timer_seconds` elapse from the first
 * pick/ban (which stamps `state.timer_started_at`).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject
 * anything without it so the route can't be triggered by hand.
 *
 * Idempotence: any row already past `collecting` is skipped — re-runs
 * are no-ops.
 *
 * Schedule (vercel.json): every minute. Picks/bans timers are typically
 * 60–180s, so a per-minute sweep is the right granularity. Cost is
 * trivial — Supabase query + maybe a handful of writes per tick.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface ModuleRow {
  id: string;
  module_id: string;
  config: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron/modules-timer] CRON_SECRET missing in production");
    return NextResponse.json({ error: "misconfigured" }, { status: 500 });
  }

  const admin = createServiceClient();

  // Pull every enabled picks/bans module. A real implementation could
  // narrow further with a SQL filter on jsonb fields, but per-module
  // auto-lock criteria mix config + state — easier (and at this volume,
  // cheap) to filter in JS.
  const { data: rows, error } = await admin
    .from("session_modules")
    .select("id, module_id, config, state")
    .in("module_id", ["picks", "bans"])
    .eq("enabled", true);

  if (error) {
    console.error("[cron/modules-timer] sweep query failed:", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }

  const now = Date.now();
  let scanned = 0;
  let locked = 0;

  for (const row of (rows as ModuleRow[] | null) ?? []) {
    scanned++;
    const config = row.config ?? {};
    const state = row.state ?? {};
    const status = (state.status as string | undefined) ?? "collecting";
    if (status !== "collecting") continue;

    const timerSeconds = (config.timer_seconds as number | undefined) ?? 0;
    if (!timerSeconds || timerSeconds <= 0) continue;

    const confirmMode = (config.confirm_mode as string | undefined) ?? "manual";
    if (confirmMode !== "auto" && confirmMode !== "manual_with_timeout") continue;

    const startedAtIso = (state.timer_started_at as string | undefined) ?? null;
    if (!startedAtIso) continue; // no one has acted yet — no timer running

    const startedAt = Date.parse(startedAtIso);
    if (!Number.isFinite(startedAt)) continue;
    const elapsedSeconds = (now - startedAt) / 1000;
    if (elapsedSeconds < timerSeconds) continue;

    // Time's up — flip to locked.
    const nextState = {
      ...state,
      status: "locked",
      locked_at: new Date().toISOString(),
    };
    const { error: updErr } = await admin
      .from("session_modules")
      .update({ state: nextState })
      .eq("id", row.id);
    if (updErr) {
      console.error(`[cron/modules-timer] failed to lock ${row.module_id} row ${row.id}:`, updErr);
      continue;
    }
    locked++;
  }

  return NextResponse.json({ scanned, locked });
}
