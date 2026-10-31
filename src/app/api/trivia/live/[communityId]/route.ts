/**
 * The streamer's trivia night on their live page (public read).
 *   GET  /api/trivia/live/[communityId] → { view, signedIn } (view = the night on stream, or one that just ended)
 *   POST /api/trivia/live/[communityId] { text } → a signed-in viewer's answer to the open question.
 * A viewer with Twitch linked is the same player as in chat (breakViewer).
 */

import { NextResponse } from "next/server";
import { breakViewer } from "@/lib/break/viewer";
import { answerFromWeb, liveStreamGame, ownerOfCommunity, overlayTrivia, streamView } from "@/lib/trivia/stream";

export const runtime = "nodejs";

const ID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!ID.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const owner = await ownerOfCommunity(communityId);
  if (!owner) return NextResponse.json({ ok: true, view: null }, { headers: { "Cache-Control": "no-store" } });
  const [viewer, live] = await Promise.all([breakViewer(), liveStreamGame(owner)]);
  const who = viewer ? { platform: viewer.platform, id: viewer.viewer, name: viewer.name } : null;
  const view = live ? await streamView(live, who) : await overlayTrivia(owner);
  return NextResponse.json({ ok: true, view, signedIn: !!viewer }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!ID.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const viewer = await breakViewer();
  if (!viewer) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.slice(0, 120).trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  const owner = await ownerOfCommunity(communityId);
  const game = owner ? await liveStreamGame(owner, { fresh: true }) : null;
  if (!game) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = await answerFromWeb(game, { platform: viewer.platform, id: viewer.viewer, name: viewer.name }, text);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: r.error }, { status: 409 });
}
