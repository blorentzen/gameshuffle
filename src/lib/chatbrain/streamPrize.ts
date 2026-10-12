import "server-only";

/**
 * Chat Brain on stream: the prize for the top brains (chat-brain-stream-m2.sql).
 * The host picks an amount when starting a game; when the game ends it's split
 * between the top three viewers by points (streamRules.prizeSplit) and paid
 * from the streamer's monthly allowance. Until the migration runs, prizes are
 * off: prizeReady() is false and the option stays hidden.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { defaultCeiling, getCurrentAllowance } from "@/lib/economy/awards";
import { payViewer } from "@/lib/economy/viewerPayouts";
import { PRIZE_MAX, prizeSplit } from "./streamRules";

let ready: { at: number; value: boolean } | null = null;

/** Whether games can carry a prize yet (the column exists). Checked once a minute. */
export async function prizeReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.value;
  const { error } = await createServiceClient().from("brain_stream_games").select("prize_tokens").limit(1);
  ready = { at: Date.now(), value: !error };
  return ready.value;
}

/** Put a prize on a new game (nothing when the amount is 0 or prizes aren't ready). */
export async function setPrize(gameId: string, tokens: number | undefined): Promise<void> {
  const amount = Math.min(PRIZE_MAX, Math.max(0, Math.floor(Number(tokens) || 0)));
  if (!amount || !(await prizeReady())) return;
  const { error } = await createServiceClient().from("brain_stream_games").update({ prize_tokens: amount, tokens_on: true }).eq("id", gameId);
  if (error) console.error("[chatbrain/prize] prize not set:", error);
  prizeCache.set(gameId, amount);
}

const prizeCache = new Map<string, number>();

/** A game's prize (0 for none). Cached: it's set once at the start. */
export async function prizeOf(gameId: string): Promise<number> {
  const hit = prizeCache.get(gameId);
  if (hit !== undefined) return hit;
  if (!(await prizeReady())) return 0;
  const { data, error } = await createServiceClient().from("brain_stream_games").select("prize_tokens").eq("id", gameId).maybeSingle();
  const value = error ? 0 : Number((data as { prize_tokens: number } | null)?.prize_tokens ?? 0);
  prizeCache.set(gameId, value);
  if (prizeCache.size > 500) prizeCache.delete(prizeCache.keys().next().value!);
  return value;
}

/** How many tokens the streamer has left to give this month (their allowance). */
export async function allowanceLeft(communityId: string): Promise<number> {
  const a = await getCurrentAllowance(communityId).catch(() => null);
  return a ? a.remaining : await defaultCeiling().catch(() => 0);
}

export interface PrizePaid { key: string; name: string; tokens: number }

/**
 * Pay the prize when a game ends (call once, after claiming the finish). Viewers
 * are paid top first, so a short allowance shorts the bottom of the list.
 */
export async function payPrize(game: { id: string; host_community_id: string }): Promise<PrizePaid[]> {
  const prize = await prizeOf(game.id);
  if (!prize) return [];
  const { data } = await createServiceClient().from("brain_stream_playalong").select("platform, viewer, name, points")
    .eq("game_id", game.id).gt("points", 0).order("points", { ascending: false }).limit(50);
  const rows = (data ?? []) as { platform: string; viewer: string; name: string | null; points: number }[];
  const cuts = prizeSplit(prize, rows.map((r) => ({ key: `${r.platform}:${r.viewer}`, points: r.points })));
  const paid: PrizePaid[] = [];
  for (const r of rows) {
    const key = `${r.platform}:${r.viewer}`;
    const amount = cuts.get(key);
    if (!amount) continue;
    const minted = await payViewer(game.host_community_id, game.id, { platform: r.platform, viewer: r.viewer, name: r.name }, amount, "chat_brain");
    if (minted > 0) paid.push({ key, name: r.name || "A viewer", tokens: minted });
  }
  return paid;
}
