/**
 * Chat command parser — Spec 03 §1.
 *
 * Three shapes the parser accepts:
 *
 *   1. `!gs` (bare info) — produces `path: ['gs']`, empty args.
 *
 *   2. `!gs <noun> [subnoun] [args]` — space-separated subnoun grammar
 *      per Spec 03. Examples:
 *        !gs shuffle           → path: ['gs', 'shuffle']
 *        !gs market open 3     → path: ['gs', 'market', 'open'],   args: '3'
 *        !gs resolve 1         → path: ['gs', 'resolve'],          args: '1'
 *      The dispatcher resolves via the registry, so any depth works
 *      as long as the registration matches the path.
 *
 *   3. **Bare verbs** — `!tokens`, `!bet`, `!roll`, etc. Match against
 *      the registry's first-segment index; the registry is the
 *      authoritative whitelist, so the parser doesn't need to
 *      hard-code the verb list.
 *
 * Legacy hyphenated `!gs-noun-subnoun` shape (M1's
 * `!gs-market-open`, picks/bans' `!gs-pick`, etc.) is normalized to
 * the canonical space-separated path here. Aliases in the registry
 * pick it up cleanly. Per Spec 03's acceptance criterion ("no
 * hyphenated multi-word command names exist") the canonical name is
 * always the space-separated form; legacy hyphen forms are an
 * input-side compatibility convenience.
 *
 * Case-insensitive on the path. Returns null for anything that
 * doesn't start with `!` so non-commands flow past without an extra
 * branch in the dispatcher.
 */

import "server-only";

export interface ParsedCommand {
  /** Canonical path, lower-cased. E.g. `['gs','market','open']` or
   *  `['tokens']`. The dispatcher feeds this into
   *  `resolveCommand(path)` to find the matching CommandDef. */
  path: string[];
  /** Trailing args after the path, trimmed. */
  args: string;
  /** Original raw message for logging. */
  raw: string;
}

/**
 * Parse a chat message into a ParsedCommand or null. Pure — no DB,
 * no network. The dispatcher decides what to do with the result
 * (look up registry, enforce permissions, fire handler).
 */
export function parseCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("!")) return null;

  // Strip leading "!" + split first whitespace.
  const body = trimmed.slice(1);
  const firstSpace = body.search(/\s/);
  const headRaw = firstSpace === -1 ? body : body.slice(0, firstSpace);
  const tail = firstSpace === -1 ? "" : body.slice(firstSpace + 1).trim();

  if (!headRaw) return null; // bare "!"

  const head = headRaw.toLowerCase();

  // Hyphenated head (`gs-market-open`, `gs-shuffle`, `gs-pick-reset`)
  // — split into segments. The registry's alias index catches both
  // hyphen-style and space-style; we normalize to the segment shape
  // here so the dispatcher gets one consistent input.
  const headSegments = head.split("-").filter(Boolean);

  if (headSegments[0] === "gs") {
    // `!gs ...` family.
    //   !gs                   → path: ['gs']
    //   !gs-shuffle           → ['gs','shuffle']
    //   !gs market open 3     → ['gs','market','open'], args: '3'
    //   !gs-market-open       → ['gs','market','open'], aliased via registry
    const path = [...headSegments];
    // Pull leading tail tokens onto the path until we hit something
    // that looks like an arg (number, percent, @user, etc.). For
    // safety we cap path expansion at 4 segments — no real command
    // is deeper, and unbounded scanning would let `!gs market open
    // 100` swallow the "100" as a path segment.
    const tailTokens = tail.length === 0 ? [] : tail.split(/\s+/);
    let consumed = 0;
    while (consumed < tailTokens.length && path.length < 4) {
      const token = tailTokens[consumed];
      if (looksLikeArg(token)) break;
      path.push(token.toLowerCase());
      consumed++;
    }
    const args = tailTokens.slice(consumed).join(" ").trim();
    return { path, args, raw: message };
  }

  // Bare verb. `!tokens`, `!bet`, `!roll 1-100`, `!8ball <question>`.
  // The dispatcher resolves via registry — unknown verbs return
  // `resolveCommand(...) === null` and the dispatcher silently
  // ignores them.
  return {
    path: [head],
    args: tail,
    raw: message,
  };
}

/**
 * Heuristic: should this tail token be treated as an arg rather than
 * extending the path? Numbers, percentages, `all`, `@user`, anything
 * with non-letter chars are args. Pure alphabetic tokens get
 * appended to the path because they might be a subnoun like
 * `!gs market open` (open is appended; the trailing minutes digit
 * is an arg).
 *
 * Edge cases this catches:
 *   - `!gs market open 5`      → 'open' joins path, '5' is arg
 *   - `!gs resolve win`        → 'win' is the resolution value, NOT
 *     a path segment — handled by capping path depth at 4
 *   - `!gs market open all`    → 'all' is parsed as arg
 *
 * If a command needs a free-form alphabetic arg (like
 * `!gs resolve <option>`), the registry registers a 2-segment path
 * `['gs','resolve']` and the parser caps path expansion when no
 * 3-segment `['gs','resolve',<x>]` entry exists — but we don't
 * check the registry here (parse must be pure). Instead, the
 * dispatcher resolves the 3-segment shape FIRST; if it fails, it
 * falls back to the 2-segment shape and treats the extra word as
 * args. That fallback lives in dispatch.ts.
 */
function looksLikeArg(token: string): boolean {
  if (!token) return false;
  if (token.startsWith("@")) return true;
  if (/^\d+%?$/.test(token)) return true;
  if (/^\d+(\.\d+)?%?$/.test(token)) return true;
  if (token.toLowerCase() === "all") return true;
  // Anything containing a non-letter char is also clearly an arg.
  if (/[^a-zA-Z]/.test(token)) return true;
  return false;
}
