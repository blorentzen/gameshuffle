/**
 * POST /api/ai/recap → { ok, discord, short, remaining }
 *   { kind: "night", code }       a live night the caller hosted, once it's over
 *   { kind: "stream", sessionId } a stream session the caller owns, once it's ended
 *
 * Drafts recap posts from GameShuffle's own record of what happened, for the
 * host to edit and copy. GS Pro, counted against the monthly AI allowance.
 */

import { NextResponse } from "next/server";
import { aiAccess } from "@/lib/ai/access";
import { recordAiUse } from "@/lib/ai/usage";
import { streamFacts, writeNightRecap, writeStreamRecap } from "@/lib/ai/recaps";
import { loadNight, recapText } from "@/lib/party/nights";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await aiAccess();
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error, remaining: access.remaining }, { status: access.status });
  const body = (await request.json().catch(() => null)) as { kind?: string; code?: string; sessionId?: string } | null;

  let res;
  if (body?.kind === "night" && typeof body.code === "string") {
    const l = await loadNight(body.code);
    if (!l || l.night.host_user_id !== access.userId) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (l.night.status !== "ended") return NextResponse.json({ ok: false, error: "not_ended" }, { status: 400 });
    res = await writeNightRecap(recapText(l, ""));
  } else if (body?.kind === "stream" && typeof body.sessionId === "string") {
    const f = await streamFacts(body.sessionId);
    if (!f || f.ownerUserId !== access.userId) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    res = await writeStreamRecap(f.facts);
  } else {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "rate_limited" ? 429 : 502 });
  await recordAiUse(access.userId, "recap");
  return NextResponse.json({ ok: true, ...res.data, remaining: access.remaining === null ? null : access.remaining - 1 });
}
