/**
 * POST /api/ai/plan  { players, minutes, own, vibe } → { ok, plan, remaining }
 *
 * The game night planner: a lineup from the games a live night can run (plus
 * an optional Jackbox pick), for the host to start or tweak. Free with a daily
 * cap for signed-in accounts; GS Pro uses its 30-day AI allowance.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { planNight } from "@/lib/ai/planner";
import { recordAiUse } from "@/lib/ai/usage";
import { withAiTokens } from "@/lib/ai/tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await aiAccess("plan");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });
  const b = (await request.json().catch(() => null)) as { players?: unknown; minutes?: unknown; own?: unknown; vibe?: unknown } | null;
  const players = Math.max(1, Math.min(12, Number(b?.players) || 0));
  const minutes = Math.max(20, Math.min(360, Number(b?.minutes) || 0));
  const own = Array.isArray(b?.own) ? b.own.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  const vibe = typeof b?.vibe === "string" ? b.vibe.slice(0, 300) : "";
  if (!players || !minutes) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const { value: res, tokens } = await withAiTokens(() => planNight({ players, minutes, own, vibe }));
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "plan", tokens);
  return NextResponse.json({ ok: true, plan: res.data, remaining: access.remaining === null ? null : access.remaining - 1 });
}
