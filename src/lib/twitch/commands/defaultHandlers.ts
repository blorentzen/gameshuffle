/**
 * Built-in dynamic handlers for default commands.
 *
 * Default commands (`gs_default_commands`) come in three flavors:
 *
 *   - Static template     — `response_template` only, no handler.
 *                           Engine substitutes vars and posts.
 *   - Random pool         — pool entries (`gs_default_command_responses`)
 *                           drive a weighted pick that becomes
 *                           `{result}`; engine substitutes + posts.
 *                           No handler needed (8ball, coinflip).
 *   - Handler             — for results that genuinely need code:
 *                           argument parsing, math, RNG over an
 *                           unbounded range, etc. Lives here.
 *
 * Each handler is a PURE function — no DB, no chat I/O, no async.
 * Takes the raw args string the chat dispatcher captured, returns
 * either a `{ ok: true, result }` with the value to substitute into
 * `{result}` (and optionally additional vars) OR a `{ ok: false }`
 * with an error message the dispatcher posts as-is.
 *
 * Adding a handler:
 *   1. Implement the function below.
 *   2. Register it in `DEFAULT_HANDLERS`.
 *   3. Reference the registered name from the `handler` column on
 *      the catalog row (e.g. `handler='roll'`).
 *
 * When the dispatcher fallback for default commands lands, it'll
 * look up `DEFAULT_HANDLERS[command.handler]` and call it. Until
 * then, this module is a unit-testable spec for the behavior.
 */

import "server-only";

export interface HandlerOk {
  ok: true;
  /** Substituted into `{result}` in the parent command's template. */
  result: string;
  /** Extra `{name}` substitutions a handler can contribute. Merged
   *  on top of the shared variable map (user, streamer, etc.) so a
   *  handler can override but not silently break it. */
  vars?: Record<string, string>;
}

export interface HandlerError {
  ok: false;
  /** Posted directly to chat — the dispatcher won't run template
   *  substitution. Phrase as a friendly correction. */
  errorMessage: string;
}

export type DefaultHandler = (args: string) => HandlerOk | HandlerError;

// ---------------------------------------------------------------------------
// roll — dice
// ---------------------------------------------------------------------------

/** Hard caps that keep the chat output sane. 100 dice × 1000 sides
 *  is well past any TTRPG need; beyond it the joke wears thin and
 *  chat starts wrapping awkwardly. */
const ROLL_MAX_DICE = 100;
const ROLL_MAX_SIDES = 1000;

/**
 * Three call patterns supported:
 *
 *   !roll          → 1d6 (no args defaults to a six-sider)
 *   !roll 20       → 1d20 (bare number = single die of that size)
 *   !roll 2d20     → 2d20 (canonical NdM notation)
 *
 * The bare-number form is the easy-mode entry point — chatters who
 * don't know dice notation can still ask for "a 1-to-20 roll" with
 * `!roll 20`. NdM stays available for TTRPG folks who want multi-
 * die rolls.
 *
 * Result format:
 *   - Single die: just the value (e.g. `14`)
 *   - Multi-die:  bracketed list + sum (e.g. `[7, 12] = 19`)
 */
export const rollHandler: DefaultHandler = (args) => {
  const trimmed = args.trim();
  let count = 1;
  let sides = 6;

  if (trimmed.length > 0) {
    const ndm = trimmed.match(/^(\d+)?d(\d+)$/i);
    const bare = trimmed.match(/^(\d+)$/);
    if (ndm) {
      count = ndm[1] ? parseInt(ndm[1], 10) : 1;
      sides = parseInt(ndm[2], 10);
    } else if (bare) {
      count = 1;
      sides = parseInt(bare[1], 10);
    } else {
      return {
        ok: false,
        errorMessage:
          "Usage: !roll, !roll <sides>, or !roll <count>d<sides> — e.g. !roll, !roll 20, !roll 2d6.",
      };
    }
  }

  if (!Number.isInteger(count) || count < 1 || count > ROLL_MAX_DICE) {
    return {
      ok: false,
      errorMessage: `Dice count must be between 1 and ${ROLL_MAX_DICE}.`,
    };
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > ROLL_MAX_SIDES) {
    return {
      ok: false,
      errorMessage: `Die sides must be between 2 and ${ROLL_MAX_SIDES}.`,
    };
  }

  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(1 + Math.floor(Math.random() * sides));
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  const result =
    count === 1 ? `${rolls[0]}` : `[${rolls.join(", ")}] = ${sum}`;

  return {
    ok: true,
    result,
    vars: {
      // Extra context handlers can opt into without taking over the
      // headline `{result}` slot. Templates that want the dice
      // notation can use `{dice}`; sum is `{sum}`.
      dice: `${count}d${sides}`,
      sum: String(sum),
    },
  };
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const DEFAULT_HANDLERS: Record<string, DefaultHandler> = {
  roll: rollHandler,
};

/** Lookup helper — returns null when the handler name isn't
 *  registered, so the dispatcher can fall through to "no result"
 *  rather than crashing. */
export function getDefaultHandler(name: string | null): DefaultHandler | null {
  if (!name) return null;
  return DEFAULT_HANDLERS[name.toLowerCase()] ?? null;
}
