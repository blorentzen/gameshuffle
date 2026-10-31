/**
 * Trivia inside the Discord Activity (Bearer session).
 *   GET                    → { live }  the server's trivia night on stream (or null), as this player sees it
 *   GET ?practice=1&skip=… → { questions }  five practice questions (no answers)
 *   POST { text }          → answer the live question (409 when it's closed)
 *   POST { practice, text } → { verdict, answer }  check one practice answer (nothing saved)
 */

import { NextResponse, type NextRequest } from "next/server";
import { sessionFrom } from "@/lib/activity/session";
import { rateLimit } from "@/lib/ratelimit";
import { checkPractice, practiceSet, serverTriviaGame } from "@/lib/activity/trivia";
import { answerFromWeb, liveStreamGame, streamView } from "@/lib/trivia/stream";
import { viewerForDiscord } from "@/lib/trivia/discord";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("practice")) {
    const skip = new Set((sp.get("skip") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 60));
    return NextResponse.json({ ok: true, questions: await practiceSet(skip) }, { headers: NO_STORE });
  }
  const game = await serverTriviaGame(s.gid);
  if (!game) return NextResponse.json({ ok: true, live: null }, { headers: NO_STORE });
  const viewer = await viewerForDiscord({ id: s.did, name: s.name });
  return NextResponse.json({ ok: true, live: await streamView(game, viewer) }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const s = sessionFrom(req);
  if (!s) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { ok } = await rateLimit(`activity-trivia:${s.did}`, { max: 30, windowMs: 60_000 });
  if (!ok) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; practice?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 120).trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  if (typeof body.practice === "string") {
    const r = await checkPractice(body.practice, text);
    return r ? NextResponse.json({ ok: true, ...r }) : NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const first = await serverTriviaGame(s.gid);
  // Read it fresh for the answer: the cached copy can be a second behind the host.
  const game = first ? await liveStreamGame(first.host_user_id, { fresh: true }) : null;
  if (!game) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const viewer = await viewerForDiscord({ id: s.did, name: s.name });
  const r = await answerFromWeb(game, viewer, text);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: 409 });
}
