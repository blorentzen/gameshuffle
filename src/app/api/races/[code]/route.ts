/**
 * A speedrun race's page data and what people do there (speedrun races picks 2026-11-10).
 *   GET  /api/races/<code>                       the room as the viewer sees it (VersusRoomView)
 *   POST /api/races/<code> { action, arg? }      join, leave, ready, unready; the host's remove (arg = user id),
 *                                                invite (arg = username), start, end, cancel, again; a duel's play
 *                                                (the player's own Trainer Road run, started at Go: { run })
 * Every POST answers with the page's data again, so the page never waits for the socket to catch up.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { cleanCode } from "@/lib/versus/rules";
import { act, pageView, type VersusAction } from "@/lib/versus/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<VersusAction>(["join", "leave", "ready", "unready", "remove", "invite", "start", "end", "cancel", "again", "play", "team", "squad"]);

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const view = await pageView(code, await viewer());
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ view }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const limited = await rateLimit(`races:act:${userId}`, { max: 40, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; arg?: unknown } | null;
  const action = typeof body?.action === "string" && ACTIONS.has(body.action as VersusAction) ? (body.action as VersusAction) : null;
  if (!action) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const arg = typeof body?.arg === "string" ? body.arg.slice(0, 60) : undefined;
  const res = await act(code, userId, action, arg);
  const view = await pageView(code, userId);
  if (!res.ok) return NextResponse.json({ ...res, view }, { status: res.error === "not_found" ? 404 : res.error === "host_only" ? 403 : 409 });
  return NextResponse.json({ ...res, view });
}
