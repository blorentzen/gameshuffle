/**
 * GET /api/mmr/ladder?ladder=<id> → the signed-in account's card on one of its GameShuffle ladders, for the studio's
 * preview: { ok, source, events, pending } or { ok: false, reason: "not_on_ladder" | "unavailable" }. The account is
 * found through its Discord id (/ladder join), so there's no name to type.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readLadder } from "@/lib/mmr/ladderSource";
import { gsDay, gsDayStart } from "@/lib/time/gsClock";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "signin" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("ladder") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, reason: "not_on_ladder" }, { status: 400 });
  const r = await readLadder(user.id, id, { since: gsDayStart(gsDay()).toISOString() });
  if (!r.ok) return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  return NextResponse.json({ ok: true, source: { ...r.source, avatar: null }, events: r.events, pending: r.pending }, { headers: { "cache-control": "no-store" } });
}
