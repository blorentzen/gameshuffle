/**
 * POST /api/activity/daily/start { game } → starts today's clock inside the
 * Discord Activity, under the same player the boards use (the account a
 * linked Discord user signs in to, else the Discord identity).
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { markStart, playerForIdentity } from "@/lib/daily/boards";
import { dayKey } from "@/lib/originals/daily";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { game?: unknown } | null;
  const game = body?.game === "dex" ? "dex" : "shuffle";
  const player = await playerForIdentity(s.iid, s.uid).catch(() => ({ kind: "i" as const, id: s.iid }));
  return NextResponse.json({ ok: await markStart(`${player.kind}:${player.id}`, game, dayKey()) });
}
