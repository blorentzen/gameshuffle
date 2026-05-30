/**
 * Universal arg parser — Spec 03 §1 "Arg parsing".
 *
 * All commands that accept a `@user` or `<amount>` route through this
 * module so the grammar is consistent. Per spec:
 *
 *   - User token (`@name`) before amount, always.
 *   - Amount accepts: positive integer, `N%`, or `all`.
 *   - Bare command = self-target; `@user` shifts target.
 *
 * The amount portion delegates to `parseAmount` in
 * `src/lib/economy/tokens.ts` so the single int/%/all grammar lives
 * in one place.
 */

import "server-only";
import { parseAmount } from "@/lib/economy/tokens";

export interface ParsedCommandArgs {
  /** Twitch login (no `@`) when the caller specified one. Null when
   *  they didn't — caller is the implicit target. Lower-cased so
   *  Helix lookups can match case-insensitively. */
  user: string | null;
  /** Integer amount resolved against `callerBalance`. Null when no
   *  amount token was present OR the token didn't parse. */
  amount: number | null;
  /** Tokens left over after stripping `@user` and `<amount>`. Useful
   *  for free-form trailing args like `!8ball <question>` or
   *  `!gs resolve <value>`. Trimmed. */
  rest: string;
  /** True when the raw input was empty (whitespace only). Caller is
   *  acting on self with no amount. */
  empty: boolean;
}

/**
 * Parse a chat argument string per Spec 03's universal grammar.
 * Caller passes their current balance so `N%` / `all` resolve
 * against it (lazy callers can pass 0; the parser returns null for
 * `all` when balance is 0).
 *
 * Order assumption: user-before-amount. `!give @user 100` parses;
 * `!give 100 @user` does NOT — the `@user` becomes the trailing
 * `rest` token. This matches the spec.
 *
 * @example
 *   parseArgs("@viewer 50", 200)   → { user: "viewer", amount: 50, rest: "", empty: false }
 *   parseArgs("all", 200)          → { user: null, amount: 200, rest: "", empty: false }
 *   parseArgs("50%", 200)          → { user: null, amount: 100, rest: "", empty: false }
 *   parseArgs("@a 10 win", 100)    → { user: "a", amount: 10, rest: "win", empty: false }
 *   parseArgs("", 100)             → { user: null, amount: null, rest: "", empty: true }
 */
export function parseArgs(
  input: string,
  callerBalance: number,
): ParsedCommandArgs {
  const trimmed = input.trim();
  if (!trimmed) {
    return { user: null, amount: null, rest: "", empty: true };
  }
  const tokens = trimmed.split(/\s+/);

  let user: string | null = null;
  let amount: number | null = null;
  const rest: string[] = [];

  for (const token of tokens) {
    if (user === null && token.startsWith("@") && token.length > 1) {
      user = token.slice(1).toLowerCase();
      continue;
    }
    if (amount === null) {
      const parsed = parseAmount(token, callerBalance);
      if (parsed !== null) {
        amount = parsed;
        continue;
      }
    }
    rest.push(token);
  }

  return {
    user,
    amount,
    rest: rest.join(" "),
    empty: false,
  };
}

/** Lightweight predicate — does the input look like it starts with an
 *  `@mention`? Useful for routing decisions (e.g. `!tokens @viewer`
 *  is a balance lookup while `!tokens` is self-balance). */
export function looksLikeUserMention(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("@") && trimmed.length > 1;
}
