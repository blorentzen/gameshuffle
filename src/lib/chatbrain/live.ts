import "server-only";

/**
 * The streamer's Chat Brain as viewers see it off the overlay: the live page
 * (/api/chat-brain/live/[communityId]) and the Twitch extension share this.
 * The game or survey on stream (cached a second, since every viewer polls),
 * the open window, and one viewer's answer and points; plus a viewer's answer.
 */

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { openWindowFor, recordGuess, type Platform, type StreamWindow } from "@/lib/chatbrain/stream";
import { gameView, getShowableGame, tickGame, type StreamGameView } from "@/lib/chatbrain/streamGame";
import { guestGameFor } from "@/lib/chatbrain/streamCostream";
import { overlaySurveyView, tickSurvey, type StreamSurveyView } from "@/lib/chatbrain/survey";

export interface BrainLiveViewer { platform: Platform; viewer: string; name: string }

export interface BrainLiveView {
  game: StreamGameView | null;
  survey: StreamSurveyView | null;
  open: { opensAt: string; closesAt: string } | null;
  you: { answer: string | null; points: number } | null;
}

// The channel behind a community (a minute), and what's on stream (a second): every viewer polls this.
const channels = new Map<string, { at: number; broadcasterId: string | null }>();
const shown = new Map<string, { at: number; game: StreamGameView | null; survey: StreamSurveyView | null; window: StreamWindow | null }>();

export async function channelFor(communityId: string): Promise<string | null> {
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

/** What's on stream, and this viewer's part in it. */
export async function brainLiveView(communityId: string, viewer: BrainLiveViewer | null): Promise<BrainLiveView> {
  const broadcasterId = await channelFor(communityId);
  if (!broadcasterId) return { game: null, survey: null, open: null, you: null };
  const { game, survey, window } = await onStream(communityId, broadcasterId);
  let you: BrainLiveView["you"] = null;
  if (viewer && (game || survey)) {
    const svc = createServiceClient();
    const [{ data: mine }, { data: pts }] = await Promise.all([
      window ? svc.from("brain_stream_guesses").select("raw").eq("window_id", window.id).eq("platform", viewer.platform).eq("viewer", viewer.viewer).maybeSingle() : Promise.resolve({ data: null }),
      game ? svc.from("brain_stream_playalong").select("points").eq("game_id", game.id).eq("platform", viewer.platform).eq("viewer", viewer.viewer).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    you = { answer: (mine as { raw: string } | null)?.raw ?? null, points: (pts as { points: number } | null)?.points ?? 0 };
  }
  const open = window && window.status === "open" ? { opensAt: window.opensAt, closesAt: window.closesAt } : null;
  return { game, survey, open, you };
}

/** A viewer's `!a`: a guess, a play-along answer, a speed-round find or a survey answer, whatever is open. */
export async function brainLiveAnswer(communityId: string, viewer: BrainLiveViewer, text: string): Promise<"saved" | "rejected" | "closed" | "not_found"> {
  const broadcasterId = await channelFor(communityId);
  if (!broadcasterId) return "not_found";
  const r = await recordGuess({ broadcasterId, platform: viewer.platform, viewer: viewer.viewer, name: viewer.name, raw: text });
  shown.delete(communityId);
  return r === "saved" ? "saved" : r === "rejected" ? "rejected" : "closed";
}
