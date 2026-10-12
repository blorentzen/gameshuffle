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

import { NextResponse, after } from "next/server";
import { breakViewer } from "@/lib/break/viewer";
import { createServiceClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { openWindowFor, recordGuess, type StreamWindow } from "@/lib/chatbrain/stream";
import { gameView, getShowableGame, tickGame, type StreamGameView } from "@/lib/chatbrain/streamGame";
import { guestGameFor } from "@/lib/chatbrain/streamCostream";
import { overlaySurveyView, tickSurvey, type StreamSurveyView } from "@/lib/chatbrain/survey";

export const runtime = "nodejs";

const ID = /^[0-9a-f-]{36}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

// The channel behind a community (a minute), and what's on stream (a second): every viewer polls this.
const channels = new Map<string, { at: number; broadcasterId: string | null }>();
const shown = new Map<string, { at: number; game: StreamGameView | null; survey: StreamSurveyView | null; window: StreamWindow | null }>();

async function channelFor(communityId: string): Promise<string | null> {
  const hit = channels.get(communityId);
  if (hit && Date.now() - hit.at < 60_000) return hit.broadcasterId;
  const svc = createServiceClient();
  const { data: c } = await svc.from("gs_communities").select("owner_user_id").eq("id", communityId).maybeSingle();
  const owner = (c as { owner_user_id: string | null } | null)?.owner_user_id ?? null;
  const { data: t } = owner ? await svc.from("twitch_connections").select("twitch_user_id").eq("user_id", owner).maybeSingle() : { data: null };
  const broadcasterId = (t as { twitch_user_id: string | null } | null)?.twitch_user_id ?? null;
  channels.set(communityId, { at: Date.now(), broadcasterId });
  if (channels.size > 500) channels.delete(channels.keys().next().value!);
  return broadcasterId;
}

/** Same order as the overlay: a running game wins, then an open survey, then a game that just finished. */
async function onStream(communityId: string, broadcasterId: string) {
  const hit = shown.get(communityId);
  if (hit && Date.now() - hit.at < 1000) return hit;
  let game: StreamGameView | null = null;
  let survey: StreamSurveyView | null = null;
  // A streamer who is the guest in a co-stream shows the host's game.
  const g = (await getShowableGame(communityId)) ?? (await guestGameFor(communityId));
  if (g?.status === "playing") game = await gameView(await tickGame(g));
  else {
    survey = await overlaySurveyView(communityId).catch(() => null);
    if (g && survey?.status !== "open") { game = await gameView(g); survey = null; }
    if (survey?.status === "open") after(() => tickSurvey(communityId).catch((err) => console.error("[chat-brain/live] survey close failed:", err)));
  }
  const window = game?.status === "playing" || survey?.status === "open" ? await openWindowFor(broadcasterId) : null;
  const value = { at: Date.now(), game, survey, window };
  shown.set(communityId, value);
  if (shown.size > 500) shown.delete(shown.keys().next().value!);
  return value;
}

export async function GET(_req: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  if (!ID.test(communityId)) return NextResponse.json({ ok: false, error: "bad_id" }, { status: 400 });
  const broadcasterId = await channelFor(communityId);
  if (!broadcasterId) return NextResponse.json({ ok: true, game: null, survey: null, open: null, signedIn: false, you: null }, { headers: NO_STORE });
  const [viewer, now] = await Promise.all([breakViewer(), onStream(communityId, broadcasterId)]);
  const { game, survey, window } = now;
  let you: { answer: string | null; points: number } | null = null;
  if (viewer && (game || survey)) {
    const svc = createServiceClient();
    const [{ data: mine }, { data: pts }] = await Promise.all([
      window ? svc.from("brain_stream_guesses").select("raw").eq("window_id", window.id).eq("platform", viewer.platform).eq("viewer", viewer.viewer).maybeSingle() : Promise.resolve({ data: null }),
      game ? svc.from("brain_stream_playalong").select("points").eq("game_id", game.id).eq("platform", viewer.platform).eq("viewer", viewer.viewer).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    you = { answer: (mine as { raw: string } | null)?.raw ?? null, points: (pts as { points: number } | null)?.points ?? 0 };
  }
  const open = window && window.status === "open" ? { opensAt: window.opensAt, closesAt: window.closesAt } : null;
  return NextResponse.json({ ok: true, game, survey, open, signedIn: !!viewer, you }, { headers: NO_STORE });
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
  const broadcasterId = await channelFor(communityId);
  if (!broadcasterId) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = await recordGuess({ broadcasterId, platform: viewer.platform, viewer: viewer.viewer, name: viewer.name, raw: text });
  shown.delete(communityId);
  if (r === "saved") return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, error: r === "rejected" ? "rejected" : "closed" }, { status: r === "rejected" ? 400 : 409 });
}
