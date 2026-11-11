import "server-only";

/**
 * The run card's data (speedrun Twitch and Discord picks 2026-11-10): the run as the overlay has it, for the live page
 * (/api/live/<name>/run) and the Twitch extension's card (its public state). Shown while a run is going and for two
 * minutes after it finishes or resets; the page waits out the runner's stream delay before showing each state.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { relayState } from "./relay";
import { cleanSettings, runShown } from "./rules";
import { latestForRelay } from "./prediction";
import type { RelayState } from "./types";

export interface LiveRunBody {
  kind: "run";
  run: { game: string; category: string; state: RelayState; ageMs: number };
  /** The stream delay (the setup's "Replies wait"): the card shows each state this long after it happened. */
  delayMs: number;
  /** A "PB this run" bet is open: the card points to chat (extension) or the bet card under it (live page). */
  bet: boolean;
}

const cache = new Map<string, { at: number; value: LiveRunBody | null }>();

/** The runner's run for the card, or null when nothing's going (cached 1.5 seconds: every viewer asks). */
export async function liveRunBody(userId: string): Promise<LiveRunBody | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 1500) return hit.value;
  const value = await read(userId).catch((e) => {
    console.error("[speedrun] live run:", e);
    return null;
  });
  cache.set(userId, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return value;
}

async function read(userId: string): Promise<LiveRunBody | null> {
  const { data } = await createServiceClient().from("speedrun_setups").select("relay_id, game, category, settings").eq("user_id", userId).maybeSingle();
  const setup = data as { relay_id: string; game: string | null; category: string | null; settings: unknown } | null;
  if (!setup) return null;
  const rs = await relayState(setup.relay_id);
  const st = rs.ok ? rs.state : null;
  if (!st || !runShown(st, Date.now())) return null;
  const [market, { gameName }] = await Promise.all([
    latestForRelay(setup.relay_id).catch(() => null),
    import("./store"), // store imports prediction, which imports this file's neighbours: loaded on use
  ]);
  const bet = !!market && market.status === "open" && !(market.lock_at && Date.parse(market.lock_at) <= Date.now())
    && market.notifications?.speedrun?.attempt === st.attempt;
  return {
    kind: "run",
    run: { game: gameName(st.game ?? setup.game), category: st.category ?? setup.category ?? "", state: st, ageMs: Math.max(0, Date.now() - st.at) },
    delayMs: cleanSettings(setup.settings).replyDelay * 1000,
    bet,
  };
}
