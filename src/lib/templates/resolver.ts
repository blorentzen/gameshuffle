/**
 * Unified template resolver — the single source of truth for
 * `{name}` and `$name` substitution across every chat-template
 * surface in GameShuffle:
 *
 *   - Custom commands       (src/lib/twitch/commands/customCommands.ts)
 *   - Default commands      (src/lib/twitch/commands/defaultCommandsFallback.ts)
 *   - Event flavor lines    (src/lib/economy/events/engine.ts)
 *
 * Two syntaxes are interchangeable:
 *
 *   - `$name`  — legacy form (custom commands originated here);
 *                stays supported indefinitely.
 *   - `{name}` — canonical form used everywhere else in
 *                GameShuffle; this is what the inline autocomplete
 *                inserts.
 *
 * Both resolve against the SAME variable map. A `$user` and a
 * `{user}` in the same template both render the caller's display
 * name. Unknown tokens render literally (`$foo` → `$foo`,
 * `{foo}` → `{foo}`) so typos stay visible in chat instead of
 * dropping silently.
 *
 * Three layers of variables compose into the final map:
 *
 *   1. BASE vars — `{user}`, `{streamer}`, `{game}`, `{game_key}`,
 *      `{touser}`, `{random}`, `{count}` (when supplied). Sync,
 *      cheap, surface-independent. Built via `buildBaseVars`.
 *
 *   2. HEAVY vars — `{uptime}`, `{followage}`, `{accountage}` plus
 *      profile / connection / gamertag fields. Each requires a
 *      Helix or DB lookup; pre-scanned and fetched in parallel via
 *      `prefetchHeavyVars` so a template referencing only the
 *      socials doesn't pay for an `{uptime}` call.
 *
 *   3. SURFACE-SPECIFIC vars — events contribute `{from}`, `{to}`,
 *      `{delta}`, `{to_count}`, …; default commands contribute
 *      `{result}` + handler extras. Layered on top of base + heavy
 *      by the surface caller.
 *
 * The caller composes the final map and passes it to
 * `renderTemplate(tpl, vars)`.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getAppAccessToken,
  getFollowedAt,
  getStreamsByUserIds,
  getUserById,
} from "@/lib/twitch/client";
import { getValidUserAccessToken } from "@/lib/twitch/userToken";
import { getGameName } from "@/data/game-registry";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Everything a template surface knows about the firing context.
 * Custom commands fill this from their `CmdContext`; default
 * commands fill it from `DispatchInputs` + the resolved economy
 * context; events fill it from `FireEventArgs` (Twitch fields
 * optional since events can in theory fire from `system` triggers
 * without a chat caller).
 */
export interface TemplateContext {
  /** Caller's display name. */
  senderDisplayName: string;
  /** Raw args from the chat message (after the trigger), used for
   *  default `{touser}` resolution. */
  args: string;
  /** Broadcaster's display name — `{streamer}`. */
  streamerDisplayName: string;
  /** Current game's slug, if any — feeds `{game}` + `{game_key}`. */
  activeGameSlug: string | null;
  /** Streamer's GS user_id — needed by heavy vars that touch the
   *  streamer's profile (gamertags, socials, discord invite). */
  userId?: string;
  /** Broadcaster's Twitch user ID — needed by heavy vars that
   *  touch the live stream (uptime, follow). */
  broadcasterTwitchId?: string;
  /** Sender's Twitch user ID — needed by `{followage}` /
   *  `{accountage}`. */
  senderTwitchId?: string;
}

/** Surface-supplied overrides for variables whose default behavior
 *  doesn't fit. Custom commands pass `count: use_count + 1`; events
 *  with a pre-resolved partner pass that as `touser` so it doesn't
 *  re-parse the @mention from args. */
export interface BaseVarOverrides {
  count?: number;
  touser?: string;
}

// ---------------------------------------------------------------------------
// Heavy var registry
// ---------------------------------------------------------------------------

/** Profile-derived variables — pulled from the streamer's account
 *  (users.gamertags + socials). Empty string when the streamer
 *  hasn't connected/set that handle. */
const PROFILE_VARS = [
  "discord",
  "twitch",
  "psn",
  "nso",
  "xbox",
  "steam",
  "epic",
  "youtube",
  "twitter",
  "tiktok",
  "instagram",
  "bluesky",
  "threads",
  "discord_invite",
] as const;
type ProfileVarKey = (typeof PROFILE_VARS)[number];

const HEAVY_VAR_NAMES = [
  "uptime",
  "followage",
  "accountage",
  ...PROFILE_VARS,
] as const;
type HeavyVarKey = (typeof HEAVY_VAR_NAMES)[number];

// ---------------------------------------------------------------------------
// Base var builder
// ---------------------------------------------------------------------------

/**
 * Build the sync, cheap base variable map. Safe to call without
 * await; the result is a plain Record ready to merge with heavy +
 * surface-specific vars before rendering.
 */
export function buildBaseVars(
  ctx: TemplateContext,
  overrides?: BaseVarOverrides,
): Record<string, string> {
  // Resolve `{touser}` against the first @mention in args (case-
  // preserving for display), defaulting to the caller's display
  // name. Override wins when supplied (e.g. mention events pass the
  // resolved partner identity).
  const mention = /^@(\S+)/.exec(ctx.args.trim());
  const touser = overrides?.touser ?? mention?.[1] ?? ctx.senderDisplayName;
  const map: Record<string, string> = {
    user: ctx.senderDisplayName,
    // `{from}` is the 2-party narrative form of `{user}` — same value,
    // explicit. Set here so event templates can use `{from}/{to}`
    // symmetry and default commands like `!compliment` work
    // identically.
    from: ctx.senderDisplayName,
    touser,
    streamer: ctx.streamerDisplayName,
    game: ctx.activeGameSlug ? getGameName(ctx.activeGameSlug) : "",
    game_key: ctx.activeGameSlug ?? "",
    random: String(Math.floor(Math.random() * 100)),
  };
  if (overrides?.count !== undefined) {
    map.count = String(overrides.count);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Heavy var prefetch
// ---------------------------------------------------------------------------

/**
 * Pre-scan the template for heavy vars (BOTH syntaxes) and fetch
 * them in parallel. Returns the resolved values keyed by var name
 * — merge into the final map before `renderTemplate`.
 *
 * Skips silently when the template doesn't reference any heavy
 * vars (no fetches issued). Returns empty record when the context
 * lacks the Twitch IDs needed for the resolution (e.g. system-
 * triggered events) — the affected variables fall back to empty
 * string after the merge.
 */
export async function prefetchHeavyVars(
  template: string,
  ctx: TemplateContext,
): Promise<Record<string, string>> {
  const needs = new Set<string>();
  for (const match of template.matchAll(/\$(\w+)/g)) needs.add(match[1]);
  for (const match of template.matchAll(/\{(\w+)\}/g)) needs.add(match[1]);

  const toFetch: HeavyVarKey[] = [];
  for (const name of HEAVY_VAR_NAMES) {
    if (needs.has(name)) toFetch.push(name);
  }
  if (toFetch.length === 0) return {};

  // If the heavy resolver doesn't have the Twitch IDs it needs, the
  // individual calls return "(unavailable)" — see resolveHeavyVar.
  const entries = await Promise.all(
    toFetch.map(async (name) => {
      const value = await resolveHeavyVar(name, ctx);
      return [name, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function resolveHeavyVar(
  key: HeavyVarKey,
  ctx: TemplateContext,
): Promise<string> {
  try {
    if (key === "uptime") {
      if (!ctx.broadcasterTwitchId) return "(unavailable)";
      const streams = await getStreamsByUserIds([ctx.broadcasterTwitchId]);
      const startedAt = streams[0]?.started_at;
      if (!startedAt) return "not live";
      return formatDuration(Date.now() - Date.parse(startedAt));
    }
    if (key === "followage") {
      if (!ctx.userId || !ctx.broadcasterTwitchId || !ctx.senderTwitchId) {
        return "(unavailable)";
      }
      const token = await getValidUserAccessToken(ctx.userId);
      const followedAt = await getFollowedAt({
        broadcasterId: ctx.broadcasterTwitchId,
        userId: ctx.senderTwitchId,
        accessToken: token,
      });
      if (!followedAt) return "not following";
      return formatDuration(Date.now() - Date.parse(followedAt));
    }
    if (key === "accountage") {
      if (!ctx.senderTwitchId) return "(unavailable)";
      const appToken = await getAppAccessToken();
      const user = await getUserById(ctx.senderTwitchId, appToken);
      if (!user?.created_at) return "unknown";
      return formatDuration(Date.now() - Date.parse(user.created_at));
    }
    return await resolveProfileVar(key as ProfileVarKey, ctx);
  } catch (err) {
    console.error(`[template-resolver] heavy var "${key}" failed:`, err);
    return "(unavailable)";
  }
}

async function resolveProfileVar(
  key: ProfileVarKey,
  ctx: TemplateContext,
): Promise<string> {
  if (!ctx.userId) return "";
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("gamertags, socials, twitch_username, discord_username")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!profile) return "";

  const gamertags =
    ((profile as { gamertags?: Record<string, string | undefined> | null })
      .gamertags as Record<string, string | undefined> | null) ?? {};
  const socials =
    ((profile as { socials?: Record<string, string | undefined> | null })
      .socials as Record<string, string | undefined> | null) ?? {};

  switch (key) {
    case "discord":
      return (
        (profile as { discord_username?: string | null }).discord_username ??
        gamertags.discord ??
        ""
      );
    case "twitch":
      return (
        (profile as { twitch_username?: string | null }).twitch_username ??
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
    case "discord_invite":
      return socials.discord_invite ?? "";
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Substitute `$name` and `{name}` tokens. Both syntaxes resolve
 * against the same vars record — surface composes the record
 * before calling.
 *
 * Unknown tokens render literally so typos stay visible.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  const resolveKey = (original: string, key: string): string => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return original;
  };
  return template
    .replace(/\$(\w+)/g, (m, k) => resolveKey(m, k))
    .replace(/\{(\w+)\}/g, (m, k) => resolveKey(m, k));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    return remainingDays > 0
      ? `${totalMonths}mo ${remainingDays}d`
      : `${totalMonths}mo`;
  }
  if (totalDays > 0) {
    const remainingHours = totalHours - totalDays * 24;
    return remainingHours > 0
      ? `${totalDays}d ${remainingHours}h`
      : `${totalDays}d`;
  }
  if (totalHours > 0) {
    const remainingMinutes = totalMinutes - totalHours * 60;
    return remainingMinutes > 0
      ? `${totalHours}h ${remainingMinutes}m`
      : `${totalHours}h`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m`;
  }
  return "<1m";
}
