/**
 * The War room's Time trials tab (src/lib/timeTrials/activity.ts).
 *   GET  ?game=&cc=&items=&scope=server|everyone&vehicle= → TtRoomView (every track's record and the viewer's gap)
 *   POST multipart { file, game? }    → reads a result screenshot (stored as proof; nothing saved as a time)
 *   POST { action: "add", game, track, cc, items, vehicle, time, proofUrl, token } → saves the time
 * Signed in with GameShuffle Competitive's Activity session (Bearer, `app: "comp"`).
 */

import { NextResponse } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { rateLimit } from "@/lib/ratelimit";
import { ttReady } from "@/lib/timeTrials/store";
import { ttRoomAdd, ttRoomRead, ttRoomView } from "@/lib/timeTrials/activity";
import { MAX_SCREENSHOT_BYTES } from "@/lib/timeTrials/read";
import { isClassFor, isTtGame, TT_GAMES } from "@/lib/timeTrials/tracks";
import { vehicleFor } from "@/lib/timeTrials/categories";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function viewer(req: Request) {
  const s = sessionFrom(req);
  return s && s.app === "comp" ? s : null;
}

export async function GET(req: Request) {
  const s = viewer(req);
  if (!s) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await ttReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const p = new URL(req.url).searchParams;
  const game = isTtGame(p.get("game")) ? (p.get("game") as "mk8dx" | "mkworld") : "mkworld";
  const ccRaw = Number(p.get("cc"));
  const cc = isClassFor(game, ccRaw) ? ccRaw : TT_GAMES[game].classes[0];
  const items = p.get("items") === "none" ? "none" : "shrooms";
  const scope = p.get("scope") === "everyone" ? "everyone" : "server";
  return NextResponse.json(await ttRoomView(s, game, cc, items, scope, vehicleFor(game, p.get("vehicle"))), { headers: NO_STORE });
}

export async function POST(req: Request) {
  const s = viewer(req);
  if (!s) return NextResponse.json({ error: "signin" }, { status: 401 });

  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    if (!(await rateLimit(`tt-room-read:${s.did}`, { max: 10, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || !TYPES.has(file.type)) return NextResponse.json({ error: "not_image" }, { status: 415 });
    if (file.size > MAX_SCREENSHOT_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const g = form?.get("game");
    const res = await ttRoomRead(s, new Uint8Array(await file.arrayBuffer()), isTtGame(g) ? g : null);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "cap" ? 429 : res.error === "not_image" ? 415 : 503 });
    return NextResponse.json(res.read, { headers: NO_STORE });
  }

  if (!(await rateLimit(`tt-room-add:${s.did}`, { max: 30, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.action !== "add") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await ttRoomAdd(s, { game: body.game, track: body.track, cc: body.cc, items: body.items, vehicle: body.vehicle, time: body.time, proofUrl: body.proofUrl, token: body.token });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "not_ready" ? 503 : 400, headers: NO_STORE });
  return NextResponse.json(res.saved, { headers: NO_STORE });
}
