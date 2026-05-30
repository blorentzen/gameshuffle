/**
 * Command registry — Spec 03 §1.
 *
 * Every chat / tactile command lives in one place. The registry is
 * the only source the dispatcher consults; help renders directly off
 * the metadata; the custom-command engine registers and unregisters
 * via the same API.
 *
 * Two registration shapes the parser produces:
 *
 *   - bare verb path  →  `['tokens']`, `['bet']`, `['roll']`
 *   - `!gs <noun> [subnoun]` path  →  `['gs','market','open']`,
 *                                     `['gs','help']`, `['gs','live']`
 *
 * Aliases let legacy hyphenated forms (`!gs-market-open`) keep working
 * while the canonical name stays clean. Aliases are recorded but the
 * canonical `name` is what handlers, help, and observability use.
 *
 * Per Spec 03 acceptance: "Router dispatches both `!gs ...` and bare
 * commands via one registration mechanism; no hyphenated multi-word
 * command names exist."
 */

import "server-only";

// ---------------------------------------------------------------------------
// Permission tiers
// ---------------------------------------------------------------------------

/**
 * Caller's role relative to this community / session. Matches Spec 03
 * §1:
 *   - everyone — any chatter
 *   - player   — joined the lobby (session participant)
 *   - crew     — Twitch mod OR community-designated crew (post-v1 mods)
 *   - host     — community owner (the streamer, today)
 *
 * Dispatcher resolves the caller's tier at the call site by examining
 * isBroadcaster / isModerator / session participation.
 */
export type ActorTier = "everyone" | "player" | "crew" | "host";

const TIER_RANK: Record<ActorTier, number> = {
  everyone: 0,
  player: 1,
  crew: 2,
  host: 3,
};

/** True when the caller's tier meets or exceeds the command's required
 *  tier. Strictly upward — host can run everything; everyone can only
 *  run everyone commands. */
export function tierMeets(callerTier: ActorTier, required: ActorTier): boolean {
  return TIER_RANK[callerTier] >= TIER_RANK[required];
}

// ---------------------------------------------------------------------------
// CommandDef
// ---------------------------------------------------------------------------

/** Surfaces the command is reachable from. `'chat'` = Twitch chat
 *  message; `'tactile'` = web /live tactile click. */
export type Surface = "chat" | "tactile";

/** Compliance class per Spec 07 §3. Drives the region gate that
 *  runs ahead of actor/permission/cooldown checks.
 *
 *  - `prediction_pool` — pool-shaped wager (markets, bounties)
 *    where restricted-region viewers fall back to spectator mode
 *  - `casino_style`    — dormant; no modules map to it (casino
 *    games were cut May 2026), but the class is retained so the
 *    mechanism is in place if a future module ever lands here
 *  - `none`            — closed-loop, no wager — bypasses the gate
 */
export type ComplianceClass = "prediction_pool" | "casino_style" | "none";

/** Economic intent classifier — surfaced in help + analytics so we
 *  can quickly see which commands touch tokens. */
export type EconomyClass =
  | "none"
  | "read"
  | "earn"
  | "spend"
  | "transfer"
  | "wager";

export interface CommandHelp {
  /** Short one-line summary shown in the `!help` list. */
  summary: string;
  /** Usage signature, e.g. `!bet <option> <amount>`. */
  usage: string;
  /** Long-form detail rendered by `!help <topic>`. Optional — falls
   *  back to summary + usage when absent. */
  detail?: string;
}

/** Context handed to every handler. The dispatcher constructs it by
 *  composing the caller's chat-side context with the lazily-resolved
 *  economy context (community, stream, identities) so handlers don't
 *  each repeat the boilerplate. */
export interface CmdContext {
  // ---- Caller ----------------------------------------------------------
  /** GS owner user id (streamer's auth.users.id) — required for chat
   *  routing back through the broadcaster's channel. */
  userId: string;
  broadcasterTwitchId: string;
  /** The shared bot user id used to post chat. */
  botTwitchId: string;
  senderTwitchId: string;
  senderDisplayName: string;
  /** GS login of the sender — used for chat-message attribution. */
  senderLogin: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  /** Resolved actor tier for the caller in this community + session.
   *  Computed by the dispatcher; handlers can re-check or trust. */
  callerTier: ActorTier;

  // ---- Command payload ------------------------------------------------
  /** Canonical path of the command, e.g. `['gs','market','open']`. */
  path: ReadonlyArray<string>;
  /** Trailing args after the path, trimmed. Pass to `parseArgs` from
   *  ./argParser.ts when the command takes a user / amount. */
  args: string;
  /** Raw chat message for logging. */
  raw: string;
  /** True when the call arrived via `!gs help` and we're rendering
   *  the help for THIS command. Helps a few commands customize
   *  their detail vs summary surface. */
  isHelpInvocation?: boolean;

  // ---- Streamer-scoped extras passed through from the webhook ---------
  /** Streamer's overlay token — powers /lobby/[token] URLs. Optional
   *  because non-chat-routed callers (test harness) won't have it. */
  overlayToken?: string | null;
  /** Streamer's canonical slug (`users.username` || `twitch_login`).
   *  Used by community lookups + the `!gs live` link generator. */
  streamerSlug?: string | null;
  /** Compliance decision for THIS dispatch — resolved upstream by
   *  the dispatcher when the command's `complianceClass` is anything
   *  other than `"none"`. Handlers read this to branch between full
   *  participation (stake/escrow) and spectator participation (pick
   *  only, no stake). Defaults to `"full"` when the gate doesn't
   *  apply (e.g. `complianceClass === "none"`). */
  complianceBehavior?: "full" | "spectator" | "unavailable";
}

/** Handlers return this. `ok` is used by the dispatcher only for the
 *  cooldown bookkeeping — chat output is the handler's job. */
export interface CmdResult {
  ok: boolean;
  /** Optional reason for telemetry on `ok: false`. */
  reason?: string;
}

export interface CommandDef {
  /** Canonical name — the path joined with `.`. E.g. `'tokens'`,
   *  `'gs.market.open'`, `'gs.help'`. Must be unique within the
   *  registry. */
  name: string;
  /** Canonical trigger as a path array. `['tokens']` for bare verbs,
   *  `['gs','market','open']` for namespaced commands. */
  trigger: ReadonlyArray<string>;
  /** Optional legacy trigger forms accepted at parse time but never
   *  surfaced in help. Useful for the M1 → M2 hyphen migration:
   *  register the canonical `['gs','market','open']` with
   *  `aliases: [['gs-market-open']]` so `!gs-market-open` still works. */
  aliases?: ReadonlyArray<ReadonlyArray<string>>;
  actor: ActorTier;
  surface: ReadonlyArray<Surface>;
  economy: EconomyClass;
  /** Compliance class for the region gate (Spec 07). Defaults to
   *  `none` — closed-loop, no wager — for commands that don't
   *  touch the pool/casino surfaces. Mark markets and bounties
   *  `prediction_pool`; nothing maps to `casino_style` today. */
  complianceClass?: ComplianceClass;
  /** Owning module per Spec 06. The dispatcher's enablement gate
   *  consults `gs_community_modules.enabled` for this key before
   *  the actor check. Commands without a `moduleKey` (core / help)
   *  bypass the gate. */
  moduleKey?: string;
  /** Per-user cooldown in seconds. Enforced by the dispatcher. */
  cooldownSeconds?: number;
  /** True when the command requires the broadcast to be live (gs_streams
   *  status='open'). Open-market + resolve are the obvious ones. */
  liveOnly?: boolean;
  /** Help category surfaced by `!help` (e.g. 'tokens', 'markets',
   *  'games', 'social', 'lifecycle'). Drives the category list. */
  category?: string;
  help: CommandHelp;
  handler: (ctx: CmdContext) => Promise<CmdResult>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, CommandDef>();
const TRIGGER_INDEX = new Map<string, string>(); // serialized trigger path → name

function pathKey(path: ReadonlyArray<string>): string {
  return path.map((seg) => seg.toLowerCase()).join(".");
}

/**
 * Register a command. Idempotent on canonical name — re-registering
 * replaces the existing entry, which lets hot-reload in dev work
 * cleanly. Throws if the trigger path collides with a different
 * already-registered command.
 */
export function registerCommand(def: CommandDef): void {
  REGISTRY.set(def.name, def);

  const canonical = pathKey(def.trigger);
  const existing = TRIGGER_INDEX.get(canonical);
  if (existing && existing !== def.name) {
    throw new Error(
      `command trigger collision: "${canonical}" is registered for ${existing}, can't re-bind to ${def.name}`,
    );
  }
  TRIGGER_INDEX.set(canonical, def.name);

  for (const alias of def.aliases ?? []) {
    const aliasKey = pathKey(alias);
    const existingAlias = TRIGGER_INDEX.get(aliasKey);
    if (existingAlias && existingAlias !== def.name) {
      throw new Error(
        `command alias collision: "${aliasKey}" is registered for ${existingAlias}, can't re-bind to ${def.name}`,
      );
    }
    TRIGGER_INDEX.set(aliasKey, def.name);
  }
}

/** Resolve a parsed path to a registered command. Returns null when
 *  no canonical or alias path matches. */
export function resolveCommand(
  path: ReadonlyArray<string>,
): CommandDef | null {
  const name = TRIGGER_INDEX.get(pathKey(path));
  if (!name) return null;
  return REGISTRY.get(name) ?? null;
}

/** All registered commands, in registration order. Iteration order
 *  doubles as the default help ordering. */
export function listCommands(): CommandDef[] {
  return Array.from(REGISTRY.values());
}

/** Drop a command — used by the custom-command engine when a streamer
 *  removes a custom trigger. Cleans up both trigger and alias keys. */
export function unregisterCommand(name: string): void {
  const def = REGISTRY.get(name);
  if (!def) return;
  REGISTRY.delete(name);
  TRIGGER_INDEX.delete(pathKey(def.trigger));
  for (const alias of def.aliases ?? []) {
    TRIGGER_INDEX.delete(pathKey(alias));
  }
}
