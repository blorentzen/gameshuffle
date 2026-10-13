/**
 * Swiss: GET the run as this person sees it (pairings, standings, the top cut,
 * their own match); POST an organizer action (start, pair, cut, finish,
 * result, timer, drop, undrop, repair) or a player's own (report, drop).
 * Rules in src/lib/tournaments/swiss.ts, storage in swissStore.ts.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageEvent } from "@/lib/events/attendees";
import { rateLimit } from "@/lib/ratelimit";
import { SWISS_ERRORS, buildView, loadSwiss, organizerAct, playerDrop, playerReport, visibleTo, type OrganizerAction, type SwissError } from "@/lib/tournaments/swissStore";

export const runtime = "nodejs";

const ORGANIZER = new Set(["start", "pair", "cut", "finish", "repair", "result", "timer", "drop_player", "undrop"]);

async function viewer(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const canManage = user ? await canManageEvent("tournament", id, user.id) : false;
  return { userId: user?.id ?? null, canManage };
}

async function view(id: string, who: { userId: string | null; canManage: boolean }) {
  const ctx = await loadSwiss(id);
  if (ctx === "missing") return NextResponse.json({ ok: false, error: "missing", message: SWISS_ERRORS.missing }, { status: 503 });
  if (!ctx || !visibleTo(ctx, who.canManage)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, view: buildView(ctx, who) }, { headers: { "Cache-Control": "no-store" } });
}

const refused = (error: SwissError) =>
  NextResponse.json({ ok: false, error, message: SWISS_ERRORS[error] }, { status: error === "missing" ? 503 : error === "not_found" ? 404 : error === "busy" ? 409 : 400 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return view(id, await viewer(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer(id);
  if (!who.userId) return NextResponse.json({ ok: false, error: "signin", message: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as (Record<string, unknown> & { action?: string }) | null;
  const action = String(body?.action ?? "");

  if (ORGANIZER.has(action)) {
    if (!who.canManage) return NextResponse.json({ ok: false, error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
    const input = (action === "drop_player" ? { action: "drop", participantId: String(body?.participantId ?? "") } : { ...body, action }) as OrganizerAction;
    const r = await organizerAct(id, input);
    if (!r.ok) return refused(r.error);
    return view(id, who);
  }

  const { ok } = await rateLimit(`swiss:${who.userId}`, { max: 30, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ ok: false, error: "slow_down", message: "Too many taps. Wait a moment." }, { status: 429 });
  if (action === "report") {
    const r = await playerReport(id, who.userId, { key: String(body?.key ?? ""), mine: Number(body?.mine), theirs: Number(body?.theirs) });
    if (!r.ok) return refused(r.error);
    return view(id, who);
  }
  if (action === "drop") {
    const r = await playerDrop(id, who.userId);
    if (!r.ok) return refused(r.error);
    return view(id, who);
  }
  return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
}
