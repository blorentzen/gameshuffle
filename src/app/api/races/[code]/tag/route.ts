/**
 * A tag team duel in a room (co-op picks 2026-11-11, pick 4).
 *   GET  /api/races/<code>/tag     the duel as the viewer sees it ({ run }: a player's controls, or a watcher's view)
 *   POST /api/races/<code>/tag     a player's step: { pick } in the draft, { next } for a lead or a send-out, or a turn
 *                                  { attach, act, use } (the Daily Duel arena's steps); answers { run }
 * Reads check the clock, so both players polling keeps the duel moving.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { cleanCode } from "@/lib/versus/rules";
import { roomByCode } from "@/lib/versus/store";
import { battleReady } from "@/lib/versus/battle";
import { tagRunView, tagStep } from "@/lib/versus/tag";
import type { TagStep } from "@/lib/originals/duel/tag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code || !(await battleReady())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const room = await roomByCode(code);
  if (!room || room.kind !== "tag") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const run = await tagRunView(room, await viewer());
  if (!run) return NextResponse.json({ error: "not_started" }, { status: 404 });
  return NextResponse.json({ run }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  if (!code || !(await battleReady())) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "signin" }, { status: 401 });
  const limited = await rateLimit(`races:tag:${userId}`, { max: 60, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const room = await roomByCode(code);
  if (!room || room.kind !== "tag") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as TagStep | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await tagStep(room, userId, body);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.error === "illegal" ? 422 : res.error === "not_found" || res.error === "not_in" ? 404 : 409 });
  return NextResponse.json({ run: res.run });
}
