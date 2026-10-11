/**
 * Custom commands engine — Spec 03 §2.1.
 *
 * Streamers author per-community static-response commands via:
 *
 *   !commands add !socials Follow me at https://...
 *   !commands edit !socials Catch me at https://...
 *   !commands delete !socials
 *   !commands list
 *
 * Each channel's rows live in their own in-memory table (not the shared
 * built-in registry): the dispatcher loads (or refreshes) a community's
 * rows on its first chat command and looks them up with
 * `resolveCustomCommand(communityId, path)`. Until 2026-10-10 they went
 * into the process-wide trigger index, so two channels with `!socials`
 * could answer with each other's reply and the second failed to load.
 * Built-ins win over a custom command with the same trigger. Canonical
 * names stay `cc:<community_id>:<trigger>` (cooldowns key on them).
 *
 * Template variables resolved at render time:
 *   $user    — caller display name
 *   $touser  — first @user arg, defaults to caller
 *   $random  — uniform [0, 100)
 *   $count   — incrementing usage counter (persisted)
 *   $uptime  — TODO: requires Helix streams.live → "(coming soon)"
 *   $followage / $accountage — TODO Helix lookups → "(coming soon)"
 *
 * The Helix-backed variables ship as placeholders in M2 so the
 * grammar is locked but the wire-up can happen incrementally.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendChatMessage } from "@/lib/twitch/client";
import { getCommunityBySlug } from "@/lib/economy/community";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import {
  buildBaseVars,
  prefetchHeavyVars,
  renderTemplate as renderUnifiedTemplate,
  type TemplateContext,
} from "@/lib/templates/resolver";
import type { ActorTier, CmdContext, CommandDef } from "./registry";

// ---------------------------------------------------------------------------
// Types + persistence
// ---------------------------------------------------------------------------

export interface CustomCommandRow {
  id: string;
  community_id: string;
  trigger: string;
  response_tmpl: string;
  actor: ActorTier;
  cooldown_s: number;
  enabled: boolean;
  use_count: number;
}

const COMMUNITY_LOAD_CACHE = new Map<string, number>(); // community_id → ms
/** community_id → trigger (no "!", lowercase) → its command. One table per channel. */
const COMMUNITY_COMMANDS = new Map<string, Map<string, CommandDef>>();

/** This channel's custom command for a typed path (custom triggers are one word). */
export function resolveCustomCommand(communityId: string, path: ReadonlyArray<string>): CommandDef | null {
  if (path.length !== 1) return null;
  return COMMUNITY_COMMANDS.get(communityId)?.get(path[0].toLowerCase()) ?? null;
}

function forgetCustomCommand(communityId: string, trigger: string): void {
  COMMUNITY_COMMANDS.get(communityId)?.delete(trigger.replace(/^!/, "").toLowerCase());
}
const CACHE_TTL_MS = 15_000;

function canonicalName(communityId: string, trigger: string): string {
  return `cc:${communityId}:${trigger.toLowerCase()}`;
}

function pathForTrigger(trigger: string): string[] {
  // Custom commands are always bare verbs — `!foo`. Strip the bang
  // and lowercase. Multi-word triggers are not supported in Tier 1
  // (M2): a streamer writing `!commands add !foo bar baz` registers
  // `!foo` with response "bar baz".
  return [trigger.replace(/^!/, "").toLowerCase()];
}

/** Fetch every enabled custom command row for a community. */
async function listForCommunity(
  communityId: string,
): Promise<CustomCommandRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_custom_commands")
    .select("id, community_id, trigger, response_tmpl, actor, cooldown_s, enabled, use_count")
    .eq("community_id", communityId)
    .eq("enabled", true);
  return ((data as CustomCommandRow[] | null) ?? []) as CustomCommandRow[];
}

// ---------------------------------------------------------------------------
// Registry sync
// ---------------------------------------------------------------------------

/**
 * Idempotent: re-loading a community rebuilds its own table from the
 * enabled rows, so deleted or switched-off commands drop out. The
 * dispatcher calls this with a short TTL so a fresh `!commands add`
 * shows up within ~15s. Other communities' tables are never touched.
 */
export async function loadCustomCommandsForCommunity(
  communityId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const lastLoad = COMMUNITY_LOAD_CACHE.get(communityId) ?? 0;
  if (!options.force && Date.now() - lastLoad < CACHE_TTL_MS) return;
  COMMUNITY_LOAD_CACHE.set(communityId, Date.now());

  setCustomCommandTable(communityId, await listForCommunity(communityId));
}

/** Build and install one channel's table from its enabled rows (exported for tests). */
export function setCustomCommandTable(communityId: string, rows: CustomCommandRow[]): void {
  const next = new Map<string, CommandDef>();
  for (const row of rows) {
    const name = canonicalName(row.community_id, row.trigger);
    // Spec 01 §4 + §10 — custom commands auto-tag into the
    // `community` family with `communityType: "info"` by default
    // (most custom commands are link/response payloads — info-shaped).
    // The streamer can flip the sub-type once the configure surface
    // exposes it; until then, the default is correct for the majority.
    // Authority axis: map the row's legacy `actor` enum into the new
    // `minAuthority` ladder so the two-axis gate runs uniformly.
    const customMinAuthority =
      row.actor === "host"
        ? "host"
        : row.actor === "crew"
          ? "mod"
          : "viewer";
    const trigger = pathForTrigger(row.trigger);
    next.set(trigger[0], {
      name,
      trigger,
      actor: row.actor,
      surface: ["chat"],
      economy: "none",
      cooldownSeconds: row.cooldown_s,
      category: "custom",
      family: "community",
      minAuthority: customMinAuthority,
      vipOnly: false,
      communityType: "info",
      help: {
        summary: `Custom: ${row.response_tmpl.slice(0, 60)}`,
        usage: `!${row.trigger.replace(/^!/, "")}`,
      },
      handler: async (cmd) => {
        const message = await renderTemplate(row, cmd);
        await sendChatMessage({
          broadcasterId: cmd.broadcasterTwitchId,
          senderId: cmd.botTwitchId,
          message,
        });
        await incrementUseCount(row.id);
        return { ok: true };
      },
    });
  }
  // Replace the whole table, so disabled / deleted rows drop out.
  COMMUNITY_COMMANDS.set(communityId, next);
}

/** Force-refresh on the next dispatcher tick. Called after a
 *  successful `!commands add/edit/delete` so the new trigger is
 *  immediately routable. */
export function invalidateCustomCommandCache(communityId: string): void {
  COMMUNITY_LOAD_CACHE.delete(communityId);
}

async function incrementUseCount(rowId: string): Promise<void> {
  const admin = createServiceClient();
  // Fire-and-forget — chat is already posted; counter slop is fine.
  const { error } = await admin.rpc("gs_custom_commands_increment_count", {
    p_id: rowId,
  });
  if (error) {
    // RPC missing (migration not applied) — log and move on. We
    // don't have a safe vanilla-update fallback because a literal
    // SET use_count = use_count + 1 isn't expressible via PostgREST.
    console.error("[customCommands/incrementUseCount] rpc failed", error.message);
  }
}

// ---------------------------------------------------------------------------
// Template rendering — delegates to the unified resolver so this
// surface and events / default commands all share one language.
// ---------------------------------------------------------------------------

async function renderTemplate(
  row: CustomCommandRow,
  cmd: CmdContext,
): Promise<string> {
  // Build a TemplateContext from the chat command context. The
  // streamer + game lookups are skipped unless the template
  // references {streamer} / {game} / {game_key} — keeps the simple
  // `!discord` style command at zero DB cost beyond the heavy-var
  // pre-scan.
  const ctx = await buildContextFromCmd(row.response_tmpl, cmd);

  // Pre-fetch heavy vars (uptime, followage, profile fields) in
  // parallel — the resolver scans both `$name` and `{name}` syntaxes
  // so mixed templates still cost one round trip per distinct var.
  const heavy = await prefetchHeavyVars(row.response_tmpl, ctx);

  const vars: Record<string, string> = {
    ...buildBaseVars(ctx, { count: row.use_count + 1 }),
    ...heavy,
  };

  return renderUnifiedTemplate(row.response_tmpl, vars);
}

/** Build a TemplateContext from the dispatcher's CmdContext, with
 *  the medium-cost {streamer} / {game} / {game_key} lookups gated on
 *  template references so simple commands stay cheap. */
async function buildContextFromCmd(
  template: string,
  cmd: CmdContext,
): Promise<TemplateContext> {
  const needsStreamer = /\$streamer\b|\{streamer\}/.test(template);
  const needsGame = /\$game(_key)?\b|\{game(_key)?\}/.test(template);

  let streamerDisplayName = "";
  let activeGameSlug: string | null = null;

  if (needsStreamer || needsGame) {
    const admin = createServiceClient();
    const [profileRes, sessionRes] = await Promise.all([
      needsStreamer
        ? admin
            .from("users")
            .select("display_name, twitch_username, username")
            .eq("id", cmd.userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      needsGame
        ? findTwitchSessionForUser(cmd.userId, ["active", "test"])
        : Promise.resolve(null),
    ]);
    const profile = profileRes?.data as {
      display_name?: string | null;
      twitch_username?: string | null;
      username?: string | null;
    } | null;
    streamerDisplayName =
      profile?.display_name ??
      profile?.twitch_username ??
      profile?.username ??
      "Streamer";
    const session = sessionRes as { activeGame?: string | null } | null;
    activeGameSlug = session?.activeGame ?? null;
  }

  return {
    senderDisplayName: cmd.senderDisplayName,
    args: cmd.args,
    streamerDisplayName,
    activeGameSlug,
    userId: cmd.userId,
    broadcasterTwitchId: cmd.broadcasterTwitchId,
    senderTwitchId: cmd.senderTwitchId,
  };
}

// formatDuration + resolveHeavyVar + resolveProfileVar moved to
// src/lib/templates/resolver.ts as part of the unification — all
// three surfaces share that implementation now.

// ---------------------------------------------------------------------------
// CRUD primitives used by the chat-side `!commands` handlers
// ---------------------------------------------------------------------------

export async function upsertCustomCommand(args: {
  communityId: string;
  trigger: string;
  responseTmpl: string;
  actor?: ActorTier;
  cooldownSeconds?: number;
  createdByIdentityId?: string | null;
}): Promise<{ ok: boolean; reason?: string; row?: CustomCommandRow }> {
  const admin = createServiceClient();
  const trigger = normalizeTrigger(args.trigger);
  if (!trigger) return { ok: false, reason: "invalid_trigger" };

  const { data, error } = await admin
    .from("gs_custom_commands")
    .upsert(
      {
        community_id: args.communityId,
        trigger,
        response_tmpl: args.responseTmpl,
        actor: args.actor ?? "everyone",
        cooldown_s: args.cooldownSeconds ?? 5,
        created_by: args.createdByIdentityId ?? null,
        enabled: true,
      },
      { onConflict: "community_id,trigger" },
    )
    .select("id, community_id, trigger, response_tmpl, actor, cooldown_s, enabled, use_count")
    .single();
  if (error) {
    return { ok: false, reason: error.message };
  }
  invalidateCustomCommandCache(args.communityId);
  return { ok: true, row: data as CustomCommandRow };
}

export async function deleteCustomCommand(args: {
  communityId: string;
  trigger: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const admin = createServiceClient();
  const trigger = normalizeTrigger(args.trigger);
  if (!trigger) return { ok: false, reason: "invalid_trigger" };
  const { error } = await admin
    .from("gs_custom_commands")
    .delete()
    .eq("community_id", args.communityId)
    .eq("trigger", trigger);
  if (error) return { ok: false, reason: error.message };
  invalidateCustomCommandCache(args.communityId);
  forgetCustomCommand(args.communityId, trigger);
  return { ok: true };
}

export async function deleteCustomCommandById(args: {
  communityId: string;
  id: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const admin = createServiceClient();
  // Look up the trigger so we can unregister the canonical name.
  const { data } = await admin
    .from("gs_custom_commands")
    .select("trigger")
    .eq("community_id", args.communityId)
    .eq("id", args.id)
    .maybeSingle();
  const trigger = (data as { trigger?: string } | null)?.trigger ?? null;
  const { error } = await admin
    .from("gs_custom_commands")
    .delete()
    .eq("community_id", args.communityId)
    .eq("id", args.id);
  if (error) return { ok: false, reason: error.message };
  invalidateCustomCommandCache(args.communityId);
  if (trigger) forgetCustomCommand(args.communityId, trigger);
  return { ok: true };
}

/**
 * Update an existing row by id. Used by the /twitch/commands editor
 * for in-place edits — the streamer can change response text,
 * cooldown, actor tier, or enabled flag without losing the row's
 * `use_count`. Changing the `trigger` is also supported, though
 * trigger changes invalidate the canonical name in the registry —
 * the next dispatcher load picks up the new trigger.
 */
export async function updateCustomCommandById(args: {
  communityId: string;
  id: string;
  trigger?: string;
  responseTmpl?: string;
  actor?: ActorTier;
  cooldownSeconds?: number;
  enabled?: boolean;
}): Promise<{ ok: boolean; reason?: string; row?: CustomCommandRow }> {
  const admin = createServiceClient();
  const update: Record<string, unknown> = {};
  if (args.responseTmpl !== undefined) update.response_tmpl = args.responseTmpl;
  if (args.actor !== undefined) update.actor = args.actor;
  if (args.cooldownSeconds !== undefined) update.cooldown_s = args.cooldownSeconds;
  if (args.enabled !== undefined) update.enabled = args.enabled;
  if (args.trigger !== undefined) {
    const normalized = normalizeTrigger(args.trigger);
    if (!normalized) return { ok: false, reason: "invalid_trigger" };
    update.trigger = normalized;
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, reason: "no_changes" };
  }
  const { data, error } = await admin
    .from("gs_custom_commands")
    .update(update)
    .eq("community_id", args.communityId)
    .eq("id", args.id)
    .select("id, community_id, trigger, response_tmpl, actor, cooldown_s, enabled, use_count")
    .single();
  if (error) return { ok: false, reason: error.message };
  invalidateCustomCommandCache(args.communityId);
  return { ok: true, row: data as CustomCommandRow };
}

/** Full list including disabled rows — for the management UI.
 *  The dispatcher's loader (`loadCustomCommandsForCommunity`) only
 *  reads enabled rows; this is the editor's read path. */
export async function listAllCustomCommandsForCommunity(
  communityId: string,
): Promise<CustomCommandRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_custom_commands")
    .select("id, community_id, trigger, response_tmpl, actor, cooldown_s, enabled, use_count")
    .eq("community_id", communityId)
    .order("trigger", { ascending: true });
  return ((data as CustomCommandRow[] | null) ?? []) as CustomCommandRow[];
}

function normalizeTrigger(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^!/, "");
  if (!/^[a-z0-9_-]{1,32}$/.test(stripped)) return null;
  return `!${stripped}`;
}

// ---------------------------------------------------------------------------
// Seed defaults — applied to a fresh community
// ---------------------------------------------------------------------------

interface SeedRow {
  trigger: string;
  response_tmpl: string;
  actor?: ActorTier;
  cooldown_s?: number;
}

/**
 * The Tier 1 seed library Spec 03 calls out. Streamers see these as
 * pre-populated rows they can edit. The texts are intentionally
 * minimal — the value is the trigger surface being claimed; the
 * streamer customizes the copy. `!roll`/`!choose`/`!8ball` are NOT
 * seeded here because they're built-in registrations (pure-logic) —
 * the table is only for streamer-editable static-text commands.
 */
const SEED_DEFAULTS: SeedRow[] = [
  {
    // Pulls every social platform the streamer has filled in.
    // Empty slots collapse to empty strings so the line stays
    // clean even when only some handles are set.
    trigger: "!socials",
    response_tmpl:
      "Find me online → Twitch: twitch.tv/$twitch · YouTube: $youtube · Twitter: $twitter · Discord: $discord",
  },
  {
    trigger: "!discord",
    response_tmpl: "Discord: $discord",
  },
  {
    trigger: "!youtube",
    response_tmpl: "YouTube: $youtube",
  },
  {
    trigger: "!twitter",
    response_tmpl: "Twitter / X: $twitter",
  },
  {
    trigger: "!so",
    response_tmpl: "Go give @$touser a follow! 🎲",
  },
  {
    trigger: "!uptime",
    response_tmpl: "Stream uptime: $uptime",
  },
  {
    trigger: "!followage",
    response_tmpl: "@$user, your followage: $followage",
  },
  {
    trigger: "!accountage",
    response_tmpl: "@$user, your Twitch account age: $accountage",
  },
];

/** Insert the default rows for a community. Idempotent at the SQL
 *  layer via the (community_id, trigger) unique constraint —
 *  re-running on a community that already has them is a no-op. */
export async function seedDefaultsForCommunity(
  communityId: string,
): Promise<void> {
  const admin = createServiceClient();
  const rows = SEED_DEFAULTS.map((s) => ({
    community_id: communityId,
    trigger: s.trigger,
    response_tmpl: s.response_tmpl,
    actor: s.actor ?? "everyone",
    cooldown_s: s.cooldown_s ?? 5,
    enabled: true,
  }));
  await admin.from("gs_custom_commands").upsert(rows, {
    onConflict: "community_id,trigger",
    ignoreDuplicates: true,
  });
}

// ---------------------------------------------------------------------------
// Resolve community for the caller, used by the !commands handlers
// ---------------------------------------------------------------------------

export async function resolveCommunityForCallerSlug(
  slug: string | null,
): Promise<{ id: string } | null> {
  if (!slug) return null;
  const community = await getCommunityBySlug(slug);
  return community ? { id: community.id } : null;
}
