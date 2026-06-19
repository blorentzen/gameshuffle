/**
 * Default-commands dispatcher fallback.
 *
 * When the chat dispatcher doesn't find a registry match, this
 * fallback checks the platform catalog (`gs_default_commands`) for
 * an enabled command matching the trigger or any alias. Wired into
 * `dispatch.ts` BEFORE the mention-event fallback — defaults are
 * typically static-or-pool single-verb commands; mention events
 * (with @user args) are second-pass.
 *
 * Resolution at fire time:
 *
 *   1. Catalog lookup by trigger | alias (cached, 15s TTL).
 *   2. Per-community override check — streamer can disable a
 *      default for their community. Absence = use default_enabled.
 *   3. Sub-command routing — `!quote add ...` / `!quote del N`
 *      (mod+ only) writes to / removes from the community-scoped
 *      response pool. Sub-commands are recognized only on pool-
 *      based commands (handler IS NULL).
 *   4. Authority check — `viewer | vip | mod | host` from the
 *      catalog row; `vip` semantics is "VIP-badge OR mod OR host".
 *   5. Cooldown per-user.
 *   6. Execute:
 *        - handler set → run handler, substitute {result} + extras
 *        - pool has enabled entries → weighted pick from
 *          (platform + community) pools, substitute as {result}
 *        - else → post template as-is.
 *   7. Variable substitution (shared shape with events:
 *      {user}, {streamer}, {game}, {to}, {result}, plus handler
 *      extras like {dice}/{sum}).
 *   8. Post to chat.
 *
 * Returns `true` when the fallback handled the message (regardless
 * of success/failure — failures post an error to chat). Returns
 * `false` only when no catalog match exists so the dispatcher can
 * fall through to the next pass (mention events → silent ignore).
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildBaseVars,
  prefetchHeavyVars,
  renderTemplate,
  type TemplateContext,
} from "@/lib/templates/resolver";
import { getDefaultHandler } from "./defaultHandlers";
import { resolveEconomyContext } from "./economy";
import { checkChatAuthority, type ChatAuthority } from "./authority";
import { logSignal } from "@/lib/engagement/signals";
import type { ParsedCommand } from "./parse";
import type { ShuffleContext } from "./shuffle";

type Category = "info" | "fun" | "engagement" | "wholesome" | "game";

interface DefaultCommandRow {
  id: string;
  trigger: string;
  aliases: string[];
  category: Category;
  response_template: string | null;
  handler: string | null;
  description: string;
  default_enabled: boolean;
  enabled: boolean;
  cooldown_seconds: number;
  min_authority: ChatAuthority;
}

interface PoolResponse {
  id: string;
  response: string;
  weight: number;
}

interface DispatchInputs {
  command: ParsedCommand;
  userId: string;
  broadcasterTwitchId: string;
  botTwitchId: string;
  senderTwitchId: string;
  senderDisplayName: string;
  senderLogin: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  isVIP?: boolean;
  overlayToken?: string | null;
}

// ---------------------------------------------------------------------------
// Catalog cache (15s TTL — matches the custom-commands cadence)
// ---------------------------------------------------------------------------

const CATALOG_TTL_MS = 15_000;
let catalogCache: { rows: DefaultCommandRow[]; fetchedAt: number } | null =
  null;

async function loadCatalog(): Promise<DefaultCommandRow[]> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache.rows;
  }
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_commands")
    .select(
      "id, trigger, aliases, category, response_template, handler, description, default_enabled, enabled, cooldown_seconds, min_authority",
    )
    .eq("enabled", true);
  if (error) {
    console.error("[defaultCommands] catalog load failed:", error.message);
    return catalogCache?.rows ?? [];
  }
  const rows = (data as DefaultCommandRow[] | null) ?? [];
  catalogCache = { rows, fetchedAt: Date.now() };
  return rows;
}

function findCommandByTrigger(
  catalog: DefaultCommandRow[],
  trigger: string,
): DefaultCommandRow | null {
  const t = trigger.toLowerCase();
  for (const row of catalog) {
    if (row.trigger === t) return row;
    if (row.aliases.includes(t)) return row;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-command cooldown — keep separate from the registry cooldown
// ledger to avoid key collisions if a registry name ever overlaps
// a default-command trigger.
// ---------------------------------------------------------------------------

const COOLDOWNS = new Map<string, number>();

function checkCooldown(senderTwitchId: string, commandId: string, seconds: number): boolean {
  if (seconds <= 0) return true;
  const key = `${senderTwitchId}:default:${commandId}`;
  const now = Date.now();
  const expiresAt = COOLDOWNS.get(key);
  if (expiresAt && expiresAt > now) return false;
  COOLDOWNS.set(key, now + seconds * 1000);
  return true;
}

// ---------------------------------------------------------------------------
// Sub-command parsing (`add`, `del`)
// ---------------------------------------------------------------------------

type SubCommand =
  | { kind: "add"; payload: string }
  | { kind: "del"; index: number }
  | null;

function parseSubCommand(args: string): SubCommand {
  const trimmed = args.trim();
  if (!trimmed) return null;
  const firstSpace = trimmed.search(/\s/);
  const head = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace))
    .toLowerCase();
  if (head !== "add" && head !== "del") return null;
  const rest =
    firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();
  if (head === "add") {
    return { kind: "add", payload: rest };
  }
  // `del <N>` — 1-based index against the community pool.
  const idx = parseInt(rest, 10);
  if (!Number.isInteger(idx) || idx < 1) return null;
  return { kind: "del", index: idx };
}

// ---------------------------------------------------------------------------
// Pool reads + writes
// ---------------------------------------------------------------------------

async function loadEnabledResponses(
  commandId: string,
  communityId: string,
): Promise<PoolResponse[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .select("id, response, weight, community_id")
    .eq("command_id", commandId)
    .eq("enabled", true)
    // Either platform-default (community_id NULL) OR scoped to this
    // community. Supabase's `.or()` handles the NULL branch via the
    // `is` filter syntax.
    .or(`community_id.is.null,community_id.eq.${communityId}`);
  if (error) {
    console.error("[defaultCommands] pool load failed:", error.message);
    return [];
  }
  return ((data as PoolResponse[] | null) ?? []).map((r) => ({
    id: r.id,
    response: r.response,
    weight: r.weight,
  }));
}

function pickWeighted(pool: PoolResponse[]): PoolResponse {
  const total = pool.reduce((acc, r) => acc + r.weight, 0);
  let pick = Math.random() * total;
  for (const r of pool) {
    pick -= r.weight;
    if (pick <= 0) return r;
  }
  return pool[pool.length - 1];
}

async function loadCommunityPoolIndexed(
  commandId: string,
  communityId: string,
): Promise<{ id: string; index: number; response: string }[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_command_responses")
    .select("id, response, sort_order, created_at")
    .eq("command_id", commandId)
    .eq("community_id", communityId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error(
      "[defaultCommands] community pool load failed:",
      error.message,
    );
    return [];
  }
  return ((data as { id: string; response: string }[] | null) ?? []).map(
    (r, i) => ({
      id: r.id,
      index: i + 1,
      response: r.response,
    }),
  );
}

// ---------------------------------------------------------------------------
// Variable substitution — delegates to the unified resolver
// (@/lib/templates/resolver) so default commands share the SAME
// `{name}` / `$name` language and variable space as custom commands
// and event flavor templates.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main entry — try the catalog, return whether we handled the message.
// ---------------------------------------------------------------------------

export async function tryFireDefaultCommand(
  inputs: DispatchInputs,
): Promise<boolean> {
  if (inputs.command.path.length !== 1) return false;
  const trigger = inputs.command.path[0].toLowerCase();
  if (!trigger) return false;

  const catalog = await loadCatalog();
  const cmd = findCommandByTrigger(catalog, trigger);
  if (!cmd) return false;

  // Resolve economy context (community + caller identity). Required
  // for community override lookups, pool scoping, and sub-command
  // attribution. Identity creation is lazy + cheap.
  const econ = await resolveEconomyContext(toShuffleCtx(inputs));
  if (!econ) {
    console.error("[defaultCommands] resolveEconomyContext returned null");
    return true;
  }

  // Per-community override (enabled/disabled + custom_response). For
  // v1 the streamer-facing UI hasn't shipped yet, so the override
  // table is empty in practice — but the lookup is wired so manual
  // SQL toggles work today.
  const admin = createServiceClient();
  const { data: overrideRow } = await admin
    .from("gs_default_command_overrides")
    .select("enabled, custom_response")
    .eq("community_id", econ.community.id)
    .eq("command_id", cmd.id)
    .maybeSingle();
  const override = overrideRow as
    | { enabled: boolean; custom_response: string | null }
    | null;
  const effectivelyEnabled = override
    ? override.enabled
    : cmd.default_enabled;
  if (!effectivelyEnabled) {
    // Streamer explicitly disabled this default for their community.
    return true; // claimed — silent no-op so it doesn't fall through
  }
  const effectiveTemplate =
    override?.custom_response ?? cmd.response_template;

  // Sub-command routing — only on pool-based commands (handler =
  // null). Mod+ only. Bumps the cooldown only on success so a
  // throttled mod isn't lost forever.
  const sub = parseSubCommand(inputs.command.args);
  if (sub && !cmd.handler) {
    const isModPlus =
      inputs.isBroadcaster || inputs.isModerator;
    if (!isModPlus) {
      // Silent — viewer-tier tried a mod-only sub-command.
      return true;
    }
    if (sub.kind === "add") {
      return await handleAdd(inputs, econ, cmd, sub.payload);
    }
    return await handleDel(inputs, econ, cmd, sub.index);
  }

  // Authority check.
  if (
    !checkChatAuthority(cmd.min_authority, {
      isBroadcaster: inputs.isBroadcaster,
      isModerator: inputs.isModerator,
      isVIP: inputs.isVIP,
    })
  ) {
    return true; // silent — same UX as the registry-path auth gate
  }

  // Cooldown — broadcaster bypasses so the streamer isn't gated by
  // their own per-user clock when testing.
  if (!inputs.isBroadcaster) {
    if (!checkCooldown(inputs.senderTwitchId, cmd.id, cmd.cooldown_seconds)) {
      return true; // silent — same as registry-path
    }
  }

  // Execute. Three branches:
  //   1. handler set → handler computes {result} (+ optional vars)
  //   2. pool has entries → weighted pick → {result}
  //   3. else → post the template as-is
  let resultText: string | null = null;
  const extraVars: Record<string, string> = {};

  if (cmd.handler) {
    const handler = getDefaultHandler(cmd.handler);
    if (!handler) {
      await postChat(
        inputs,
        `🎲 !${cmd.trigger} is misconfigured (unknown handler "${cmd.handler}").`,
      );
      return true;
    }
    const result = handler(inputs.command.args);
    if (!result.ok) {
      await postChat(inputs, result.errorMessage);
      return true;
    }
    resultText = result.result;
    if (result.vars) Object.assign(extraVars, result.vars);
  } else {
    const pool = await loadEnabledResponses(cmd.id, econ.community.id);
    if (pool.length > 0) {
      const picked = pickWeighted(pool);
      resultText = picked.response;
    }
  }

  // Empty template + nothing to substitute = nothing to post.
  if (!effectiveTemplate && resultText === null) {
    console.warn(
      `[defaultCommands] !${cmd.trigger} has no template, no handler, no pool — skipping.`,
    );
    return true;
  }

  // If the template is empty but we have a result, post the result
  // raw — supports pool-only commands where the writer didn't bother
  // with a wrapper template.
  const template = effectiveTemplate ?? "{result}";

  // Compose vars via the unified resolver: shared BASE (user,
  // streamer, game, touser, random, …) + HEAVY (uptime, followage,
  // discord_invite, gamertags) + the default-command-specific
  // `{result}` + any handler extras (e.g. `{dice}` from `!roll`).
  const ctx: TemplateContext = {
    senderDisplayName:
      econ.caller.display_name ?? inputs.senderDisplayName,
    args: inputs.command.args,
    streamerDisplayName: econ.streamerDisplayName,
    activeGameSlug: econ.activeGameSlug,
    userId: inputs.userId,
    broadcasterTwitchId: inputs.broadcasterTwitchId,
    senderTwitchId: inputs.senderTwitchId,
  };
  const heavy = await prefetchHeavyVars(template, ctx);
  // The base resolver already derives `{touser}` from the first
  // @mention in args, so `!compliment @bob` resolves `{to}` and
  // `{touser}` to "bob" without any extra plumbing — surface
  // contributes `{to}` as an alias here for legacy events-style
  // templates that use it.
  const partnerLogin = (() => {
    const m = /^@(\S+)/.exec(inputs.command.args.trim());
    return m?.[1]?.toLowerCase() ?? "";
  })();
  const vars: Record<string, string> = {
    ...buildBaseVars(ctx),
    ...heavy,
    to: partnerLogin,
    result: resultText ?? "",
    ...extraVars,
  };

  await postChat(inputs, renderTemplate(template, vars));
  // Engagement signal — fire-and-forget. Engine-side fireEvent
  // logs its own event_fired separately, so the default-command
  // fallback only logs command_fired (e.g. !hype, !discord, !roll,
  // !quote). Sub-command operations (add/del) already returned
  // earlier and don't log here.
  void logSignal({
    identityId: econ.caller.id,
    communityId: econ.community.id,
    signalType: "command_fired",
    sessionId: econ.activeSessionId,
    streamId: econ.activeStreamId,
    meta: { trigger: cmd.trigger },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Sub-command handlers
// ---------------------------------------------------------------------------

async function handleAdd(
  inputs: DispatchInputs,
  econ: Awaited<ReturnType<typeof resolveEconomyContext>> & object,
  cmd: DefaultCommandRow,
  payload: string,
): Promise<boolean> {
  const trimmed = payload.trim();
  if (!trimmed) {
    await postChat(
      inputs,
      `📝 Usage: !${cmd.trigger} add <text>`,
    );
    return true;
  }
  // Soft cap — Twitch chat has its own 500-char limit but we'd
  // rather refuse early than truncate.
  if (trimmed.length > 400) {
    await postChat(
      inputs,
      `📝 !${cmd.trigger} entries cap at 400 characters.`,
    );
    return true;
  }
  const admin = createServiceClient();
  // Place the new entry at the end of the community's section
  // (sort_order = current max + 1). Failure to compute defaults to 0
  // — order is cosmetic, picks are weighted not ordered.
  const { data: tail } = await admin
    .from("gs_default_command_responses")
    .select("sort_order")
    .eq("command_id", cmd.id)
    .eq("community_id", econ.community.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    (((tail as { sort_order: number } | null)?.sort_order ?? 0) as number) +
    1;
  const { error } = await admin.from("gs_default_command_responses").insert({
    command_id: cmd.id,
    community_id: econ.community.id,
    added_by_identity_id: econ.caller.id,
    response: trimmed,
    weight: 100,
    sort_order: nextOrder,
    enabled: true,
  });
  if (error) {
    console.error("[defaultCommands] add failed:", error.message);
    await postChat(
      inputs,
      `📝 Couldn't save the new !${cmd.trigger} entry — try again?`,
    );
    return true;
  }
  await postChat(
    inputs,
    `📝 Added to !${cmd.trigger} pool. Total entries growing!`,
  );
  return true;
}

async function handleDel(
  inputs: DispatchInputs,
  econ: Awaited<ReturnType<typeof resolveEconomyContext>> & object,
  cmd: DefaultCommandRow,
  index: number,
): Promise<boolean> {
  // 1-based index against the community-scoped pool ONLY — mods
  // can't delete platform-default entries from chat.
  const pool = await loadCommunityPoolIndexed(cmd.id, econ.community.id);
  if (pool.length === 0) {
    await postChat(
      inputs,
      `📝 No community entries to delete on !${cmd.trigger}.`,
    );
    return true;
  }
  if (index > pool.length) {
    await postChat(
      inputs,
      `📝 !${cmd.trigger} del N must be between 1 and ${pool.length}.`,
    );
    return true;
  }
  const target = pool[index - 1];
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_default_command_responses")
    .delete()
    .eq("id", target.id)
    .eq("community_id", econ.community.id); // belt + suspenders
  if (error) {
    console.error("[defaultCommands] del failed:", error.message);
    await postChat(inputs, `📝 Couldn't remove that entry — try again?`);
    return true;
  }
  await postChat(
    inputs,
    `📝 Removed #${index} from !${cmd.trigger}: "${truncate(target.response, 80)}"`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toShuffleCtx(inputs: DispatchInputs): ShuffleContext {
  return {
    userId: inputs.userId,
    broadcasterTwitchId: inputs.broadcasterTwitchId,
    botTwitchId: inputs.botTwitchId,
    senderTwitchId: inputs.senderTwitchId,
    senderDisplayName: inputs.senderDisplayName,
    senderLogin: inputs.senderLogin,
    isBroadcaster: inputs.isBroadcaster,
    overlayToken: inputs.overlayToken ?? null,
  };
}

async function postChat(
  inputs: DispatchInputs,
  message: string,
): Promise<void> {
  await sendChatMessage({
    broadcasterId: inputs.broadcasterTwitchId,
    senderId: inputs.botTwitchId,
    message,
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
