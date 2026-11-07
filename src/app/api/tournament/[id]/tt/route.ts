/**
 * Time trial events: GET the event as this person sees it (rounds, groups, standings, their own times; the check
 * queue and staff for organizers and verifiers). POST:
 *   players: { action: "add", track, time, proofUrl, readToken, laps?, runoff? } (the result screenshot uploaded
 *     through /api/time-trials/read first), { action: "clip", timeId, url };
 *   verifiers and organizers: { action: "check", timeId, ok, note? };
 *   organizers: start, extend, close, reopen, cut, runoff, settle, next, finish, move, add_for, remove_time,
 *     staff_add, staff_remove, remind; in person also call { group, station }, station_done { station }, links_reset.
 * A station's runner uses ./station (a signed link, no account).
 * Storage in src/lib/tournaments/tt/store.ts, rules in rules.ts.
 *
 * The same route serves Swiss events and single or double elimination brackets decided by time trial: `add` puts the
 * time on the player's match. Brackets: GET is the bracket view (tt/bracketStore.ts); organizers `match_settle`
 * { matchId } (on the times so far) or `match_settle_all`. Both: GET ?checks=1 is the times to check (organizers and
 * verifiers), and `clip`, `check`, `remind`, `staff_add`, `staff_remove` work as on an event (a check can settle a
 * bracket match that was waiting on it).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageEvent } from "@/lib/events/attendees";
import { rateLimit } from "@/lib/ratelimit";
import { keyFromPublicUrl } from "@/lib/storage/r2";
import { cleanLaps, parseTime } from "@/lib/timeTrials/rules";
import { readFrom } from "@/lib/timeTrials/proof";
import { createServiceClient } from "@/lib/supabase/admin";
import { SWISS_ERRORS, swissTtAdd } from "@/lib/tournaments/swissStore";
import { isTtBracket } from "@/lib/tournaments/tt/bracketTt";
import { bracketChecks, bracketMessage, bracketTtAdd, bracketTtView, loadBracketTt, settleAllOpen, settleTtBracket } from "@/lib/tournaments/tt/bracketStore";
import { loadSwiss, swissTtChecks } from "@/lib/tournaments/swissStore";
import {
  TT_ERRORS, buildView, canCheckEvent, checkTime, loadTt, organizerAct, playerAdd, playerClip, staffOf, visibleTo,
  type TtError, type TtOrganizerAction,
} from "@/lib/tournaments/tt/store";
import type { TtMatchChecksView } from "@/lib/tournaments/tt/event";

export const runtime = "nodejs";

/** What organizers can do on a Swiss event or bracket decided by time trial through this route (the rest is Swiss's or the bracket's own). */
const MATCH_ORGANIZER = new Set(["staff_add", "staff_remove", "remind"]);

const ORGANIZER = new Set(["start", "extend", "close", "reopen", "cut", "runoff", "settle", "next", "finish", "move", "add_for", "remove_time", "staff_add", "staff_remove", "remind", "call", "station_done", "links_reset"]);

async function viewer(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const canManage = user ? await canManageEvent("tournament", id, user.id) : false;
  const canCheck = user && !canManage ? await canCheckEvent(id, user.id) : false;
  return { userId: user?.id ?? null, canManage, canCheck };
}

async function view(id: string, who: { userId: string | null; canManage: boolean; canCheck: boolean }, extra?: Record<string, unknown>) {
  const ctx = await loadTt(id);
  if (ctx === "missing") return NextResponse.json({ ok: false, error: "missing", message: TT_ERRORS.missing }, { status: 503 });
  if (!ctx || ctx.t.format !== "time_trial" || !visibleTo(ctx, who.canManage)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, view: await buildView(ctx, who), ...extra }, { headers: { "Cache-Control": "no-store" } });
}

const refused = (error: TtError) =>
  NextResponse.json({ ok: false, error, message: TT_ERRORS[error] }, { status: error === "missing" ? 503 : error === "not_found" ? 404 : error === "busy" ? 409 : 400 });

/** Format and settings, to send the request to the right kind of event. */
async function kindOf(id: string): Promise<"bracket" | "swiss" | "event" | null> {
  const { data } = await createServiceClient().from("tournaments").select("format, settings").eq("id", id).maybeSingle();
  const t = data as { format: string | null; settings: unknown } | null;
  if (!t) return null;
  if (isTtBracket(t)) return "bracket";
  return t.format === "swiss" ? "swiss" : "event";
}

async function bracketView(id: string, who: { userId: string | null; canManage: boolean; canCheck?: boolean }, extra?: Record<string, unknown>) {
  const ctx = await loadBracketTt(id);
  if (ctx === "missing") return NextResponse.json({ ok: false, error: "missing", message: TT_ERRORS.missing }, { status: 503 });
  if (!ctx) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, bracket: bracketTtView(ctx, who), ...extra }, { headers: { "Cache-Control": "no-store" } });
}

/** The times to check in a Swiss event or bracket decided by time trial, with the verifiers for organizers. */
async function matchChecks(id: string, kind: "bracket" | "swiss", who: { canManage: boolean; canCheck: boolean }) {
  if (!who.canManage && !who.canCheck) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  let out: { checks: TtMatchChecksView["checks"]; holding: number };
  let game: TtMatchChecksView["game"], rule: TtMatchChecksView["rule"];
  if (kind === "bracket") {
    const ctx = await loadBracketTt(id);
    if (!ctx || ctx === "missing") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    out = bracketChecks(ctx); game = ctx.game; rule = ctx.settings.matchClips;
  } else {
    const ctx = await loadSwiss(id);
    if (!ctx || ctx === "missing" || !ctx.tt) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    out = await swissTtChecks(ctx); game = ctx.tt.game; rule = ctx.tt.settings.matchClips;
  }
  const checks: TtMatchChecksView = { game, rule, checks: out.checks, holding: out.holding, staff: who.canManage ? await staffOf(id) : null, canManage: who.canManage };
  return NextResponse.json({ ok: true, checks }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer(id);
  const kind = await kindOf(id);
  if (new URL(req.url).searchParams.get("checks") === "1" && (kind === "bracket" || kind === "swiss")) return matchChecks(id, kind, who);
  if (kind === "bracket") return bracketView(id, who);
  return view(id, who);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await viewer(id);
  if (!who.userId) return NextResponse.json({ ok: false, error: "signin", message: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  const kind = await kindOf(id);
  if (!kind) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const bracketRefused = (error: TtError) =>
    NextResponse.json({ ok: false, error, message: bracketMessage(error) }, { status: error === "missing" ? 503 : error === "busy" ? 409 : 400 });

  if (kind === "bracket" && (action === "match_settle" || action === "match_settle_all")) {
    if (!who.canManage) return NextResponse.json({ ok: false, error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
    if (action === "match_settle_all") {
      const r = await settleAllOpen(id);
      if (!r.ok) return bracketRefused(r.error);
      return bracketView(id, who, { settled: r.settled, level: r.level });
    }
    const r = await settleTtBracket(id, String(body?.matchId ?? ""));
    if (!r.ok) return bracketRefused(r.error);
    return bracketView(id, who, { settled: r.settled.length, level: r.level ? [r.level] : [] });
  }

  if (ORGANIZER.has(action)) {
    if (!who.canManage) return NextResponse.json({ ok: false, error: "forbidden", message: "You don't run this tournament." }, { status: 403 });
    if (kind !== "event") {
      if (!MATCH_ORGANIZER.has(action)) return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
      const r = await organizerAct(id, who.userId, { ...body, action } as TtOrganizerAction);
      if (!r.ok) return refused(r.error);
      return NextResponse.json({ ok: true });
    }
    const input = { ...body, action } as TtOrganizerAction;
    if (action === "add_for") (input as { ms: number }).ms = typeof body?.time === "number" ? Math.round(body.time) : parseTime(String(body?.time ?? "")) ?? 0;
    const r = await organizerAct(id, who.userId, input);
    if (!r.ok) return refused(r.error);
    return view(id, who);
  }

  if (action === "check") {
    if (!who.canManage && !who.canCheck) return NextResponse.json({ ok: false, error: "forbidden", message: "You're not checking times here." }, { status: 403 });
    const r = await checkTime(id, who.userId, String(body?.timeId ?? ""), body?.ok === true, typeof body?.note === "string" ? body.note : null);
    if (!r.ok) return refused(r.error);
    // A bracket match waiting on this check settles now (a Swiss match settles on its next read).
    if (kind === "bracket") { await settleTtBracket(id); return NextResponse.json({ ok: true }); }
    if (kind === "swiss") return NextResponse.json({ ok: true });
    return view(id, who);
  }

  if (!(await rateLimit(`tt-event:${who.userId}`, { max: 30, windowMs: 10 * 60_000 })).ok) {
    return NextResponse.json({ ok: false, error: "slow_down", message: "That's a lot of times. Wait a few minutes and try again." }, { status: 429 });
  }

  if (action === "clip") {
    const r = await playerClip(id, who.userId, String(body?.timeId ?? ""), String(body?.url ?? ""));
    if (!r.ok) return refused(r.error);
    if (kind === "bracket") return bracketView(id, who);
    if (kind === "swiss") return NextResponse.json({ ok: true });
    return view(id, who);
  }

  if (action === "add") {
    const ms = typeof body?.time === "number" ? Math.round(body.time) : parseTime(String(body?.time ?? ""));
    if (!ms) return refused("bad_time");
    const proofUrl = typeof body?.proofUrl === "string" ? body.proofUrl : "";
    if (!proofUrl) return refused("screenshot_required");
    const key = keyFromPublicUrl(proofUrl);
    if (!key || !key.startsWith(`time-trials/${who.userId}/`)) return refused("bad_proof");
    const read = readFrom(body?.readToken, proofUrl);
    const laps = body?.laps == null ? read?.laps ?? null : cleanLaps(body.laps);
    const read2 = read ? { timeMs: read.timeMs ?? null, laps: read.laps ?? null, parts: read.parts ?? null } : null;
    // A bracket decided by time trial: the time goes to the player's open match, which may settle it.
    if (kind === "bracket") {
      const r = await bracketTtAdd(id, who.userId, { track: String(body?.track ?? ""), ms, screenshot: proofUrl, laps, read: read2 });
      if (!r.ok) return bracketRefused(r.error);
      return bracketView(id, who, { added: { timeId: r.timeId, place: 0, total: 0, needsClip: r.needsClip }, match: { won: r.won, lost: r.lost, settled: r.settled, held: r.held } });
    }
    // A Swiss event decided by time trial: the time goes to the player's current match.
    if (kind === "swiss") {
      const r = await swissTtAdd(id, who.userId, { track: String(body?.track ?? ""), ms, screenshot: proofUrl, laps, read: read2 });
      if (!r.ok) {
        const message = r.error === "bad_track" ? TT_ERRORS.bad_track : r.error === "closed" ? "Your match is already settled." : r.error === "held" ? TT_ERRORS.held : SWISS_ERRORS[r.error];
        return NextResponse.json({ ok: false, error: r.error, message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, added: { timeId: r.timeId, place: 0, total: 0, needsClip: r.needsClip }, match: { won: r.won, lost: r.lost, settled: r.settled, held: r.held } });
    }
    const r = await playerAdd(id, who.userId, {
      track: String(body?.track ?? ""), ms, runoff: body?.runoff === true, screenshot: proofUrl, laps,
      read: read ? { timeMs: read.timeMs ?? null, laps: read.laps ?? null, parts: read.parts ?? null } : null,
    });
    if (!r.ok) return refused(r.error);
    return view(id, who, { added: { timeId: r.timeId, place: r.place, total: r.total, needsClip: r.needsClip } });
  }

  return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
}
