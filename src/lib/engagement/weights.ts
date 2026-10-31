/**
 * Engagement signal types and their built-in point values. Client-safe, so
 * Platform ▸ Chat bot ▸ Engagement shows the same defaults the server falls
 * back to (src/lib/engagement/signals.ts).
 */

export type SignalType =
  | "command_fired"
  | "event_fired"
  | "social_action"
  | "token_earned"
  | "token_spent";

export const SIGNAL_TYPES: SignalType[] = ["command_fired", "event_fired", "social_action", "token_earned", "token_spent"];

/** Hardcoded fallbacks used when the weights table is empty / the
 *  cache hasn't loaded yet. Should match the Phase 2 migration's
 *  seed so cache-miss behavior is identical to "no override set." */
export const DEFAULT_WEIGHTS: Record<SignalType, number> = {
  command_fired: 1,
  event_fired: 5,
  social_action: 3,
  token_earned: 1, // multiplied by amount at log time
  token_spent: 1, // multiplied by amount at log time
};
