/**
 * The relay's race rooms post here (speedrun-relay/src/room.ts): POST { roomId, event, room }, signed like the
 * relay's own webhook (x-relay-signature = hex HMAC-SHA256 of the raw body with SPEEDRUN_RELAY_SECRET). Events: the
 * start, a lane ending, the leader reaching a new checkpoint, the finish and a cancel. A wrong signature is 401, an
 * unknown room 404 (not retried), a database hiccup 500 (retried once). What follows a step (bets, Discord) runs after
 * the response.
 */

import { after, NextResponse, type NextRequest } from "next/server";
import { speedrunEnvOrNull } from "@/lib/speedrun/env";
import { verifyBody, isRelayId } from "@/lib/speedrun/tokens";
import { isRoomView } from "@/lib/versus/relay";
import { recordRoomEvent, versusReady } from "@/lib/versus/store";
import { afterRoomEvent } from "@/lib/versus/after";
import type { RoomHookBody, RoomHookEvent } from "@/lib/versus/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const EVENTS = new Set<RoomHookEvent>(["started", "lane", "progress", "finished", "cancelled"]);
const MAX_BODY = 512 * 1024;

export async function POST(req: NextRequest) {
  const env = speedrunEnvOrNull();
  if (!env) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!(await verifyBody(env.secret, raw, req.headers.get("x-relay-signature")))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  let body: RoomHookBody;
  try { body = JSON.parse(raw) as RoomHookBody; } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  if (!body || !isRelayId(body.roomId) || !EVENTS.has(body.event) || !isRoomView(body.room)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!(await versusReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const res = await recordRoomEvent(body);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.room) {
    const room = res.room;
    after(() => afterRoomEvent(room, body).catch((e) => console.error("[versus] after:", e)));
  }
  return NextResponse.json({ ok: true, did: res.did });
}
