/**
 * Session ↔ economy lifecycle bridge.
 *
 * Wires the two distinct refund triggers per Spec 01 + 02:
 *
 *   • Session ends (any cause — manual, category switch, grace
 *     expiry) → silent refund of THAT session's markets only.
 *     `refundSessionMarkets`.
 *
 *   • Stream confirmed ended (grace expired without recovery) →
 *     silent refund of every market across every session in that
 *     stream. `finalizeStreamEnd` + `refundStreamMarkets`.
 *
 * The two are NOT redundant. A streamer who finishes MK8DX and
 * starts Mario Party is firing session-end (markets clean up), NOT
 * stream-end. Only the broadcast ending fires stream-end.
 *
 * Every hook in this module is best-effort: if the refund fails we
 * log + swallow so a downstream economy bug never blocks the session
 * lifecycle from progressing. Sessions transitioning is more important
 * than markets refunding cleanly.
 */

import "server-only";
import {
  refundSessionMarkets,
  refundStreamMarkets,
} from "@/lib/economy/markets/lifecycle";
import {
  finalizeStreamEnd,
  sweepExpiredStreams,
  type Stream,
} from "@/lib/economy/streams";

/**
 * Fire from every code path that transitions a session into `ending`
 * or `ended`. Refunds open/locked markets bound to that session.
 *
 * Reason determines the audit trail on each refund event — pass
 * `"session_end"` for the normal path and `"chapter_advance"` when
 * future code introduces chapter pinning (M2+).
 */
export async function onSessionEnding(args: {
  sessionId: string;
  reason?: "session_end" | "chapter_advance";
}): Promise<void> {
  try {
    await refundSessionMarkets({
      sessionId: args.sessionId,
      reason: args.reason ?? "session_end",
    });
  } catch (err) {
    console.error("[economy/sessionHooks] refundSessionMarkets failed", {
      sessionId: args.sessionId,
      err: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Sweep + refund any streams whose grace expired since the last tick.
 * Returns the list of streams that fully ended so callers can log
 * counts. Markets refund per-stream, NOT per-session — see Spec 02 §8.
 *
 * Called from the existing session-lifecycle cron, NOT from a
 * separate cron. The cadence (every 5 minutes) is slower than the
 * 60-second stream grace; that's fine for M1 since the user-visible
 * effect is "your bet was refunded a few minutes after the streamer
 * went offline" — well within "silent refund" expectations.
 */
export async function sweepStreamEndsAndRefund(): Promise<{
  finalizedStreams: number;
  refundedMarkets: number;
  refundedBets: number;
}> {
  let finalized: Stream[] = [];
  try {
    finalized = await sweepExpiredStreams();
  } catch (err) {
    console.error("[economy/sessionHooks] sweepExpiredStreams failed", err);
    return { finalizedStreams: 0, refundedMarkets: 0, refundedBets: 0 };
  }
  let refundedMarkets = 0;
  let refundedBets = 0;
  for (const stream of finalized) {
    try {
      const result = await refundStreamMarkets({ streamId: stream.id });
      refundedMarkets += result.refundedMarkets;
      refundedBets += result.refundedBets;
    } catch (err) {
      console.error("[economy/sessionHooks] refundStreamMarkets failed", {
        streamId: stream.id,
        err: err instanceof Error ? err.message : err,
      });
    }
  }
  return {
    finalizedStreams: finalized.length,
    refundedMarkets,
    refundedBets,
  };
}

/**
 * Explicit single-stream finalize. Used by the webhook in case a
 * future hand-off ever needs to confirm-end a stream synchronously
 * (e.g. an admin override). Wraps finalizeStreamEnd + refund.
 */
export async function onStreamConfirmedEnded(args: {
  streamId: string;
}): Promise<void> {
  try {
    await finalizeStreamEnd({ streamId: args.streamId });
  } catch (err) {
    console.error("[economy/sessionHooks] finalizeStreamEnd failed", {
      streamId: args.streamId,
      err: err instanceof Error ? err.message : err,
    });
    return;
  }
  try {
    await refundStreamMarkets({ streamId: args.streamId });
  } catch (err) {
    console.error("[economy/sessionHooks] refundStreamMarkets failed", {
      streamId: args.streamId,
      err: err instanceof Error ? err.message : err,
    });
  }
}
