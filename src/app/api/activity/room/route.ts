/**
 * The Discord Activity's play-together room (src/lib/activity/room.ts).
 *
 *   GET            the room as this player sees it (checks them in, moves the
 *                  room along if a phase is over); polled while the tab is open
 *   GET ?peek=1    is anyone playing together, for the other tabs (no check-in)
 *   POST { action, ... }  start a game, answer, skip, reroll, back to the lobby
 *
 * Who you are and which room comes from our signed session; the room is the
 * Activity instance Discord confirmed at sign-in.
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { RoomError, roomAct, roomPeek, roomReady, roomView, type RoomAction } from "@/lib/activity/room";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

function fail(err: unknown) {
  if (err instanceof RoomError) return json({ ok: false, error: err.code }, err.code === "not_host" ? 403 : err.code === "no_room" ? 404 : 409);
  console.error("[activity room]", err);
  return json({ ok: false, error: "busy" }, 500);
}

export async function GET(req: Request) {
  const s = sessionFrom(req);
  if (!s) return json({ ok: false, error: "signed_out" }, 401);
  if (!(await roomReady())) return json({ ok: true, ready: false });
  if (!s.ins) return json({ ok: true, ready: true, inCall: false });
  const peek = new URL(req.url).searchParams.get("peek") === "1";
  try {
    if (peek) return json({ ok: true, ready: true, inCall: true, peek: await roomPeek(s) });
    return json({ ok: true, ready: true, inCall: true, view: await roomView(s) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  const s = sessionFrom(req);
  if (!s) return json({ ok: false, error: "signed_out" }, 401);
  if (!(await roomReady())) return json({ ok: false, error: "not_ready" }, 503);
  const { ok } = await rateLimit(`activity-room:${s.iid}`, { max: 60, windowMs: 60_000 });
  if (!ok) return json({ ok: false, error: "busy" }, 429);
  const body = (await req.json().catch(() => null)) as RoomAction | null;
  if (!body || typeof body.action !== "string") return json({ ok: false, error: "bad_request" }, 400);
  try {
    return json({ ok: true, view: await roomAct(s, body) });
  } catch (err) {
    return fail(err);
  }
}
