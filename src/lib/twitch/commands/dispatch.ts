/**
 * Registry-driven command dispatcher — Spec 03 §1.
 *
 * The dispatcher's only job is:
 *
 *   1. Resolve the parsed path against the registry, including
 *      fallback when the deepest path doesn't match (trailing alpha
 *      segment is treated as args, e.g. `!gs resolve win` →
 *      `['gs','resolve']` + args `'win'`).
 *   2. Compute the caller's actor tier.
 *   3. Enforce actor / liveOnly / cooldown.
 *   4. Build the CmdContext and call the handler.
 *
 * Each command's behavior lives in its CommandDef. Registering a new
 * command is a one-call surface (`registerCommand({ ... })`) and the
 * dispatcher picks it up without any further wiring.
 *
 * Custom commands (`gs_custom_commands`) register themselves into the
 * same registry via `loadCustomCommandsForCommunity` so they route
 * through identical permission + cooldown logic as built-ins.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { getCommunityBySlug } from "@/lib/economy/community";
import { getActiveStreamForCommunity } from "@/lib/economy/streams";
import { getIdentityByPlatform } from "@/lib/economy/identity";
import {
  checkCompliance,
  type ComplianceBehavior,
} from "@/lib/economy/compliance/gate";
import { resolveRegionForIdentity } from "@/lib/economy/compliance/region";
import { isModuleEnabled } from "@/lib/economy/modules/registry";
import {
  authorityMeets,
  listCommands,
  resolveCommand,
  tierMeets,
  type ActorTier,
  type Authority,
  type CmdContext,
  type CommandDef,
} from "./registry";
import { loadCustomCommandsForCommunity } from "./customCommands";
import type { ParsedCommand } from "./parse";

// Side-effect import: builds the registry on module load.
import "./registrations";

// Boot-time diagnostic: print the registered command set so we can
// confirm the registry actually populated before any chat traffic.
console.log(
  `[dispatch] registry loaded with ${listCommands().length} commands:`,
  listCommands().map((c) => c.name).join(", "),
);

export interface CommandDispatchContext {
  /** GS owner user id (streamer's auth.users.id). */
  userId: string;
  /** Broadcaster's Twitch user id. */
  broadcasterTwitchId: string;
  /** Shared GS bot user id. */
  botTwitchId: string;
  senderTwitchId: string;
  senderLogin: string;
  senderDisplayName: string;
  /** True when the sender holds the broadcaster badge. */
  isBroadcaster: boolean;
  /** True when the sender holds the moderator badge OR is the broadcaster. */
  isModerator: boolean;
  /** Spec 01 §3 — VIP is a parallel boolean axis. Captured by the
   *  webhook from the chat-event badges. Optional in the type so
   *  legacy callers / test harnesses without VIP context still
   *  work; the dispatcher coerces `undefined → false`. */
  isVIP?: boolean;
  /** Streamer's overlay token — propagated for !lobby / !lobby-link
   *  style commands that need to render a /lobby/[token] URL. */
  overlayToken?: string | null;
  /** Streamer's canonical slug. Used for community lookups when a
   *  command needs to query the streamer's gs_communities row
   *  without a chat-side resolve. */
  streamerSlug?: string | null;
}

// ---------------------------------------------------------------------------
// Cooldown bookkeeping
// ---------------------------------------------------------------------------

/**
 * Per-user, per-command cooldown ledger. In-memory: a cold start
 * resets all cooldowns, which is acceptable since the cooldown is
 * an anti-spam UX, not a security boundary. Spec accepts that.
 *
 * Key: `${senderTwitchId}:${commandName}`.
 */
const COOLDOWNS = new Map<string, number>();

function checkCooldown(
  senderTwitchId: string,
  commandName: string,
  seconds: number,
): boolean {
  const key = `${senderTwitchId}:${commandName}`;
  const now = Date.now();
  const expiresAt = COOLDOWNS.get(key);
  if (expiresAt && expiresAt > now) return false;
  COOLDOWNS.set(key, now + seconds * 1000);
  return true;
}

// ---------------------------------------------------------------------------
// Actor tier resolution
// ---------------------------------------------------------------------------

/**
 * Derive the caller's actor tier. v1 mapping:
 *   - host      → isBroadcaster
 *   - crew      → isModerator (excluding broadcaster, which is already host)
 *   - player    → currently same as everyone in M2; tightened later when
 *                 session-participation gating ships
 *   - everyone  → fallback
 *
 * Future revision: 'player' will check session_participants membership.
 * For now player commands accept everyone, matching the existing
 * `!gs-join`/`!gs-shuffle` chat-facing behavior.
 */
function resolveCallerTier(ctx: CommandDispatchContext): ActorTier {
  if (ctx.isBroadcaster) return "host";
  if (ctx.isModerator) return "crew";
  return "everyone";
}

/**
 * Spec 01 §3 — authority axis. Strict ladder: `viewer < mod < host`.
 * VIP is NOT a position here; it's a parallel boolean (see
 * `ctx.isVIP`). A user can be VIP and mod simultaneously, or VIP
 * and viewer; the two-axis gate handles both without ranking VIP
 * against mod / host.
 */
function resolveCallerAuthority(ctx: CommandDispatchContext): Authority {
  if (ctx.isBroadcaster) return "host";
  if (ctx.isModerator) return "mod";
  return "viewer";
}

/**
 * Bridge: derive a command's `minAuthority` from the legacy `actor`
 * field during the Spec 01 backfill window. Once every registration
 * carries `minAuthority` explicitly, this fallback can be removed.
 *
 *   actor       →  minAuthority
 *   everyone    →  viewer
 *   player      →  viewer   (was "any viewer in a session" — collapses
 *                            into viewer here; per-handler session
 *                            checks survive untouched)
 *   crew        →  mod
 *   host        →  host
 */
function legacyActorToAuthority(actor: ActorTier): Authority {
  if (actor === "host") return "host";
  if (actor === "crew") return "mod";
  return "viewer";
}

/**
 * Spec 01 §3 — the two-axis gate. Returns true when the caller
 * meets BOTH the command's `minAuthority` floor AND its `vipOnly`
 * requirement. The two checks are independent on purpose — VIP is
 * a flag, not a ladder position.
 *
 *   authorityOK = callerAuthority >= command.minAuthority
 *   vipOK       = command.vipOnly === false  ||  isVIP === true
 *   granted     = authorityOK && vipOK
 */
function commandGateGranted(
  def: CommandDef,
  callerAuthority: Authority,
  isVIP: boolean,
): boolean {
  const required: Authority =
    def.minAuthority ??
    (def.actor ? legacyActorToAuthority(def.actor) : "viewer");
  const authorityOK = authorityMeets(callerAuthority, required);
  const vipOK = def.vipOnly !== true || isVIP === true;
  return authorityOK && vipOK;
}

// ---------------------------------------------------------------------------
// liveOnly gate
// ---------------------------------------------------------------------------

/**
 * True when the streamer's broadcast is "live enough" for liveOnly
 * commands. M1 introduced gs_streams; here we check status='open'
 * for the streamer's community. Best-effort: if no community is
 * known we conservatively allow the call (the underlying handler
 * will reject if it actually needs live data).
 */
async function isStreamLive(ctx: CommandDispatchContext): Promise<boolean> {
  if (!ctx.streamerSlug) return true;
  try {
    const community = await getCommunityBySlug(ctx.streamerSlug);
    if (!community) return true;
    const stream = await getActiveStreamForCommunity(community.id);
    return stream?.status === "open";
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Compliance gate (Spec 07)
// ---------------------------------------------------------------------------

/**
 * Resolve the compliance behavior for a chat-side caller. Skips
 * host/crew tiers (they're operators, not economic participants) and
 * skips commands with `complianceClass !== "prediction_pool" |
 * "casino_style"`.
 *
 * Chat-side region detection: we don't have a request locale or IP
 * header, so the only signal is the caller's linked GS account
 * (`gs_identities.gs_account_id` → Supabase auth → identity_data
 * locale). Tier 0 chatters (no linked account) resolve to unknown
 * region → default-deny per Spec 07 §6 (spectator for
 * prediction_pool, unavailable for casino_style).
 */
async function resolveChatCompliance(args: {
  senderTwitchId: string;
  complianceClass: "prediction_pool" | "casino_style";
}): Promise<ComplianceBehavior> {
  try {
    const identity = await getIdentityByPlatform("twitch", args.senderTwitchId);
    const region = await resolveRegionForIdentity(
      identity?.gs_account_id ?? null,
    );
    const decision = await checkCompliance({
      region: region.region,
      complianceClass: args.complianceClass,
    });
    return decision.behavior;
  } catch (err) {
    // Fail safe on any lookup error — match the "unknown region"
    // default per Spec 07 §6.
    console.error("[dispatch] compliance resolution failed", err);
    return args.complianceClass === "casino_style" ? "unavailable" : "spectator";
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function dispatchCommand(
  command: ParsedCommand,
  ctx: CommandDispatchContext,
): Promise<void> {
  // 0. Refresh this community's custom commands into the registry
  //    so a freshly-added `!socials` shows up within the 15s TTL.
  //    Best-effort: a load failure shouldn't block built-in routing.
  if (ctx.streamerSlug) {
    try {
      const community = await getCommunityBySlug(ctx.streamerSlug);
      if (community) {
        await loadCustomCommandsForCommunity(community.id);
      }
    } catch (err) {
      console.error("[dispatch] custom-command load failed", err);
    }
  }

  // 1. Resolve against the registry. If the deepest path doesn't
  //    match, try progressively shorter paths — trailing alpha
  //    segments fall back to args so `!gs resolve win` lands on
  //    `['gs','resolve']` with args `'win'`, and `!gs market`
  //    (which has no command registered for the 2-segment form)
  //    can still hit the future help for the 'market' namespace.
  const path = [...command.path];
  let args = command.args;
  let def = resolveCommand(path);

  // Diagnostic: log resolution attempts so we can see why commands
  // fall through to the bare `gs` handler.
  console.log(
    `[dispatch] raw=${JSON.stringify(command.raw)} path=${JSON.stringify(command.path)} firstResolve=${def?.name ?? "(null)"}`,
  );

  while (!def && path.length > 1) {
    const popped = path.pop()!;
    args = args.length === 0 ? popped : `${popped} ${args}`;
    def = resolveCommand(path);
    console.log(
      `[dispatch] pop fallback path=${JSON.stringify(path)} resolve=${def?.name ?? "(null)"}`,
    );
  }

  if (!def) {
    console.log("[dispatch] no command matched, silent ignore");
    return; // silent ignore — unknown command
  }
  console.log(`[dispatch] matched ${def.name}`);

  // 2. Module enablement gate (Spec 06 §3). Streamers can disable
  //    modules per-community; disabled modules behave as if the
  //    command doesn't exist. Sits AFTER command resolution so we
  //    only pay the DB lookup for commands the streamer recognizes;
  //    sits BEFORE actor + compliance + cooldown checks so a
  //    disabled module silently no-ops without further work.
  //    Core commands (gs / gs.help / gs.live / shuffle / etc.) have
  //    no `moduleKey` — they bypass this gate.
  if (def.moduleKey && ctx.streamerSlug) {
    try {
      const community = await getCommunityBySlug(ctx.streamerSlug);
      if (community) {
        const enabled = await isModuleEnabled(community.id, def.moduleKey);
        if (!enabled) return; // silent no-op
      }
    } catch (err) {
      console.error("[dispatch] module-enabled check failed", err);
      // Fail open — better to risk firing a disabled module than to
      // block every command on a transient DB error.
    }
  }

  // 3. Two-axis role gate per Spec 01 §3. Authority (ordered ladder:
  //    viewer < mod < host) and VIP (parallel boolean) are checked
  //    independently — a user can be VIP and mod, or VIP and viewer,
  //    without VIP needing a ladder position.
  //
  //    Backward-compat: the legacy single-axis `tierMeets(actor)`
  //    check runs in PARALLEL with the new gate during the Spec 01
  //    backfill window. Both must pass. Once every registration
  //    carries `minAuthority`, the legacy branch can be removed.
  const callerTier = resolveCallerTier(ctx);
  const callerAuthority = resolveCallerAuthority(ctx);
  const isVIP = ctx.isVIP === true;
  if (def.actor && !tierMeets(callerTier, def.actor)) {
    return; // silent — keeps chat clean from mistargeted commands
  }
  if (!commandGateGranted(def, callerAuthority, isVIP)) {
    return; // silent — same UX as the legacy actor check
  }

  // 3.5. Compliance gate (Spec 07). Runs for viewer-tier callers on
  //      commands tagged with a pool/casino class. Streamers (host)
  //      and mods (crew) are operators per Spec 05 — they administer
  //      markets regardless of their own region. Casino_style is
  //      dormant but the branch is in place for future revisits.
  let complianceBehavior: "full" | "spectator" | "unavailable" = "full";
  if (
    (def.complianceClass === "prediction_pool" ||
      def.complianceClass === "casino_style") &&
    (callerTier === "everyone" || callerTier === "player")
  ) {
    complianceBehavior = await resolveChatCompliance({
      senderTwitchId: ctx.senderTwitchId,
      complianceClass: def.complianceClass,
    });
    if (complianceBehavior === "unavailable") {
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: `🎲 @${ctx.senderDisplayName}, this feature isn't available in your region.`,
      });
      return;
    }
  }

  // 3. liveOnly check.
  if (def.liveOnly) {
    const live = await isStreamLive(ctx);
    if (!live) {
      // Single short rejection — host needs to know why their
      // !gs market open ignored them.
      await sendChatMessage({
        broadcasterId: ctx.broadcasterTwitchId,
        senderId: ctx.botTwitchId,
        message: `🎲 ${formatPathForChat(def.trigger)} needs the stream live.`,
      });
      return;
    }
  }

  // 4. Cooldown — host bypasses so the streamer isn't gated by
  //    their own per-user clock when testing.
  if (def.cooldownSeconds && callerTier !== "host") {
    if (!checkCooldown(ctx.senderTwitchId, def.name, def.cooldownSeconds)) {
      return; // silent
    }
  }

  // 5. Build CmdContext + fire.
  const cmd: CmdContext = {
    userId: ctx.userId,
    broadcasterTwitchId: ctx.broadcasterTwitchId,
    botTwitchId: ctx.botTwitchId,
    senderTwitchId: ctx.senderTwitchId,
    senderDisplayName: ctx.senderDisplayName,
    senderLogin: ctx.senderLogin,
    isBroadcaster: ctx.isBroadcaster,
    isModerator: ctx.isModerator,
    isVIP,
    callerTier,
    callerAuthority,
    path: def.trigger, // canonical, not the matched alias
    args,
    raw: command.raw,
    overlayToken: ctx.overlayToken ?? null,
    streamerSlug: ctx.streamerSlug ?? null,
    complianceBehavior,
  };

  try {
    await def.handler(cmd);
  } catch (err) {
    console.error(`[dispatch] handler "${def.name}" threw`, err);
  }
}

/** Pretty-print a path for chat error messages: `['gs','market','open']`
 *  → `'!gs market open'`. Used in liveOnly rejection. */
function formatPathForChat(path: ReadonlyArray<string>): string {
  return `!${path.join(" ")}`;
}
