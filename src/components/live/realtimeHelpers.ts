/**
 * Pure-function helpers for <RealtimeLiveView />. Lives in its own
 * module so the test surface (scripts/test-live-view-realtime.ts) can
 * import without dragging in React or Supabase client deps.
 *
 * Per gs-live-view-realtime-spec-v2.md §3.4 (per-channel polling) +
 * §7 (reconnect / visibility throttling).
 */

/** Channels the live view subscribes to. Lifecycle phase ships
 *  session/participants/events/modules. Rounds + ballots add later
 *  alongside the picks/bans round phase. */
export type LiveChannelName =
  | "session"
  | "participants"
  | "events"
  | "modules";

export type LiveChannelStatus = "subscribed" | "failed" | "closed" | "pending";

/** Build the per-session channel name. Stable across renders so
 *  Supabase's channel registry can dedupe. */
export function buildChannelName(
  surface: LiveChannelName,
  sessionId: string
): string {
  return `live-${surface}-${sessionId}`;
}

/**
 * Per-channel polling list — surfaces whose channels are not currently
 * SUBSCRIBED. Polling fills the gap for failed channels only; healthy
 * channels keep firing realtime events without a redundant poll.
 *
 * Per spec §3.4 — replaces v1's all-or-nothing fallback that would
 * pile polling on top of healthy channels.
 */
export function derivePollingNeeded(
  states: Record<LiveChannelName, LiveChannelStatus>
): LiveChannelName[] {
  const out: LiveChannelName[] = [];
  for (const name of Object.keys(states) as LiveChannelName[]) {
    if (states[name] !== "subscribed") out.push(name);
  }
  return out;
}

/**
 * Exponential backoff for resubscribe attempts. Sequence: 1s → 2s →
 * 4s → 8s → 16s → 30s → 30s … (capped at 30s).
 *
 * `attempt` is 0-indexed. Returns the delay in milliseconds before the
 * NEXT resubscribe attempt.
 */
export function resubscribeBackoffMs(attempt: number): number {
  const cap = 30_000;
  if (attempt < 0) return 1_000;
  const ms = 1_000 * Math.pow(2, attempt);
  return Math.min(ms, cap);
}

/**
 * Visibility-throttle predicate. The live view unsubscribes all
 * channels when the tab has been hidden for more than 60s and
 * resubscribes (with a fresh refreshAll) when the tab returns.
 *
 * Returns the action to take based on the elapsed hidden duration.
 */
export type VisibilityAction = "unsubscribe" | "noop";

export function visibilityAction(args: {
  isHidden: boolean;
  hiddenSinceMs: number | null;
  nowMs: number;
  thresholdMs?: number;
}): VisibilityAction {
  if (!args.isHidden || args.hiddenSinceMs === null) return "noop";
  const threshold = args.thresholdMs ?? 60_000;
  return args.nowMs - args.hiddenSinceMs >= threshold
    ? "unsubscribe"
    : "noop";
}

/** Default initial channel state map — every channel starts pending
 *  until its subscribe handshake resolves. */
export function initialChannelHealth(): Record<
  LiveChannelName,
  LiveChannelStatus
> {
  return {
    session: "pending",
    participants: "pending",
    events: "pending",
    modules: "pending",
  };
}
