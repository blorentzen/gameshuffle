/**
 * Play together (TCG Companion): one shared game, by its code.
 *
 * GET ?preview=1      → { preview: { hostName, open } }   (the join page; no seat needed)
 * GET ?v=<version>    → { view } or { unchanged, version } (a phone in the game)
 * POST { op: "join", name }                      → { view, token }
 * POST { op: "move", action }                    → { view }
 * POST { op: "undo" }                            → { view }
 * POST { op: "roll", kind, faces?, use }         → { value, rollId?, view }
 * POST { op: "free" }                            → { view } (host: open the second seat again)
 * POST { op: "end" }                             → { ok }   (host only)
 *
 * A signed-in player is known by their session; a guest sends the token
 * their phone got at join in the `x-live-token` header.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import {
  applyLiveMove,
  endLiveGame,
  freeLiveSeat,
  getLiveView,
  joinLiveGame,
  liveRoll,
  liveUndo,
  previewLiveGame,
  type Credentials,
} from "@/lib/companion/live";
import { normalizeCode } from "@/lib/companion/liveRules";
import type { SessionAction } from "@/lib/companion/state";
import { liveError } from "../errors";

export const runtime = "nodejs";

const MAX_BODY = 300_000;

async function credentials(request: Request): Promise<Credentials> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = request.headers.get("x-live-token");
  return { userId: user?.id ?? null, token: token && token.length < 100 ? token : null };
}

function ipOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code);
  if (!code) return liveError("not_found");
  const url = new URL(request.url);

  if (url.searchParams.get("preview")) {
    // Guessing codes is the abuse case: keep looks-ups slow per address.
    const { ok } = await rateLimit(`companion-live-peek:${ipOf(request)}`, { max: 30, windowMs: 60_000 });
    if (!ok) return NextResponse.json({ error: "slow_down", message: "Too many tries. Wait a minute." }, { status: 429 });
    const result = await previewLiveGame(code);
    if (!result.ok) return liveError(result.error, result.message);
    return NextResponse.json({ preview: result.value });
  }

  const since = url.searchParams.get("v");
  const result = await getLiveView(code, await credentials(request), since != null ? Number(since) : undefined);
  if (!result.ok) return liveError(result.error, result.message);
  return NextResponse.json("unchanged" in result.value ? result.value : { view: result.value }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code);
  if (!code) return liveError("not_found");
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "too_big", message: "That move is too big." }, { status: 413 });
  let body: { op?: string; name?: unknown; action?: SessionAction; kind?: string; faces?: number; use?: string };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }
  const cred = await credentials(request);

  switch (body.op) {
    case "join": {
      const { ok } = await rateLimit(`companion-live-join:${ipOf(request)}`, { max: 12, windowMs: 60_000 });
      if (!ok) return NextResponse.json({ error: "slow_down", message: "Too many tries. Wait a minute." }, { status: 429 });
      const result = await joinLiveGame(code, cred, body.name);
      if (!result.ok) return liveError(result.error, result.message);
      return NextResponse.json(result.value);
    }
    case "move": {
      if (!body.action) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const result = await applyLiveMove(code, cred, body.action);
      if (!result.ok) return liveError(result.error, result.message);
      return NextResponse.json({ view: result.value });
    }
    case "undo": {
      const result = await liveUndo(code, cred);
      if (!result.ok) return liveError(result.error, result.message);
      return NextResponse.json({ view: result.value });
    }
    case "roll": {
      const kind = body.kind === "die" ? "die" : "coin";
      const use = body.use === "resolve" ? "resolve" : "log";
      const result = await liveRoll(code, cred, { kind, faces: body.faces, use });
      if (!result.ok) return liveError(result.error, result.message);
      return NextResponse.json(result.value);
    }
    case "free": {
      const result = await freeLiveSeat(code, cred);
      if (!result.ok) return liveError(result.error, result.message);
      return NextResponse.json({ view: result.value });
    }
    case "end": {
      const result = await endLiveGame(code, cred);
      if (!result.ok) return liveError(result.error, result.message);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
}
