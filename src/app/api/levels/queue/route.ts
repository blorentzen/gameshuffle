/**
 * GET / POST /api/levels/queue (levels picks 2026-11-11; GS Pro)
 *
 * The streamer's level queue for Streaming ▸ Live games ▸ Level queue and the stream page: the signed-in account, or
 * the streamer a Full-access mod acts for on their mod page (src/lib/mods/acting.ts).
 *
 *   GET  → QueueView
 *   POST { action: open | close | clear | next | random | skip | result | remove | settings, … }
 *        Opening, next, random and skip post their line to chat while the streamer is live.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { streamOwnerFor } from "@/lib/mods/acting";
import { queueAct, queueView, sayInChat, type QueueAction } from "@/lib/levels/store";
import { LEVEL_RESULTS, type LevelResult } from "@/lib/levels/rules";

export const runtime = "nodejs";

async function owner(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return (await streamOwnerFor(user.id)).ownerUserId;
}

export async function GET() {
  const id = await owner();
  if (!id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(await queueView(id));
}

const isResult = (x: unknown): x is LevelResult => typeof x === "string" && (LEVEL_RESULTS as string[]).includes(x);

function parse(body: Record<string, unknown>): QueueAction | null {
  switch (body.action) {
    case "open": case "close": case "clear": case "skip":
      return { action: body.action };
    case "next": case "random":
      return { action: body.action, result: isResult(body.result) ? body.result : null };
    case "result":
      return typeof body.id === "string" && isResult(body.result) ? { action: "result", id: body.id, result: body.result } : null;
    case "remove":
      return typeof body.id === "string" ? { action: "remove", id: body.id } : null;
    case "settings":
      return {
        action: "settings",
        ...(typeof body.game === "string" ? { game: body.game } : {}),
        ...(body.thanks !== undefined ? { thanks: Number(body.thanks) } : {}),
      };
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const id = await owner();
  if (!id) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const act = body ? parse(body) : null;
  if (!act) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await queueAct(id, act);
  if (!r.ok) {
    const status = r.error === "pro_required" ? 403 : r.error === "not_found" ? 404 : r.error === "not_ready" ? 503 : 400;
    return NextResponse.json({ error: r.error }, { status });
  }
  const speaks = act.action === "open" || act.action === "close" || act.action === "next" || act.action === "random" || act.action === "skip";
  if (speaks && r.line) await sayInChat(id, r.line);
  return NextResponse.json(await queueView(id));
}
