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
 * Each row is registered into the in-memory CommandDef registry on
 * demand. The dispatcher's first chat-command hit per community
 * loads (or refreshes) all custom rows for that community. Aliases
 * are stamped with `cc:<community_id>:<trigger>` as the canonical
 * name so seed library + built-ins never collide.
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
import {
  getAppAccessToken,
  getFollowedAt,
  getStreamsByUserIds,
  getUserById,
  sendChatMessage,
} from "@/lib/twitch/client";
import { getValidUserAccessToken } from "@/lib/twitch/userToken";
import { getCommunityBySlug } from "@/lib/economy/community";
import {
  registerCommand,
  unregisterCommand,
  type ActorTier,
  type CmdContext,
} from "./registry";

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
const COMMUNITY_REGISTERED_NAMES = new Map<string, Set<string>>(); // community_id → set of registered canonical names
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
 * Idempotent — re-loading the same community refreshes its rows
 * (re-registers triggers that exist, unregisters triggers that have
 * been deleted since last load). The dispatcher calls this with a
 * short TTL so a fresh `!commands add` shows up within ~15s without
 * a server restart.
 *
 * Per-community names are tracked in `COMMUNITY_REGISTERED_NAMES` so
 * the unregister pass touches only this community's entries — other
 * communities' custom commands stay registered.
 */
export async function loadCustomCommandsForCommunity(
  communityId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const lastLoad = COMMUNITY_LOAD_CACHE.get(communityId) ?? 0;
  if (!options.force && Date.now() - lastLoad < CACHE_TTL_MS) return;
  COMMUNITY_LOAD_CACHE.set(communityId, Date.now());

  const rows = await listForCommunity(communityId);
  const nextNames = new Set<string>();
  for (const row of rows) {
    const name = canonicalName(row.community_id, row.trigger);
    nextNames.add(name);
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
    registerCommand({
      name,
      trigger: pathForTrigger(row.trigger),
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

  // Drop commands that have been disabled / deleted since last load.
  const previous = COMMUNITY_REGISTERED_NAMES.get(communityId) ?? new Set<string>();
  for (const name of previous) {
    if (!nextNames.has(name)) {
      unregisterCommand(name);
    }
  }
  COMMUNITY_REGISTERED_NAMES.set(communityId, nextNames);
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
// Template rendering
// ---------------------------------------------------------------------------

const VAR_REGEX = /\$(\w+)/g;

async function renderTemplate(
  row: CustomCommandRow,
  cmd: CmdContext,
): Promise<string> {
  // Resolve `$touser` against the first @mention in args (case-
  // preserving for display), defaulting to the caller's display name.
  const mention = /^@(\S+)/.exec(cmd.args.trim());
  const touser = mention?.[1] ?? cmd.senderDisplayName;
  const nextCount = row.use_count + 1;

  // Scan once for Helix-backed variables so we only pay for the
  // calls that the template actually uses. The `$uptime` /
  // `$followage` / `$accountage` substitutions need Twitch round-
  // trips; everything else is sync.
  const needs = new Set<string>();
  for (const match of row.response_tmpl.matchAll(VAR_REGEX)) {
    needs.add(match[1]);
  }
  const heavyVars = [
    "uptime",
    "followage",
    "accountage",
    ...PROFILE_VARS,
  ] as const;
  const heavyPromises: Record<string, Promise<string>> = {};
  for (const v of heavyVars) {
    if (needs.has(v)) {
      heavyPromises[v] = resolveHeavyVar(v, cmd);
    }
  }
  const resolved = Object.fromEntries(
    await Promise.all(
      Object.entries(heavyPromises).map(async ([k, p]) => [k, await p]),
    ),
  ) as Record<string, string>;

  return row.response_tmpl.replace(VAR_REGEX, (_match, key) => {
    switch (key) {
      case "user":
        return cmd.senderDisplayName;
      case "touser":
        return touser;
      case "random":
        return String(Math.floor(Math.random() * 100));
      case "count":
        return String(nextCount);
      case "uptime":
      case "followage":
      case "accountage":
        return resolved[key] ?? "(unavailable)";
      case "discord":
      case "twitch":
      case "psn":
      case "nso":
      case "xbox":
      case "steam":
      case "epic":
      case "youtube":
      case "twitter":
      case "tiktok":
      case "instagram":
      case "bluesky":
      case "threads":
        // Profile-derived. Empty string when the streamer hasn't
        // connected/set the handle — cleaner than leaking a placeholder.
        return resolved[key] ?? "";
      default:
        return `$${key}`;
    }
  });
}

/**
 * Profile-derived variables — pulled from the streamer's own
 * account (users.gamertags + twitch_connections + linked OAuth).
 * Empty string when the streamer hasn't connected/set that handle,
 * so commands render cleanly without leaking "(not set)" noise.
 */
const PROFILE_VARS = [
  // Gamertags + connections
  "discord",
  "twitch",
  "psn",
  "nso",
  "xbox",
  "steam",
  "epic",
  // Socials
  "youtube",
  "twitter",
  "tiktok",
  "instagram",
  "bluesky",
  "threads",
] as const;
type ProfileVarKey = (typeof PROFILE_VARS)[number];

async function resolveHeavyVar(
  key:
    | "uptime"
    | "followage"
    | "accountage"
    | ProfileVarKey,
  cmd: CmdContext,
): Promise<string> {
  try {
    if (key === "uptime") {
      // Stream's `started_at` from Helix. Returns "not live" when
      // the broadcast isn't currently in the live set.
      const streams = await getStreamsByUserIds([cmd.broadcasterTwitchId]);
      const startedAt = streams[0]?.started_at;
      if (!startedAt) return "not live";
      return formatDuration(Date.now() - Date.parse(startedAt));
    }
    if (key === "followage") {
      const token = await getValidUserAccessToken(cmd.userId);
      const followedAt = await getFollowedAt({
        broadcasterId: cmd.broadcasterTwitchId,
        userId: cmd.senderTwitchId,
        accessToken: token,
      });
      if (!followedAt) return "not following";
      return formatDuration(Date.now() - Date.parse(followedAt));
    }
    if (key === "accountage") {
      // Account creation is on the user resource; an app access
      // token suffices.
      const appToken = await getAppAccessToken();
      const user = await getUserById(cmd.senderTwitchId, appToken);
      if (!user?.created_at) return "unknown";
      return formatDuration(Date.now() - Date.parse(user.created_at));
    }
    // Profile-derived. All pulled in one lookup; we re-call this
    // function per-var but Postgres caches the row, so the cost is
    // one hot read per template render at worst.
    return await resolveProfileVar(key as ProfileVarKey, cmd);
  } catch (err) {
    console.error(`[customCommands] $${key} resolution failed`, err);
    return "(unavailable)";
  }
}

async function resolveProfileVar(
  key: ProfileVarKey,
  cmd: CmdContext,
): Promise<string> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("gamertags, socials, twitch_username, discord_username")
    .eq("id", cmd.userId)
    .maybeSingle();
  if (!profile) return "";

  const gamertags =
    ((profile as { gamertags?: Record<string, string | undefined> | null })
      .gamertags as Record<string, string | undefined> | null) ?? {};
  const socials =
    ((profile as { socials?: Record<string, string | undefined> | null })
      .socials as Record<string, string | undefined> | null) ?? {};

  switch (key) {
    // Connections + gamertags
    case "discord":
      // discord_username column was deprecated in favor of the OAuth
      // identity, but old rows may still have it populated. Prefer
      // the connection's display name when present.
      return (
        ((profile as { discord_username?: string | null }).discord_username) ??
        gamertags.discord ??
        ""
      );
    case "twitch":
      return (
        ((profile as { twitch_username?: string | null }).twitch_username) ??
        gamertags.twitch ??
        ""
      );
    case "psn":
      return gamertags.psn ?? "";
    case "nso":
      return gamertags.nso ?? "";
    case "xbox":
      return gamertags.xbox ?? "";
    case "steam":
      return gamertags.steam ?? "";
    case "epic":
      return gamertags.epic ?? "";
    // Socials
    case "youtube":
      return socials.youtube ?? "";
    case "twitter":
      return socials.twitter ?? "";
    case "tiktok":
      return socials.tiktok ?? "";
    case "instagram":
      return socials.instagram ?? "";
    case "bluesky":
      return socials.bluesky ?? "";
    case "threads":
      return socials.threads ?? "";
    default:
      return "";
  }
}

/**
 * Human-readable duration formatter. Picks the two largest non-zero
 * units (years, months, days, hours, minutes) and joins them.
 * Returns "<1m" for sub-minute durations.
 */
function formatDuration(ms: number): string {
  if (ms <= 0) return "<1m";
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  const totalMonths = Math.floor(totalDays / 30);
  const totalYears = Math.floor(totalDays / 365);

  if (totalYears > 0) {
    const remainingMonths = totalMonths - totalYears * 12;
    return remainingMonths > 0
      ? `${totalYears}y ${remainingMonths}mo`
      : `${totalYears}y`;
  }
  if (totalMonths > 0) {
    const remainingDays = totalDays - totalMonths * 30;
    return remainingDays > 0 ? `${totalMonths}mo ${remainingDays}d` : `${totalMonths}mo`;
  }
  if (totalDays > 0) {
    const remainingHours = totalHours - totalDays * 24;
    return remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
  }
  if (totalHours > 0) {
    const remainingMinutes = totalMinutes - totalHours * 60;
    return remainingMinutes > 0
      ? `${totalHours}h ${remainingMinutes}m`
      : `${totalHours}h`;
  }
  if (totalMinutes > 0) return `${totalMinutes}m`;
  return "<1m";
}

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
  unregisterCommand(canonicalName(args.communityId, trigger));
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
  if (trigger) unregisterCommand(canonicalName(args.communityId, trigger));
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
    response_tmpl: "@$user — your followage: $followage",
  },
  {
    trigger: "!accountage",
    response_tmpl: "@$user — your Twitch account age: $accountage",
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
