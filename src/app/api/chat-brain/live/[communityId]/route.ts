/**
 * The streamer's Chat Brain on their live page (public read, signed-in answers).
 *   GET  /api/chat-brain/live/[communityId] → { game, survey, open, signedIn, you }
 *        game = the running game (or one that just finished), as on the overlay; survey = an open or
 *        just-closed survey round when no game is running; open = the channel's open window
 *        ({ opensAt, closesAt }), so the page knows when answers count; you = the viewer's answer in
 *        the open window and their points this game.
 *   POST /api/chat-brain/live/[communityId] { text } → a signed-in viewer's `!a`: a guess, a play-along
 *        answer, a speed-round find or a survey answer, whatever is open.
 * A viewer with Twitch linked is the same player as in chat (breakViewer); anyone else plays as their
 * account. Nothing here shows more than the overlay does.
 */

import { NextResponse } from "next/server";
import { breakViewer } from "@/lib/break/viewer";
import { rateLimit } from "@/lib/ratelimit";
import { brainLiveAnswer, brainLiveView } from "@/lib/chatbrain/live";

export const runtime = "nodejs";

const ID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!ID.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const viewer = await breakViewer();
  const view = await brainLiveView(communityId, viewer);
  return NextResponse.json({ ok: true, ...view, signedIn: !!viewer }, { headers: NO_STORE });
}

export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!ID.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const viewer = await breakViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { ok: allowed } = await rateLimit(`cblive:${viewer.platform}:${viewer.viewer}`, { max: 10, windowMs: 10_000 });
  if (!allowed) return NextResponse.json({ ok: false, error: "slow_down" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 60).trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  const r = await brainLiveAnswer(communityId, viewer, text);
  if (r === "saved") return NextResponse.json({ ok: true });
  if (r === "not_found") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: false, error: r }, { status: r === "rejected" ? 400 : 409 });
}
