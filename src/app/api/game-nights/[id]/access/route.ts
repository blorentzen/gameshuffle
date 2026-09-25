/**
 * A night's lobby details — the private half of "where".
 *
 * Both handlers use the VIEWER's Supabase client, so the RLS policy on
 * board_game_night_access is what decides: reads return nothing unless you are
 * the host or your RSVP is "going", and writes fail unless you are the host.
 * No ownership check here would be a second, weaker copy of that.
 */

import { NextResponse } from "next/server";
import { getNightAccess, saveNightAccess } from "@/lib/game-nights/lobby";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await getNightAccess(id);
  // Null is "you cannot see this" AND "there is nothing to see". The caller
  // does not need to tell them apart, and conflating them leaks less.
  return NextResponse.json({ access });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { joinUrl?: unknown; roomCode?: unknown; arrivalNote?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const joinUrl = str(body.joinUrl);
  // A join link is something people click, so only http(s) may be stored.
  if (joinUrl && joinUrl.trim()) {
    try {
      const u = new URL(joinUrl.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    } catch {
      return NextResponse.json({ error: "Join link must be a valid http(s) URL." }, { status: 400 });
    }
  }

  const result = await saveNightAccess(id, {
    joinUrl,
    roomCode: str(body.roomCode),
    arrivalNote: str(body.arrivalNote),
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
