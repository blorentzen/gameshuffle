/**
 * Stream lifecycle layer.
 *
 * A `gs_streams` row models ONE Twitch broadcast — start to end,
 * across however many games the streamer plays. The critical
 * separation per the architecture decision: markets scope per
 * `session_id`, but the silent refund fires per `stream_id`. A
 * streamer ending an MK8DX session and starting Mario Party is
 * session-end (markets close cleanly, NO refund). The Twitch
 * broadcast going offline beyond the grace window is stream-end
 * (silent refund of every open market across every session in
 * that stream).
 *
 * Lifecycle:
 *
 *   stream.online webhook  → ensureActiveStream() returns/creates
 *                            an `open` row
 *   stream.offline webhook → markStreamEnding() flips to `ending`,
 *                            sets offline_at, starts grace clock
 *   stream.online (during  → cancelStreamEnding() flips back to
 *    grace)                  `open`, clears offline_at
 *   grace expires           → finalizeStreamEnd() flips to `ended`,
 *                            fires refundStreamMarkets()
 *
 * The grace window is `gs_economy_config.stream_end_grace_seconds`
 * (default 60). Refund logic lives in `./markets/refund.ts` and is
 * invoked from finalizeStreamEnd via a callback so this module
 * stays decoupled from the market subsystem.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type StreamStatus = "open" | "ending" | "ended";

export interface Stream {
  id: string;
  community_id: string;
  status: StreamStatus;
  started_at: string;
  offline_at: string | null;
  ended_at: string | null;
}

/**
 * Get the currently-open or ending stream for a community, or null
 * if the streamer isn't live (and isn't in a grace window). Used by
 * webhook handlers + market opens to find the right `stream_id`.
 */
export async function getActiveStreamForCommunity(
  communityId: string,
): Promise<Stream | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_streams")
    .select("id, community_id, status, started_at, offline_at, ended_at")
    .eq("community_id", communityId)
    .in("status", ["open", "ending"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Stream | null) ?? null;
}

/**
 * Idempotent "the streamer is live" hook. Returns the existing
 * `open`/`ending` row if one exists (flipping `ending` → `open` to
 * represent recovery). Otherwise inserts a fresh `open` row.
 *
 * Called from Twitch's `stream.online` webhook handler — `stream.online`
 * fires both on a real start AND on a reconnect within the grace
 * window, so we have to unify both cases.
 */
export async function ensureActiveStream(args: {
  communityId: string;
}): Promise<Stream> {
  const admin = createServiceClient();
  const existing = await getActiveStreamForCommunity(args.communityId);
  if (existing) {
    // Recovery path — was `ending`, now back. Wipe the grace marker
    // so the cron sweep doesn't misfire and refund a live market.
    if (existing.status === "ending") {
      const { data, error } = await admin
        .from("gs_streams")
        .update({ status: "open", offline_at: null })
        .eq("id", existing.id)
        .select("id, community_id, status, started_at, offline_at, ended_at")
        .single();
      if (error) throw new Error(`ensureActiveStream recovery failed: ${error.message}`);
      return data as Stream;
    }
    return existing;
  }

  const { data, error } = await admin
    .from("gs_streams")
    .insert({ community_id: args.communityId, status: "open" })
    .select("id, community_id, status, started_at, offline_at, ended_at")
    .single();
  if (error) throw new Error(`ensureActiveStream insert failed: ${error.message}`);
  return data as Stream;
}

/**
 * Start the grace clock. Twitch's `stream.offline` webhook fires
 * this — we don't refund yet, we just mark when the offline signal
 * arrived so the cron sweep can decide if it's a true end or a
 * brief disconnect.
 *
 * Idempotent: re-calling on an already-`ending` row is a no-op (we
 * keep the original offline_at so a flapping connection doesn't
 * extend the grace window indefinitely).
 */
export async function markStreamEnding(args: {
  streamId: string;
}): Promise<Stream | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_streams")
    .update({ status: "ending", offline_at: new Date().toISOString() })
    .eq("id", args.streamId)
    .eq("status", "open")
    .select("id, community_id, status, started_at, offline_at, ended_at")
    .maybeSingle();
  if (error) throw new Error(`markStreamEnding failed: ${error.message}`);
  return (data as Stream | null) ?? null;
}

/**
 * Recover from a grace window. Called when `stream.online` arrives
 * before the grace expiry — flip status back, clear offline_at.
 * Returns the updated row, or null if the stream wasn't in `ending`.
 */
export async function cancelStreamEnding(args: {
  streamId: string;
}): Promise<Stream | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_streams")
    .update({ status: "open", offline_at: null })
    .eq("id", args.streamId)
    .eq("status", "ending")
    .select("id, community_id, status, started_at, offline_at, ended_at")
    .maybeSingle();
  if (error) throw new Error(`cancelStreamEnding failed: ${error.message}`);
  return (data as Stream | null) ?? null;
}

/**
 * Confirmed stream end. Flips `ending` → `ended` and stamps
 * `ended_at`. Caller is responsible for firing the silent market
 * refund AFTER this returns — keeping the side-effect explicit at
 * the call site makes the "refunds key off stream_id" invariant
 * visible in the code, not buried in a hook.
 *
 * Idempotent: re-calling on an `ended` row is a no-op.
 */
export async function finalizeStreamEnd(args: {
  streamId: string;
}): Promise<Stream | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_streams")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", args.streamId)
    .eq("status", "ending")
    .select("id, community_id, status, started_at, offline_at, ended_at")
    .maybeSingle();
  if (error) throw new Error(`finalizeStreamEnd failed: ${error.message}`);
  return (data as Stream | null) ?? null;
}

/**
 * Sweep `ending` streams whose grace window has expired. Returns
 * the list of newly-`ended` streams so the caller can fan out the
 * silent market refund per stream_id. Driven by a Vercel cron at
 * ~30-second cadence (configured separately) — the spec's default
 * grace is 60 seconds, so two cron ticks worth of slack.
 */
export async function sweepExpiredStreams(): Promise<Stream[]> {
  const admin = createServiceClient();
  // Read the configured grace window via the economy config helper —
  // every economy number flows through gs_economy_config (Spec 01 §2.4).
  const { data: cfg } = await admin.rpc("gs_economy_config_value", {
    p_key: "stream_end_grace_seconds",
    p_default: 60,
  });
  const graceSeconds = Number(cfg ?? 60);
  const cutoff = new Date(Date.now() - graceSeconds * 1000).toISOString();

  // Pull every `ending` row whose offline_at is past the cutoff.
  // Walking in one query + finalizing one row at a time keeps the
  // refund work per-stream auditable.
  const { data: rows } = await admin
    .from("gs_streams")
    .select("id, community_id, status, started_at, offline_at, ended_at")
    .eq("status", "ending")
    .lt("offline_at", cutoff);
  const candidates = (rows as Stream[] | null) ?? [];

  const finalized: Stream[] = [];
  for (const row of candidates) {
    const settled = await finalizeStreamEnd({ streamId: row.id });
    if (settled) finalized.push(settled);
  }
  return finalized;
}
