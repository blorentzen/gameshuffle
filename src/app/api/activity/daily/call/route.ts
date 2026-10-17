/**
 * GET /api/activity/daily/call — who's in this Discord call and how far each
 * is with today's Daily (squares only); `?game=dex` for the Daily Dex. Polled by the Activity's Daily tab.
 * Who's in the call comes from Discord (src/lib/activity/callDaily.ts).
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { callDaily } from "@/lib/activity/callDaily";
import { SHUFFLE } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "signed_out" }, { status: 401 });
  try {
    const players = await callDaily(s, undefined, new URL(req.url).searchParams.get("game") === "dex" ? DEX : SHUFFLE);
    return NextResponse.json({ ok: true, players }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[activity daily call]", err);
    return NextResponse.json({ ok: false, error: "busy" }, { status: 500 });
  }
}
