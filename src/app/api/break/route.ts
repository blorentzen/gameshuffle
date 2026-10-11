/**
 * Break mode for the signed-in streamer (GS Pro).
 *
 * GET   → { ready, pro, settings, view } (the running break, moved along first)
 * POST  { lineup?, minutes? } → start a break
 * PATCH { action: "end" | "end_now" | "pull" } → finish the round then end, end now, or pull the question
 * PATCH { settings: { lineup?, show?, championTokens? } } → save the break defaults
 *
 * Engine: src/lib/break/store.ts. Chat does the same with !gs brb / !gs back / !gs pull.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { isProUser } from "@/lib/subscription-server";
import { streamOwnerFor } from "@/lib/mods/acting";
import {
  BreakNotReady, breakReady, breakView, getRunning, getSettings, pullRound, requestEnd, saveSettings, startBreak, tickBreak,
} from "@/lib/break/store";

export const runtime = "nodejs";

/** The streamer on a break: the signed-in account, or the streamer a Full-access mod acts for (src/lib/mods/acting.ts). */
async function owner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { ownerUserId } = await streamOwnerFor(user.id);
  const communityId = await resolveCommunityIdForOwner(ownerUserId).catch(() => null);
  return { userId: ownerUserId, communityId };
}

export async function GET() {
  const me = await owner();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [ready, pro] = await Promise.all([breakReady(), isProUser(me.userId)]);
  if (!me.communityId || !ready) return NextResponse.json({ ok: true, ready, pro, settings: null, view: null });
  const [settings, run] = await Promise.all([getSettings(me.communityId), getRunning(me.communityId)]);
  const view = run ? await breakView(await tickBreak(run)) : null;
  return NextResponse.json({ ok: true, ready, pro, settings, view }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const me = await owner();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!me.communityId) return NextResponse.json({ error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { lineup?: unknown; minutes?: unknown };
  const minutes = typeof body.minutes === "number" && body.minutes > 0 ? Math.round(body.minutes) : null;
  const res = await startBreak({ communityId: me.communityId, ownerUserId: me.userId, lineup: body.lineup, minutes });
  if (!res.ok) {
    const status = res.error === "not_pro" ? 403 : res.error === "already_running" ? 409 : res.error === "not_ready" ? 503 : 500;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, view: await breakView(res.run) });
}

export async function PATCH(request: Request) {
  const me = await owner();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!me.communityId) return NextResponse.json({ error: "no_community" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; settings?: { lineup?: unknown; show?: unknown; championTokens?: unknown } };

  if (body.settings) {
    if (!(await isProUser(me.userId))) return NextResponse.json({ error: "not_pro" }, { status: 403 });
    try {
      const settings = await saveSettings(me.communityId, {
        lineup: body.settings.lineup as never,
        show: body.settings.show === "full" ? "full" : body.settings.show === "panel" ? "panel" : undefined,
        championTokens: typeof body.settings.championTokens === "number" ? body.settings.championTokens : undefined,
      });
      return NextResponse.json({ ok: true, settings });
    } catch (err) {
      if (err instanceof BreakNotReady) return NextResponse.json({ error: "not_ready" }, { status: 503 });
      return NextResponse.json({ error: "not_saved" }, { status: 500 });
    }
  }

  const run = await getRunning(me.communityId);
  if (!run) return NextResponse.json({ error: "no_break" }, { status: 404 });
  if (body.action === "pull") {
    const res = await pullRound(run, me.userId);
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: 409 });
  }
  if (body.action === "end" || body.action === "end_now") {
    const after = await requestEnd(run, { now: body.action === "end_now" });
    return NextResponse.json({ ok: true, view: await breakView(after) });
  }
  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}
