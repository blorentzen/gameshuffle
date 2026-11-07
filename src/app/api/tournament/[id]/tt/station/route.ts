/**
 * A station's runner at an in-person time trial (shapes pick 7A): anyone the organizer gives a station link types the
 * times in, no account needed. GET ?n=&k= is the station (the group up there, its tracks and times); POST
 * { n, k, action: "save", track, times: [{ participantId, time }] } saves times (typed again = replaced), and
 * { n, k, action: "done" } marks the group done and calls the next one to the station. The link's key is checked on
 * every request (tt/store.ts stationKey).
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { parseTime } from "@/lib/timeTrials/rules";
import { TT_ERRORS, runnerAct, stationView, type TtError } from "@/lib/tournaments/tt/store";

export const runtime = "nodejs";

const refused = (error: TtError) =>
  NextResponse.json({ ok: false, error, message: TT_ERRORS[error] }, { status: error === "bad_key" ? 403 : error === "missing" ? 503 : error === "not_found" ? 404 : error === "busy" ? 409 : 400 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const v = await stationView(id, Number(url.searchParams.get("n")), url.searchParams.get("k") ?? "");
  if ("error" in v) return refused(v.error);
  return NextResponse.json({ ok: true, station: v }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { n?: unknown; k?: unknown; action?: unknown; track?: unknown; times?: unknown } | null;
  const n = Number(body?.n), k = String(body?.k ?? "");
  if (!(await rateLimit(`tt-station:${id}:${n}`, { max: 120, windowMs: 10 * 60_000 })).ok) {
    return NextResponse.json({ ok: false, error: "slow_down", message: "That's a lot of saves. Wait a minute and try again." }, { status: 429 });
  }
  if (body?.action === "done") {
    const r = await runnerAct(id, n, k, { action: "done" });
    if (!r.ok) return refused(r.error);
  } else if (body?.action === "save") {
    const times = (Array.isArray(body.times) ? body.times : []).map((t) => {
      const o = (t ?? {}) as { participantId?: unknown; time?: unknown };
      const ms = typeof o.time === "number" ? Math.round(o.time) : parseTime(String(o.time ?? "")) ?? 0;
      return { participantId: String(o.participantId ?? ""), ms };
    }).filter((t) => t.participantId && t.ms > 0);
    const r = await runnerAct(id, n, k, { action: "save", track: String(body.track ?? ""), times });
    if (!r.ok) return refused(r.error);
  } else {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const v = await stationView(id, n, k);
  if ("error" in v) return refused(v.error);
  return NextResponse.json({ ok: true, station: v });
}
